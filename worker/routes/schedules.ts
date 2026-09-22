import { Hono } from 'hono';
import { z } from 'zod';
import { calculateLessonHundredths } from '../../shared/domain';
import { AppError } from '../lib/http';
import { requireAuth, requireRole } from '../middleware/auth';
import type { AppBindings, AuthUser } from '../types';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const validDate = (value: string) => datePattern.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const scheduleInput = z.object({
  teacherId: z.number().int().positive().optional(),
  studentId: z.number().int().positive(),
  subject: z.string().trim().min(1).max(100),
  classDate: z.string().refine(validDate, '日期无效'),
  startTime: z.string().regex(timePattern),
  endTime: z.string().regex(timePattern),
  classroom: z.string().trim().max(100).default(''),
  version: z.number().int().positive().optional(),
});

const filterSchema = z.object({
  teacherId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().refine(validDate, '开始日期无效').optional(),
  dateTo: z.string().refine(validDate, '结束日期无效').optional(),
  subject: z.string().trim().max(100).optional(),
  classroom: z.string().trim().max(100).optional(),
  completed: z.enum(['true', 'false']).optional(),
});

type Filters = z.infer<typeof filterSchema>;

function escapeLike(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function buildWhere(user: AuthUser, filters: Filters, alias = 's') {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (user.role === 'TEACHER') { clauses.push(`${alias}.teacher_id = ?`); params.push(user.id); }
  if (user.role === 'STUDENT') { clauses.push(`${alias}.student_id = ?`); params.push(user.id); }
  if (user.role === 'ADMIN' && filters.teacherId) { clauses.push(`${alias}.teacher_id = ?`); params.push(filters.teacherId); }
  if (user.role !== 'STUDENT' && filters.studentId) { clauses.push(`${alias}.student_id = ?`); params.push(filters.studentId); }
  if (filters.dateFrom) { clauses.push(`${alias}.class_date >= ?`); params.push(filters.dateFrom); }
  if (filters.dateTo) { clauses.push(`${alias}.class_date <= ?`); params.push(filters.dateTo); }
  if (filters.subject) { clauses.push(`${alias}.subject LIKE ? ESCAPE '\\'`); params.push(`%${escapeLike(filters.subject)}%`); }
  if (filters.classroom) { clauses.push(`${alias}.classroom LIKE ? ESCAPE '\\'`); params.push(`%${escapeLike(filters.classroom)}%`); }
  if (filters.completed) { clauses.push(`${alias}.is_completed = ?`); params.push(filters.completed === 'true' ? 1 : 0); }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function parseFilters(query: Record<string, string>) {
  const result = filterSchema.safeParse(query);
  if (!result.success) throw new AppError(422, 'INVALID_FILTERS', '筛选条件无效', result.error.flatten());
  return result.data;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonnegativeInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function scheduleSelect(where: string) {
  return `SELECT s.id, s.teacher_id, s.student_id, s.subject, s.class_date, s.start_time, s.end_time,
    s.lesson_hundredths, s.classroom, s.is_completed, s.version, s.created_at, s.updated_at,
    teacher.display_name AS teacher_name, student.display_name AS student_name
    FROM schedules s
    JOIN users teacher ON teacher.id = s.teacher_id
    JOIN users student ON student.id = s.student_id
    ${where}`;
}

async function getScopedSchedule(db: D1Database, user: AuthUser, id: number) {
  const scope = user.role === 'ADMIN' ? '' : user.role === 'TEACHER' ? 'AND s.teacher_id = ?' : 'AND s.student_id = ?';
  const statement = db.prepare(`${scheduleSelect(`WHERE s.id = ? ${scope}`)}`);
  return (scope ? statement.bind(id, user.id) : statement.bind(id)).first<Record<string, unknown>>();
}

export const schedules = new Hono<AppBindings>();
schedules.use('*', requireAuth);

schedules.get('/', async (c) => {
  const filters = parseFilters(c.req.query());
  const user = c.get('user');
  const page = positiveInteger(c.req.query('page'), 1);
  const requested = positiveInteger(c.req.query('pageSize'), 20);
  const pageSize = [10, 20, 50, 100].includes(requested) ? requested : 20;
  const where = buildWhere(user, filters);
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM schedules s ${where.sql}`)
    .bind(...where.params).first<{ total: number }>();
  const result = await c.env.DB.prepare(
    `${scheduleSelect(where.sql)} ORDER BY s.class_date DESC, s.start_time ASC, s.id ASC LIMIT ? OFFSET ?`,
  ).bind(...where.params, pageSize, (page - 1) * pageSize).all();
  return c.json({ data: result.results, meta: { page, pageSize, total: count?.total ?? 0 } });
});

schedules.get('/export-data', async (c) => {
  const filters = parseFilters(c.req.query());
  const user = c.get('user');
  const offset = nonnegativeInteger(c.req.query('offset'), 0);
  const limit = Math.min(1000, positiveInteger(c.req.query('limit'), 500));
  const where = buildWhere(user, filters);
  const idsText = c.req.query('ids');
  if (idsText) {
    const ids = [...new Set(idsText.split(',').map(Number))];
    if (ids.length === 0 || ids.length > 80 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new AppError(422, 'INVALID_IDS', '导出选中记录的 ID 无效');
    }
    where.sql += `${where.sql ? ' AND' : 'WHERE'} s.id IN (${ids.map(() => '?').join(',')})`;
    where.params.push(...ids);
  }
  const result = await c.env.DB.prepare(
    `${scheduleSelect(where.sql)} ORDER BY s.class_date ASC, s.start_time ASC, s.id ASC LIMIT ? OFFSET ?`,
  ).bind(...where.params, limit, offset).all();
  return c.json({ data: result.results, meta: { offset, limit, hasMore: result.results.length === limit } });
});

schedules.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await getScopedSchedule(c.env.DB, c.get('user'), id);
  if (!row) throw new AppError(404, 'SCHEDULE_NOT_FOUND', '排课不存在');
  return c.json({ data: row });
});

schedules.post('/', requireRole('ADMIN', 'TEACHER'), async (c) => {
  const input = scheduleInput.safeParse(await c.req.json());
  if (!input.success) throw new AppError(422, 'VALIDATION_ERROR', '排课信息有误', input.error.flatten());
  const user = c.get('user');
  const teacherId = user.role === 'TEACHER' ? user.id : input.data.teacherId;
  if (!teacherId) throw new AppError(422, 'TEACHER_REQUIRED', '请选择教师');
  const lessonHundredths = calculateLessonHundredths(input.data.startTime, input.data.endTime);
  const result = await c.env.DB.prepare(
    `INSERT INTO schedules
      (teacher_id, student_id, subject, class_date, start_time, end_time, lesson_hundredths, classroom, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(
    teacherId, input.data.studentId, input.data.subject, input.data.classDate,
    input.data.startTime, input.data.endTime, lessonHundredths, input.data.classroom, user.id,
  ).first<{ id: number }>();
  return c.json({ data: { id: result?.id } }, 201);
});

schedules.patch('/:id', requireRole('ADMIN', 'TEACHER'), async (c) => {
  const id = Number(c.req.param('id'));
  const input = scheduleInput.required({ version: true }).safeParse(await c.req.json());
  if (!Number.isSafeInteger(id) || !input.success) throw new AppError(422, 'VALIDATION_ERROR', '排课信息有误');
  const user = c.get('user');
  const existing = await getScopedSchedule(c.env.DB, user, id);
  if (!existing) throw new AppError(404, 'SCHEDULE_NOT_FOUND', '排课不存在');
  const teacherId = user.role === 'TEACHER' ? user.id : input.data.teacherId;
  if (!teacherId) throw new AppError(422, 'TEACHER_REQUIRED', '请选择教师');
  const lessonHundredths = calculateLessonHundredths(input.data.startTime, input.data.endTime);
  const result = await c.env.DB.prepare(
    `UPDATE schedules SET teacher_id = ?, student_id = ?, subject = ?, class_date = ?, start_time = ?,
      end_time = ?, lesson_hundredths = ?, classroom = ?, version = version + 1, updated_at = datetime('now')
     WHERE id = ? AND version = ?`,
  ).bind(
    teacherId, input.data.studentId, input.data.subject, input.data.classDate, input.data.startTime,
    input.data.endTime, lessonHundredths, input.data.classroom, id, input.data.version,
  ).run();
  if ((result.meta.changes ?? 0) === 0) throw new AppError(409, 'VERSION_CONFLICT', '排课已被其他人修改，请刷新后重试');
  return c.json({ data: { success: true } });
});

schedules.patch('/:id/completion', requireRole('ADMIN', 'TEACHER'), async (c) => {
  const id = Number(c.req.param('id'));
  const input = z.object({ completed: z.boolean(), version: z.number().int().positive() }).safeParse(await c.req.json());
  if (!Number.isSafeInteger(id) || !input.success) throw new AppError(422, 'VALIDATION_ERROR', '完课状态无效');
  const user = c.get('user');
  const existing = await getScopedSchedule(c.env.DB, user, id);
  if (!existing) throw new AppError(404, 'SCHEDULE_NOT_FOUND', '排课不存在');
  if (Boolean(existing.is_completed) === input.data.completed) return c.json({ data: existing });
  const result = await c.env.DB.prepare(
    "UPDATE schedules SET is_completed = ?, version = version + 1, updated_at = datetime('now') WHERE id = ? AND version = ?",
  ).bind(input.data.completed ? 1 : 0, id, input.data.version).run();
  if ((result.meta.changes ?? 0) === 0) {
    const latest = await getScopedSchedule(c.env.DB, user, id);
    if (latest && Boolean(latest.is_completed) === input.data.completed) return c.json({ data: latest });
    throw new AppError(409, 'VERSION_CONFLICT', '排课已被其他人修改，请刷新后重试');
  }
  return c.json({ data: await getScopedSchedule(c.env.DB, user, id) });
});

schedules.delete('/:id', requireRole('ADMIN', 'TEACHER'), async (c) => {
  const id = Number(c.req.param('id'));
  const user = c.get('user');
  const clause = user.role === 'TEACHER' ? 'AND teacher_id = ?' : '';
  const statement = c.env.DB.prepare(`DELETE FROM schedules WHERE id = ? ${clause}`);
  const result = await (clause ? statement.bind(id, user.id) : statement.bind(id)).run();
  if ((result.meta.changes ?? 0) === 0) throw new AppError(404, 'SCHEDULE_NOT_FOUND', '排课不存在');
  return c.json({ data: { success: true } });
});

schedules.post('/bulk-delete', requireRole('ADMIN'), async (c) => {
  const schema = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('ids'), ids: z.array(z.number().int().positive()).min(1).max(500) }),
    z.object({ mode: z.literal('filtered'), filters: filterSchema, expectedCount: z.number().int().nonnegative() }),
  ]);
  const input = schema.safeParse(await c.req.json());
  if (!input.success) throw new AppError(422, 'VALIDATION_ERROR', '批量删除参数无效');
  if (input.data.mode === 'ids') {
    const unique = [...new Set(input.data.ids)];
    const chunks = Array.from({ length: Math.ceil(unique.length / 80) }, (_, index) => unique.slice(index * 80, index * 80 + 80));
    const results = await c.env.DB.batch(chunks.map((ids) =>
      c.env.DB.prepare(`DELETE FROM schedules WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids),
    ));
    return c.json({ data: { deleted: results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0) } });
  }
  const where = buildWhere(c.get('user'), input.data.filters);
  const outerCondition = where.sql ? where.sql.replace(/^WHERE /, '').replaceAll('s.', '') : '1 = 1';
  const result = await c.env.DB.prepare(
    `DELETE FROM schedules
     WHERE (${outerCondition})
       AND (SELECT COUNT(*) FROM schedules s ${where.sql}) = ?`,
  ).bind(...where.params, ...where.params, input.data.expectedCount).run();
  if (input.data.expectedCount === 0 || (result.meta.changes ?? 0) !== input.data.expectedCount) {
    const actual = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM schedules s ${where.sql}`)
      .bind(...where.params).first<{ total: number }>();
    if ((actual?.total ?? 0) !== 0 || (result.meta.changes ?? 0) !== input.data.expectedCount) {
      throw new AppError(409, 'FILTER_COUNT_CHANGED', '筛选结果数量已变化，请重新确认', { actualCount: actual?.total ?? 0 });
    }
  }
  return c.json({ data: { deleted: result.meta.changes ?? 0 } });
});
