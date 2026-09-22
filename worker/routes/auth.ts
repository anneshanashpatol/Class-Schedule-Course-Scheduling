import { Hono, type Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { AppError } from '../lib/http';
import { createSessionToken, hashPassword, sha256, verifyPassword } from '../lib/security';
import { requireAuth } from '../middleware/auth';
import type { AppBindings } from '../types';

const credentialsSchema = z.object({
  username: z.string().trim().min(1, '请输入姓名').max(40),
  password: z.string().min(5, '密码至少 5 位').max(128),
});

const registerSchema = credentialsSchema.extend({
  role: z.enum(['TEACHER', 'STUDENT']),
});

function cookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'Strict' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  };
}

async function issueSession(c: Context<AppBindings>, userId: number) {
  const token = createSessionToken();
  const tokenHash = await sha256(token);
  await c.env.DB.prepare(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+14 days'))",
  ).bind(userId, tokenHash).run();
  setCookie(c, 'session', token, cookieOptions(c.env.APP_ENV === 'production'));
}

export const auth = new Hono<AppBindings>();

auth.post('/register', async (c) => {
  const input = registerSchema.safeParse(await c.req.json());
  if (!input.success) throw new AppError(422, 'VALIDATION_ERROR', '注册信息有误', input.error.flatten());
  const username = input.data.username.trim();
  const passwordHash = await hashPassword(input.data.password);
  const token = createSessionToken();
  const tokenHash = await sha256(token);
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)',
    ).bind(username, username, passwordHash, input.data.role),
    c.env.DB.prepare(
      "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (last_insert_rowid(), ?, datetime('now', '+14 days'))",
    ).bind(tokenHash),
  ]);
  const userId = Number(result[0].meta.last_row_id);
  setCookie(c, 'session', token, cookieOptions(c.env.APP_ENV === 'production'));
  return c.json({
    data: {
      id: userId, username, displayName: username, role: input.data.role, status: 'ACTIVE',
      ...(input.data.role === 'TEACHER' ? { subject: '' } : { school: '', grade: '', remainingHundredths: 0 }),
    },
  }, 201);
});

auth.post('/login', async (c) => {
  const input = credentialsSchema.safeParse(await c.req.json());
  if (!input.success) throw new AppError(422, 'VALIDATION_ERROR', '请输入姓名和密码');
  const row = await c.env.DB.prepare(
    'SELECT id, username, display_name, password_hash, role, status, deleted_at FROM users WHERE username = ?',
  ).bind(input.data.username).first<Record<string, string | number>>();
  if (!row || !(await verifyPassword(input.data.password, String(row.password_hash)))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', '姓名或密码错误');
  }
  if (row.status !== 'ACTIVE' || row.deleted_at) throw new AppError(403, 'ACCOUNT_DISABLED', '账号已停用，请联系管理员');
  await issueSession(c, Number(row.id));
  let profile: Record<string, unknown> = {};
  if (row.role === 'TEACHER') {
    profile = await c.env.DB.prepare('SELECT subject FROM teacher_profiles WHERE user_id = ?').bind(row.id).first() ?? {};
  }
  if (row.role === 'STUDENT') {
    const student = await c.env.DB.prepare(
      'SELECT school, grade, remaining_hundredths FROM student_profiles WHERE user_id = ?',
    ).bind(row.id).first<Record<string, unknown>>();
    profile = student ? { school: student.school, grade: student.grade, remainingHundredths: student.remaining_hundredths } : {};
  }
  return c.json({ data: { id: row.id, username: row.username, displayName: row.display_name, role: row.role, status: row.status, ...profile } });
});

auth.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  let profile: Record<string, unknown> = {};
  if (user.role === 'TEACHER') {
    const row = await c.env.DB.prepare('SELECT subject FROM teacher_profiles WHERE user_id = ?').bind(user.id).first();
    profile = row ?? {};
  }
  if (user.role === 'STUDENT') {
    const row = await c.env.DB.prepare(
      'SELECT school, grade, remaining_hundredths FROM student_profiles WHERE user_id = ?',
    ).bind(user.id).first();
    profile = row ? {
      school: row.school,
      grade: row.grade,
      remainingHundredths: row.remaining_hundredths,
    } : {};
  }
  return c.json({ data: { ...user, ...profile } });
});

auth.post('/logout', requireAuth, async (c) => {
  await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(c.get('sessionTokenHash')).run();
  deleteCookie(c, 'session', { path: '/' });
  return c.json({ data: { success: true } });
});

auth.post('/change-password', requireAuth, async (c) => {
  const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(5).max(128) });
  const input = schema.safeParse(await c.req.json());
  if (!input.success) throw new AppError(422, 'VALIDATION_ERROR', '新密码至少 5 位');
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(input.data.currentPassword, row.password_hash))) {
    throw new AppError(401, 'INVALID_PASSWORD', '当前密码错误');
  }
  const hash = await hashPassword(input.data.newPassword);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").bind(hash, user.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
  ]);
  deleteCookie(c, 'session', { path: '/' });
  return c.json({ data: { success: true } });
});
