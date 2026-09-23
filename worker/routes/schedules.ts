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
  teacherName: z.string().trim().min(1).max(40).optional(),
  studentNames: z.array(z.string().trim().min(1).max(40)).min(1).max(50),
  subject: z.string().trim().min(1).max(100),
  classDate: z.string().refine(validDate, '日期无效'),
  startTime: z.string().regex(timePattern),
  endTime: z.string().regex(timePattern),
  classroom: z.string().trim().max(100).default(''),
  version: z.number().int().positive().optional(),
});

const filterSchema = z.object({
  teacherName: z.string().trim().min(1).max(40).optional(),
  studentName: z.string().trim().min(1).max(40).optional(),
  teacherId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().refine(validDate, '开始日期无效').optional(),
  dateTo: z.string().refine(validDate, '结束日期无效').optional(),
  subject: z.string().trim().max(100).optional(),
  classroom: z.string().trim().max(100).optional(),
  completed: z.enum(['true', 'false']).optional(),
});

type Filters = z.infer<typeof filterSchema>;
type ScheduleRow = Record<string, unknown> & {
  id: number;
  is_completed: number;
  student_names_json: string;
};

function uniqueNames(names: string[]) {
  const seen = new Set<string>();
  return names.map((name) => name.trim()).filter((name) => {
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameMembers(left: string[], right: string[]) {
  const normalized = (names: string[]) => names.map((name) => name.toLocaleLowerCase()).sort();
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

function escapeLike(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function buildWhere(user: AuthUser, filters: Filters, alias = 's') {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const fullyMatched = `EXISTS (
    SELECT 1 FROM users matched_teacher
    WHERE matched_teacher.role = 'TEACHER' AND matched_teacher.status = 'ACTIVE' AND matched_teacher.deleted_at IS NULL
      AND matched_teacher.display_name = ${alias}.teacher_name COLLATE NOCASE
  ) AND NOT EXISTS (
    SELECT 1 FROM schedule_students required_student
    WHERE required_student.schedule_id = ${alias}.id AND NOT EXISTS (
      SELECT 1 FROM users matched_student
      WHERE matched_student.role = 'STUDENT' AND matched_student.status = 'ACTIVE' AND matched_student.deleted_at IS NULL
        AND matched_student.display_name = required_student.student_name COLLATE NOCASE
    )
  )`;
  if (user.role === 'TEACHER') {
    clauses.push(`${alias}.teacher_name = ? COLLATE NOCASE`);
    params.push(user.displayName);
    clauses.push(fullyMatched);
  }
  if (user.role === 'STUDENT') {
    clauses.push(`EXISTS (SELECT 1 FROM schedule_students scoped_students WHERE scoped_students.schedule_id = ${alias}.id AND scoped_students.student_name = ? COLLATE NOCASE)`);
    params.push(user.displayName);
    clauses.push(fullyMatched);
  }
  if (user.role === 'ADMIN' && filters.teacherName) {
    clauses.push(`${alias}.teacher_name = ? COLLATE NOCASE`);
    params.push(filters.teacherName);
  } else if (user.role === 'ADMIN' && filters.teacherId) {
    clauses.push(`${alias}.teacher_name = (SELECT display_name FROM users WHERE id = ?) COLLATE NOCASE`);
    params.push(filters.teacherId);
  }
  if (user.role !== 'STUDENT' && filters.studentName) {
    clauses.push(`EXISTS (SELECT 1 FROM schedule_students filtered_students WHERE filtered_students.schedule_id = ${alias}.id AND filtered_students.student_name = ? COLLATE NOCASE)`);
    params.push(filters.studentName);
  } else if (user.role !== 'STUDENT' && filters.studentId) {
    clauses.push(`EXISTS (SELECT 1 FROM schedule_students filtered_students WHERE filtered_students.schedule_id = ${alias}.id AND filtered_students.student_name = (SELECT display_name FROM users WHERE id = ?) COLLATE NOCASE)`);
    params.push(filters.studentId);
  }
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
  return `SELECT s.id, s.subject, s.class_date, s.start_time, s.end_time,
    s.lesson_hundredths, s.classroom, s.is_completed, s.version, s.created_at, s.updated_at,
    s.teacher_name, s.student_name,
    COALESCE((SELECT json_group_array(student_name) FROM (
      SELECT ss.student_name FROM schedule_students ss
      WHERE ss.schedule_id = s.id ORDER BY ss.position
    )), '[]') AS student_names_json
    FROM schedules s
    ${where}`;
}

function normalizeSchedule(row: ScheduleRow) {
  const { student_names_json, ...rest } = row;
  return {
    ...rest,
    student_names: JSON.parse(student_names_json) as string[],
  };
}

async function getScopedSchedule(db: D1Database, user: AuthUser, id: number) {
  const filters = buildWhere(user, {});
  const idClause = filters.sql ? `${filters.sql} AND s.id = ?` : 'WHERE s.id = ?';
  const row = await db.prepare(scheduleSelect(idClause)).bind(...filters.params, id).first<ScheduleRow>();
  return row ? normalizeSchedule(row) : null;
}

function studentInsert(db: D1Database, scheduleIdSql: string, studentNames: string[], scheduleId?: number) {
  const statement = db.prepare(
    `INSERT INTO schedule_students (schedule_id, student_name, position) VALUES ${studentNames.map((_, index) => `(${scheduleIdSql}, ?, ${index})`).join(', ')}`,
  );
  return scheduleId === undefined
    ? statement.bind(...studentNames)
    : statement.bind(...studentNames.flatMap((studentName) => [scheduleId, studentName]));
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
  ).bind(...where.params, pageSize, (page - 1) * pageSize).all<ScheduleRow>();
  return c.json({ data: result.results.map(normalizeSchedule), meta: { page, pageSize, total: count?.total ?? 0 } });
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
  ).bind(...where.params, limit, offset).all<ScheduleRow>();
  return c.json({ data: result.results.map(normalizeSchedule), meta: { offset, limit, hasMore: result.results.length === limit } });
});

schedules.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isSafeInteger(id)) throw new AppError(422, 'VALIDATION_ERROR', '排课 ID 无效');
  const row = await getScopedSchedule(c.env.DB, c.get('user'), id);
  if (!row) throw new AppError(404, 'SCHEDULE_NOT_FOUND', '排课不存在');
  return c.json({ data: row });
});

schedules.post('/', requireRole('ADMIN', 'TEACHER'), async (c) => {
  const input = scheduleInput.safeParse(await c.req.json());
  if (!input.success) throw new AppError(422, 'VALIDATION_ERROR', '排课信息有误', input.error.flatten());
  const user = c.get('user');
  const teacherName = user.role === 'TEACHER' ? user.displayName : input.data.teacherName;
  if (!teacherName) throw new AppError(422, 'TEACHER_REQUIRED', '请输入教师姓名');
  const studentNames = uniqueNames(input.data.studentNames);
  const lessonHundredths = calculateLessonHundredths(input.data.startTime, input.data.endTime);
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO schedules
        (teacher_name, student_name, subject, class_date, start_time, end_time, lesson_hundredths, classroom, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      teacherName, studentNames[0], input.data.subject, input.data.classDate,
      input.data.startTime, input.data.endTime, lessonHundredths, input.data.classroom, user.id,
    ),
    studentInsert(c.env.DB, 'last_insert_rowid()', studentNames),
  ]);
  return c.json({ data: { id: Number(results[0].meta.last_row_id) } }, 201);
});

schedules.patch('/:id', requireRole('ADMIN', 'TEACHER'), async (c) => {
  const id = Number(c.req.param('id'));
  const input = scheduleInput.safeParse(await c.req.json());
  if (!Number.isSafeInteger(id) || !input.success || !input.data.version) {
    throw new AppError(422, 'VALIDATION_ERROR', '排课信息有误', input.success ? undefined : input.error.flatten());
  }
  const user = c.get('user');
  const existing = await getScopedSchedule(c.env.DB, user, id);
  if (!existing) throw new AppError(404, 'SCHEDULE_NOT_FOUND', '排课不存在');
  const teacherName = user.role === 'TEACHER' ? user.displayName : input.data.teacherName;
  if (!teacherName) throw new AppError(422, 'TEACHER_REQUIRED', '请输入教师姓名');
  const studentNames = uniqueNames(input.data.studentNames);
  const existingStudentNames = existing.student_names as string[];
  const membershipChanged = !sameMembers(existingStudentNames, studentNames);
  if (membershipChanged && Boolean(existing.is_completed)) {
    throw new AppError(409, 'COMPLETED_SCHEDULE_LOCKED', '已完课课程需先取消完课才能修改学生和时间');
  }
  const lessonHundredths = calculateLessonHundredths(input.data.startTime, input.data.endTime);
  const update = c.env.DB.prepare(
    `UPDATE schedules SET teacher_name = ?, student_name = ?, subject = ?, class_date = ?, start_time = ?,
      end_time = ?, lesson_hundredths = ?, classroom = ?, version = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).bind(
    teacherName, studentNames[0], input.data.subject, input.data.classDate, input.data.startTime,
    input.data.endTime, lessonHundredths, input.data.classroom, input.data.version + 1, id,
  );
  const statements = membershipChanged
    ? [
      c.env.DB.prepare('DELETE FROM schedule_students WHERE schedule_id = ?').bind(id),
      update,
      studentInsert(c.env.DB, '?', studentNames, id),
    ]
    : [update];
  const results = await c.env.DB.batch(statements);
  const updateResult = results[membershipChanged ? 1 : 0];
  if ((updateResult.meta.changes ?? 0) === 0) throw new AppError(409, 'VERSION_CONFLICT', '排课已被其他人修改，请刷新后重试');
  return c.json({ data: await getScopedSchedule(c.env.DB, user, id) });
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
  if (!Number.isSafeInteger(id)) throw new AppError(422, 'VALIDATION_ERROR', '排课 ID 无效');
  const user = c.get('user');
  const clause = user.role === 'TEACHER' ? 'AND teacher_name = ? COLLATE NOCASE' : '';
  const statement = c.env.DB.prepare(`DELETE FROM schedules WHERE id = ? ${clause}`);
  const result = await (clause ? statement.bind(id, user.displayName) : statement.bind(id)).run();
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
  const outerCondition = where.sql ? where.sql.replace(/^WHERE /, '') : '1 = 1';
  const result = await c.env.DB.prepare(
    `DELETE FROM schedules AS s
     WHERE (${outerCondition})
       AND (SELECT COUNT(*) FROM schedules counted ${where.sql.replaceAll('s.', 'counted.')}) = ?`,
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
