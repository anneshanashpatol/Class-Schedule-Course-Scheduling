import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Role } from '../../shared/domain';
import { AppError } from '../lib/http';
import { sha256 } from '../lib/security';
import type { AppBindings, AuthUser } from '../types';

type UserRow = {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  token_hash: string;
};

export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const token = getCookie(c, 'session');
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', '请先登录');
  const tokenHash = await sha256(token);
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.username, u.display_name, u.role, u.status, s.token_hash
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
  ).bind(tokenHash).first<UserRow>();
  if (!row || row.status !== 'ACTIVE') throw new AppError(401, 'SESSION_EXPIRED', '登录已失效，请重新登录');
  const user: AuthUser = {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
  };
  c.set('user', user);
  c.set('sessionTokenHash', tokenHash);
  await next();
});

export function requireRole(...roles: Role[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const user = c.get('user');
    if (!roles.includes(user.role)) throw new AppError(403, 'FORBIDDEN', '没有权限执行此操作');
    await next();
  });
}

export const protectWrites = createMiddleware<AppBindings>(async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return next();
  const fetchSite = c.req.header('Sec-Fetch-Site');
  if (fetchSite === 'cross-site') throw new AppError(403, 'CROSS_SITE_REQUEST', '拒绝跨站请求');
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) {
    throw new AppError(403, 'INVALID_ORIGIN', '请求来源无效');
  }
  await next();
});

