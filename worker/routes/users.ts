import { Hono } from 'hono';
import { z } from 'zod';
import type { Role } from '../../shared/domain';
import { AppError } from '../lib/http';
import { hashPassword } from '../lib/security';
import { requireAuth, requireRole } from '../middleware/auth';
import type { AppBindings } from '../types';

const adminOnly = [requireAuth, requireRole('ADMIN')] as const;

const createUserSchema = z.object({
  username: z.string().trim().min(1).max(40),
  password: z.string().min(8).max(128),
  role: z.enum(['ADMIN', 'TEACHER', 'STUDENT']),
  subject: z.string().trim().max(100).optional(),
  school: z.string().trim().max(100).optional(),
  grade: z.string().trim().max(50).optional(),
});

const editUserSchema = z.object({
  username: z.string().trim().min(1).max(40),
  subject: z.string().trim().max(100).optional(),
  school: z.string().trim().max(100).optional(),
  grade: z.string().trim().max(50).optional(),
});

export const users = new Hono<AppBindings>();

users.get('/', ...adminOnly, async (c) => {
  const role = c.req.query('role') as Role | undefined;
  const search = c.req.query('search')?.trim() ?? '';
  const status = c.req.query('status');
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const pageSize = Math.min(100, Math.max(10, Number(c.req.query('pageSize') ?? 20)));
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (role && ['ADMIN', 'TEACHER', 'STUDENT'].includes(role)) { clauses.push('u.role = ?'); params.push(role); }
  if (status && ['ACTIVE', 'DISABLED'].includes(status)) { clauses.push('u.status = ?'); params.push(status); }
  if (search) { clauses.push('u.username LIKE ? ESCAPE \'\\\''); params.push(`%${search.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM users u ${where}`).bind(...params).first<{ total: number }>();
  const result = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.role, u.status, u.created_at,
      tp.subject, sp.school, sp.grade, sp.remaining_hundredths
     FROM users u
     LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     ${where}
     ORDER BY u.status ASC, u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`,
  ).bind(...params, pageSize, (page - 1) * pageSize).all();
  return c.json({ data: result.results, meta: { page, pageSize, total: count?.total ?? 0 } });
});

users.post('/', ...adminOnly, async (c) => {
  const input = createUserSchema.safeParse(await c.req.json());
  if (!input.success) throw new AppError(422, 'VALIDATION_ERROR', '用户信息有误', input.error.flatten());
  const username = input.data.username.trim();
  const passwordHash = await hashPassword(input.data.password);
  const created = await c.env.DB.prepare(
    'INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id',
  ).bind(username, username, passwordHash, input.data.role).first<{ id: number }>();
  if (!created) throw new Error('创建用户失败');
  if (input.data.role === 'TEACHER') {
    await c.env.DB.prepare('INSERT INTO teacher_profiles (user_id, subject) VALUES (?, ?)')
      .bind(created.id, input.data.subject ?? '').run();
  }
  if (input.data.role === 'STUDENT') {
    await c.env.DB.prepare('INSERT INTO student_profiles (user_id, school, grade) VALUES (?, ?, ?)')
      .bind(created.id, input.data.school ?? '', input.data.grade ?? '').run();
  }
  return c.json({ data: { id: created.id } }, 201);
});

users.patch('/:id', ...adminOnly, async (c) => {
  const id = Number(c.req.param('id'));
  const input = editUserSchema.safeParse(await c.req.json());
  if (!Number.isSafeInteger(id) || !input.success) throw new AppError(422, 'VALIDATION_ERROR', '用户信息有误');
  const existing = await c.env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(id).first<{ role: Role }>();
  if (!existing) throw new AppError(404, 'USER_NOT_FOUND', '用户不存在');
  const statements = [
    c.env.DB.prepare("UPDATE users SET username = ?, display_name = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(input.data.username, input.data.username, id),
  ];
  if (existing.role === 'TEACHER') statements.push(
    c.env.DB.prepare('UPDATE teacher_profiles SET subject = ? WHERE user_id = ?').bind(input.data.subject ?? '', id),
  );
  if (existing.role === 'STUDENT') statements.push(
    c.env.DB.prepare('UPDATE student_profiles SET school = ?, grade = ? WHERE user_id = ?')
      .bind(input.data.school ?? '', input.data.grade ?? '', id),
  );
  await c.env.DB.batch(statements);
  return c.json({ data: { success: true } });
});

users.patch('/:id/status', ...adminOnly, async (c) => {
  const id = Number(c.req.param('id'));
  const input = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) }).safeParse(await c.req.json());
  if (!Number.isSafeInteger(id) || !input.success) throw new AppError(422, 'VALIDATION_ERROR', '状态无效');
  const target = await c.env.DB.prepare('SELECT role, status FROM users WHERE id = ?').bind(id).first<{ role: Role; status: string }>();
  if (!target) throw new AppError(404, 'USER_NOT_FOUND', '用户不存在');
  if (input.data.status === 'DISABLED') {
    if (id === c.get('user').id) throw new AppError(409, 'CANNOT_DISABLE_SELF', '不能停用当前登录的管理员');
    if (target.role === 'ADMIN' && target.status === 'ACTIVE') {
      const count = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'")
        .first<{ total: number }>();
      if ((count?.total ?? 0) <= 1) throw new AppError(409, 'LAST_ADMIN', '不能停用最后一个启用的管理员');
    }
  }
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(input.data.status, id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
  ]);
  return c.json({ data: { success: true } });
});

users.post('/:id/password', ...adminOnly, async (c) => {
  const id = Number(c.req.param('id'));
  const input = z.object({ password: z.string().min(8).max(128) }).safeParse(await c.req.json());
  if (!Number.isSafeInteger(id) || !input.success) throw new AppError(422, 'VALIDATION_ERROR', '密码至少 8 位');
  const hash = await hashPassword(input.data.password);
  const result = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").bind(hash, id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
  ]);
  if ((result[0].meta.changes ?? 0) === 0) throw new AppError(404, 'USER_NOT_FOUND', '用户不存在');
  return c.json({ data: { success: true } });
});

users.get('/:id/adjustments', ...adminOnly, async (c) => {
  const id = Number(c.req.param('id'));
  const result = await c.env.DB.prepare(
    `SELECT a.id, a.amount_hundredths, a.note, a.created_at, u.display_name AS operator_name
     FROM lesson_adjustments a JOIN users u ON u.id = a.operator_id
     WHERE a.student_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 20`,
  ).bind(id).all();
  return c.json({ data: result.results });
});

users.post('/:id/adjust-hours', ...adminOnly, async (c) => {
  const studentId = Number(c.req.param('id'));
  const input = z.object({ amountHundredths: z.number().int().refine((value) => value !== 0), note: z.string().trim().min(1).max(200) })
    .safeParse(await c.req.json());
  if (!Number.isSafeInteger(studentId) || !input.success) throw new AppError(422, 'VALIDATION_ERROR', '调整数量和备注不能为空');
  const student = await c.env.DB.prepare(
    "SELECT u.id FROM users u JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = ? AND u.role = 'STUDENT'",
  ).bind(studentId).first();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', '学生不存在');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE student_profiles SET remaining_hundredths = remaining_hundredths + ? WHERE user_id = ?')
      .bind(input.data.amountHundredths, studentId),
    c.env.DB.prepare('INSERT INTO lesson_adjustments (student_id, operator_id, amount_hundredths, note) VALUES (?, ?, ?, ?)')
      .bind(studentId, c.get('user').id, input.data.amountHundredths, input.data.note),
  ]);
  const balance = await c.env.DB.prepare('SELECT remaining_hundredths FROM student_profiles WHERE user_id = ?')
    .bind(studentId).first<{ remaining_hundredths: number }>();
  return c.json({ data: { remainingHundredths: balance?.remaining_hundredths ?? 0 } });
});

