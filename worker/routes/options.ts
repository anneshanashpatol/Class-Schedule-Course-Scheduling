import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { AppBindings } from '../types';

export const options = new Hono<AppBindings>();

options.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const students = user.role === 'STUDENT'
    ? { results: [] }
    : await c.env.DB.prepare(
      `SELECT id, display_name AS name, status FROM users
       WHERE role = 'STUDENT' ${user.role === 'TEACHER' ? "AND status = 'ACTIVE'" : ''}
       ORDER BY status ASC, display_name COLLATE NOCASE`,
    ).all();
  const teachers = user.role === 'ADMIN'
    ? await c.env.DB.prepare(
      `SELECT u.id, u.display_name AS name, u.status, tp.subject FROM users u
       JOIN teacher_profiles tp ON tp.user_id = u.id
       WHERE u.role = 'TEACHER' ORDER BY u.status ASC, u.display_name COLLATE NOCASE`,
    ).all()
    : { results: [] };
  return c.json({ data: { students: students.results, teachers: teachers.results } });
});
