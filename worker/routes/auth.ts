import { Hono, type Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { AppError } from '../lib/http';
import { createSessionToken, hashPassword, sha256, verifyPassword } from '../lib/security';
import { requireAuth } from '../middleware/auth';
import type { AppBindings } from '../types';

const credentialsSchema = z.object({
  username: z.string().trim().min(1, '请输入姓名').max(40),
  password: z.string().min(8, '密码至少 8 位').max(128),
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
  const insert = await c.env.DB.prepare(
    `INSERT INTO users (username, display_name, password_hash, role)
     VALUES (?, ?, ?, ?) RETURNING id`,
  ).bind(username, username, passwordHash, input.data.role).first<{ id: number }>();
  if (!insert) throw new Error('创建账号失败');
  const profile = input.data.role === 'TEACHER'
    ? c.env.DB.prepare('INSERT INTO teacher_profiles (user_id) VALUES (?)').bind(insert.id)
    : c.env.DB.prepare('INSERT INTO student_profiles (user_id) VALUES (?)').bind(insert.id);
  await profile.run();
  await issueSession(c, insert.id);
  return c.json({ data: { id: insert.id, username, displayName: username, role: input.data.role, status: 'ACTIVE' } }, 201);
});

auth.post('/login', async (c) => {
  const input = credentialsSchema.safeParse(await c.req.json());
  if (!input.success) throw new AppError(422, 'VALIDATION_ERROR', '请输入姓名和密码');
  const row = await c.env.DB.prepare(
    'SELECT id, username, display_name, password_hash, role, status FROM users WHERE username = ?',
  ).bind(input.data.username).first<Record<string, string | number>>();
  if (!row || !(await verifyPassword(input.data.password, String(row.password_hash)))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', '姓名或密码错误');
  }
  if (row.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', '账号已停用，请联系管理员');
  await issueSession(c, Number(row.id));
  return c.json({ data: { id: row.id, username: row.username, displayName: row.display_name, role: row.role, status: row.status } });
});

auth.get('/me', requireAuth, async (c) => c.json({ data: c.get('user') }));

auth.post('/logout', requireAuth, async (c) => {
  await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(c.get('sessionTokenHash')).run();
  deleteCookie(c, 'session', { path: '/' });
  return c.json({ data: { success: true } });
});

auth.post('/change-password', requireAuth, async (c) => {
  const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) });
  const input = schema.safeParse(await c.req.json());
  if (!input.success) throw new AppError(422, 'VALIDATION_ERROR', '新密码至少 8 位');
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(input.data.currentPassword, row.password_hash))) {
    throw new AppError(401, 'INVALID_PASSWORD', '当前密码错误');
  }
  const hash = await hashPassword(input.data.newPassword);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").bind(hash, user.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, c.get('sessionTokenHash')),
  ]);
  return c.json({ data: { success: true } });
});
