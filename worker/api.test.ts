import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from './lib/security';

const origin = 'https://example.com';

async function seedUser(id: number, name: string, role: 'ADMIN' | 'TEACHER' | 'STUDENT', status = 'ACTIVE') {
  await env.DB.prepare(
    'INSERT INTO users (id, username, display_name, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, name, name, 'unused', role, status).run();
  if (role === 'TEACHER') await env.DB.prepare('INSERT INTO teacher_profiles (user_id) VALUES (?)').bind(id).run();
  if (role === 'STUDENT') await env.DB.prepare('INSERT INTO student_profiles (user_id, remaining_hundredths) VALUES (?, 1000)').bind(id).run();
}

async function cookieFor(userId: number, token: string) {
  await env.DB.prepare(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+1 day'))",
  ).bind(userId, await sha256(token)).run();
  return `session=${token}`;
}

async function api(path: string, cookie: string, init: RequestInit = {}) {
  return SELF.fetch(`${origin}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie, ...init.headers },
  });
}

describe('API 权限与幂等性', () => {
  let adminCookie: string;
  let teacherCookie: string;
  let studentCookie: string;

  beforeEach(async () => {
    await seedUser(1, 'admin', 'ADMIN');
    await seedUser(2, '王老师', 'TEACHER');
    await seedUser(3, '张三', 'STUDENT');
    await seedUser(4, '李老师', 'TEACHER');
    adminCookie = await cookieFor(1, 'admin-token');
    teacherCookie = await cookieFor(2, 'teacher-token');
    studentCookie = await cookieFor(3, 'student-token');
  });

  it('教师伪造其他教师 ID 时仍只能为自己排课', async () => {
    const response = await api('/api/schedules', teacherCookie, {
      method: 'POST',
      body: JSON.stringify({
        teacherId: 4, studentId: 3, subject: '数学', classDate: '2026-09-22',
        startTime: '09:00', endTime: '10:00', classroom: 'A101',
      }),
    });
    expect(response.status).toBe(201);
    const stored = await env.DB.prepare('SELECT teacher_id FROM schedules').first<{ teacher_id: number }>();
    expect(stored?.teacher_id).toBe(2);
  });

  it('学生不能写入排课，教师不能批量删除', async () => {
    const studentWrite = await api('/api/schedules', studentCookie, {
      method: 'POST',
      body: JSON.stringify({ studentId: 3, subject: '数学', classDate: '2026-09-22', startTime: '09:00', endTime: '10:00' }),
    });
    expect(studentWrite.status).toBe(403);
    const teacherBulkDelete = await api('/api/schedules/bulk-delete', teacherCookie, {
      method: 'POST', body: JSON.stringify({ mode: 'ids', ids: [1] }),
    });
    expect(teacherBulkDelete.status).toBe(403);
  });

  it('重复完课请求只扣减一次余额', async () => {
    await env.DB.prepare(
      "INSERT INTO schedules (id, teacher_id, student_id, subject, class_date, start_time, end_time, lesson_hundredths, created_by) VALUES (10, 2, 3, '数学', '2026-09-22', '09:00', '10:30', 150, 1)",
    ).run();
    const first = await api('/api/schedules/10/completion', teacherCookie, {
      method: 'PATCH', body: JSON.stringify({ completed: true, version: 1 }),
    });
    const second = await api('/api/schedules/10/completion', teacherCookie, {
      method: 'PATCH', body: JSON.stringify({ completed: true, version: 1 }),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const balance = await env.DB.prepare('SELECT remaining_hundredths FROM student_profiles WHERE user_id = 3')
      .first<{ remaining_hundredths: number }>();
    expect(balance?.remaining_hundredths).toBe(850);
  });

  it('管理员停用账号后立即撤销其会话', async () => {
    const disabled = await api('/api/users/2/status', adminCookie, {
      method: 'PATCH', body: JSON.stringify({ status: 'DISABLED' }),
    });
    expect(disabled.status).toBe(200);
    const me = await api('/api/auth/me', teacherCookie);
    expect(me.status).toBe(401);
  });

  it('拒绝跨站写请求', async () => {
    const response = await SELF.fetch(`${origin}/api/users/3/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: adminCookie },
      body: JSON.stringify({ status: 'DISABLED' }),
    });
    expect(response.status).toBe(403);
  });
});

