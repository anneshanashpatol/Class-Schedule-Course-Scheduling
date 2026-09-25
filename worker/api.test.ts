import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, sha256 } from './lib/security';

const origin = 'https://example.com';

async function seedUser(id: number, name: string, role: 'ADMIN' | 'TEACHER' | 'STUDENT', status = 'ACTIVE') {
  await env.DB.prepare(
    'INSERT INTO users (id, username, display_name, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(id, name, name, 'unused', role, status).run();
  if (role === 'STUDENT') await env.DB.prepare('UPDATE student_profiles SET remaining_hundredths = 1000 WHERE user_id = ?').bind(id).run();
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
    await seedUser(5, '李四', 'STUDENT');
    adminCookie = await cookieFor(1, 'admin-token');
    teacherCookie = await cookieFor(2, 'teacher-token');
    studentCookie = await cookieFor(3, 'student-token');
  });

  it('教师不能新增、编辑或删除课程', async () => {
    const response = await api('/api/schedules', teacherCookie, {
      method: 'POST',
      body: JSON.stringify({
        teacherName: '李老师', studentNames: ['张三'], subject: '数学', classDate: '2026-09-22',
        startTime: '09:00', endTime: '10:00', classroom: 'A101',
      }),
    });
    expect(response.status).toBe(403);
    await env.DB.prepare(
      "INSERT INTO schedules (id, teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, created_by) VALUES (10, '王老师', '数学', '2026-09-22', '09:00', '10:00', 100, 1)",
    ).run();
    expect((await api('/api/schedules/10', teacherCookie, { method: 'PATCH', body: '{}' })).status).toBe(403);
    expect((await api('/api/schedules/10', teacherCookie, { method: 'DELETE' })).status).toBe(403);
  });

  it('学生课程接口只显示教师姓氏', async () => {
    await env.DB.prepare(
      "INSERT INTO schedules (id, teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, created_by) VALUES (10, '丁小明', '数学', '2026-09-22', '09:00', '10:00', 100, 1)",
    ).run();
    await env.DB.prepare("INSERT INTO schedule_students (schedule_id, student_name, position) VALUES (10, '张三', 0)").run();
    for (const path of ['/api/schedules', '/api/schedules/export-data', '/api/schedules/10']) {
      const body = await (await api(path, studentCookie)).json<{ data: { teacher_name: string } | { teacher_name: string }[] }>();
      const schedule = Array.isArray(body.data) ? body.data[0] : body.data;
      expect(schedule.teacher_name).toBe('丁老师');
    }
    const admin = await (await api('/api/schedules/10', adminCookie)).json<{ data: { teacher_name: string } }>();
    expect(admin.data.teacher_name).toBe('丁小明');
  });

  it('无账号姓名可先排课，账号注册后自动获得课程可见性', async () => {
    const created = await api('/api/schedules', adminCookie, {
      method: 'POST',
      body: JSON.stringify({
        teacherName: '未来老师', studentNames: ['未来学生'], subject: '科学', classDate: '2026-09-24',
        startTime: '09:00', endTime: '10:00', classroom: '',
      }),
    });
    expect(created.status).toBe(201);
    expect((await (await api('/api/schedules', adminCookie)).json<{ data: unknown[] }>()).data).toHaveLength(1);
    expect((await (await api('/api/schedules', teacherCookie)).json<{ data: unknown[] }>()).data).toHaveLength(0);
    expect((await (await api('/api/schedules', studentCookie)).json<{ data: unknown[] }>()).data).toHaveLength(0);

    const studentRegistration = await SELF.fetch(`${origin}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ username: '未来学生', password: '12345', role: 'STUDENT' }),
    });
    const studentId = (await studentRegistration.json<{ data: { id: number } }>()).data.id;
    const futureStudentCookie = await cookieFor(studentId, 'future-student-token');
    expect((await (await api('/api/schedules', futureStudentCookie)).json<{ data: unknown[] }>()).data).toHaveLength(1);

    const teacherRegistration = await SELF.fetch(`${origin}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ username: '未来老师', password: '12345', role: 'TEACHER' }),
    });
    const teacherId = (await teacherRegistration.json<{ data: { id: number } }>()).data.id;
    const futureTeacherCookie = await cookieFor(teacherId, 'future-teacher-token');
    expect((await (await api('/api/schedules', futureTeacherCookie)).json<{ data: unknown[] }>()).data).toHaveLength(1);
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

  it('登录 Cookie 可在后续请求中恢复会话', async () => {
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = 1')
      .bind(await hashPassword('admin12345')).run();
    const login = await SELF.fetch(`${origin}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ username: 'admin', password: 'admin12345' }),
    });
    const setCookie = login.headers.get('Set-Cookie') ?? '';
    expect(login.status).toBe(200);
    expect(setCookie).toContain('session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');

    const cookie = setCookie.split(';', 1)[0];
    const me = await api('/api/auth/me', cookie);
    expect(me.status).toBe(200);
  });

  it('重复完课请求只扣减一次余额', async () => {
    await env.DB.prepare(
      "INSERT INTO schedules (id, teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, created_by) VALUES (10, '王老师', '数学', '2026-09-22', '09:00', '10:30', 150, 1)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO schedule_students (schedule_id, student_name, position) VALUES (10, '张三', 0), (10, '李四', 1)",
    ).run();
    const first = await api('/api/schedules/10/completion', teacherCookie, {
      method: 'PATCH', body: JSON.stringify({ completed: true, version: 1 }),
    });
    const second = await api('/api/schedules/10/completion', teacherCookie, {
      method: 'PATCH', body: JSON.stringify({ completed: true, version: 1 }),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const balances = await env.DB.prepare(
      'SELECT user_id, remaining_hundredths FROM student_profiles WHERE user_id IN (3, 5) ORDER BY user_id',
    ).all<{ user_id: number; remaining_hundredths: number }>();
    expect(balances.results).toEqual([
      { user_id: 3, remaining_hundredths: 850 },
      { user_id: 5, remaining_hundredths: 850 },
    ]);
  });

  it('多学生创建失败时原子回滚课程和成员', async () => {
    await env.DB.prepare(
      "INSERT INTO schedules (id, teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, created_by) VALUES (10, '李老师', '英语', '2026-09-22', '09:00', '10:00', 100, 1)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO schedule_students (schedule_id, student_name, position) VALUES (10, '李四', 0)",
    ).run();

    const response = await api('/api/schedules', adminCookie, {
      method: 'POST',
      body: JSON.stringify({
        teacherName: '王老师', studentNames: ['张三', '李四'], subject: '数学', classDate: '2026-09-22',
        startTime: '09:00', endTime: '10:00', classroom: 'A101',
      }),
    });

    expect(response.status).toBe(409);
    expect((await env.DB.prepare('SELECT COUNT(*) AS total FROM schedules').first<{ total: number }>())?.total).toBe(1);
    const members = await env.DB.prepare(
      'SELECT schedule_id, student_name FROM schedule_students ORDER BY schedule_id, position',
    ).all<{ schedule_id: number; student_name: string }>();
    expect(members.results).toEqual([{ schedule_id: 10, student_name: '李四' }]);
  });

  it('多学生更新失败时原子恢复原成员和课程版本', async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO schedules (id, teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, created_by) VALUES (10, '王老师', '数学', '2026-09-22', '09:00', '10:00', 100, 1)",
      ),
      env.DB.prepare(
        "INSERT INTO schedules (id, teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, created_by) VALUES (11, '李老师', '英语', '2026-09-22', '09:00', '10:00', 100, 1)",
      ),
      env.DB.prepare(
        "INSERT INTO schedule_students (schedule_id, student_name, position) VALUES (10, '张三', 0), (11, '李四', 0)",
      ),
    ]);

    const response = await api('/api/schedules/10', adminCookie, {
      method: 'PATCH',
      body: JSON.stringify({
        teacherName: '王老师', studentNames: ['张三', '李四'], subject: '数学', classDate: '2026-09-22',
        startTime: '09:00', endTime: '10:00', classroom: '', version: 1,
      }),
    });

    expect(response.status).toBe(409);
    const schedule = await env.DB.prepare('SELECT version FROM schedules WHERE id = 10')
      .first<{ version: number }>();
    expect(schedule).toEqual({ version: 1 });
    const members = await env.DB.prepare(
      'SELECT student_name, position FROM schedule_students WHERE schedule_id = 10 ORDER BY position',
    ).all<{ student_name: string; position: number }>();
    expect(members.results).toEqual([{ student_name: '张三', position: 0 }]);
  });

  it('成员更新遇到过期版本时不改课程或成员', async () => {
    await env.DB.prepare(
      "INSERT INTO schedules (id, teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, version, created_by) VALUES (10, '王老师', '数学', '2026-09-22', '09:00', '10:00', 100, 2, 1)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO schedule_students (schedule_id, student_name, position) VALUES (10, '张三', 0)",
    ).run();

    const response = await api('/api/schedules/10', adminCookie, {
      method: 'PATCH',
      body: JSON.stringify({
        teacherName: '王老师', studentNames: ['张三', '李四'], subject: '改名后的数学', classDate: '2026-09-22',
        startTime: '09:00', endTime: '10:00', classroom: '', version: 1,
      }),
    });

    expect(response.status).toBe(409);
    const schedule = await env.DB.prepare('SELECT subject, version FROM schedules WHERE id = 10')
      .first<{ subject: string; version: number }>();
    expect(schedule).toEqual({ subject: '数学', version: 2 });
    const members = await env.DB.prepare(
      'SELECT student_name, position FROM schedule_students WHERE schedule_id = 10 ORDER BY position',
    ).all<{ student_name: string; position: number }>();
    expect(members.results).toEqual([{ student_name: '张三', position: 0 }]);
  });

  it('管理员停用账号后立即撤销其会话', async () => {
    const disabled = await api('/api/users/2/status', adminCookie, {
      method: 'PATCH', body: JSON.stringify({ status: 'DISABLED' }),
    });
    expect(disabled.status).toBe(200);
    const me = await api('/api/auth/me', teacherCookie);
    expect(me.status).toBe(401);
  });

  it('修改密码后撤销该用户的全部会话', async () => {
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = 2')
      .bind(await hashPassword('old-password')).run();
    await cookieFor(2, 'teacher-second-token');
    const response = await api('/api/auth/change-password', teacherCookie, {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'old-password', newPassword: 'new-password' }),
    });
    expect(response.status).toBe(200);
    const sessions = await env.DB.prepare('SELECT COUNT(*) AS total FROM sessions WHERE user_id = 2')
      .first<{ total: number }>();
    expect(sessions?.total).toBe(0);
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('管理员可用五位密码重置账号并撤销旧会话', async () => {
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = 2')
      .bind(await hashPassword('old-password')).run();
    await cookieFor(2, 'teacher-second-token');

    const tooShort = await api('/api/users/2/password', adminCookie, {
      method: 'POST', body: JSON.stringify({ password: '1234' }),
    });
    expect(tooShort.status).toBe(422);
    expect((await env.DB.prepare('SELECT COUNT(*) AS total FROM sessions WHERE user_id = 2')
      .first<{ total: number }>())?.total).toBe(2);

    const reset = await api('/api/users/2/password', adminCookie, {
      method: 'POST', body: JSON.stringify({ password: '12345' }),
    });
    expect(reset.status).toBe(200);
    expect((await env.DB.prepare('SELECT COUNT(*) AS total FROM sessions WHERE user_id = 2')
      .first<{ total: number }>())?.total).toBe(0);

    const oldLogin = await SELF.fetch(`${origin}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ username: '王老师', password: 'old-password' }),
    });
    const newLogin = await SELF.fetch(`${origin}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ username: '王老师', password: '12345' }),
    });
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(200);
  });

  it('注册密码至少五位', async () => {
    const short = await SELF.fetch(`${origin}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ username: '短密码', password: '1234', role: 'STUDENT' }),
    });
    const valid = await SELF.fetch(`${origin}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ username: '五位密码', password: '12345', role: 'STUDENT' }),
    });
    expect(short.status).toBe(422);
    expect(valid.status).toBe(201);
  });

  it('注册会原子创建账号、角色资料和登录会话', async () => {
    const response = await SELF.fetch(`${origin}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ username: '新教师', password: '12345', role: 'TEACHER' }),
    });
    const body = await response.json<{ data: { id: number } }>();
    expect(response.status).toBe(201);

    const account = await env.DB.prepare(
      `SELECT u.id, tp.user_id AS profile_user_id,
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS session_count
       FROM users u
       LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
       WHERE u.username = ?`,
    ).bind('新教师').first<{ id: number; profile_user_id: number; session_count: number }>();
    expect(account).toEqual({ id: body.data.id, profile_user_id: body.data.id, session_count: 1 });
  });

  it('删除用户后隐藏账号、撤销会话、保留历史并释放姓名', async () => {
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = 3')
      .bind(await hashPassword('12345')).run();
    await env.DB.prepare(
      "INSERT INTO schedules (id, teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, created_by) VALUES (10, '王老师', '数学', '2026-09-22', '09:00', '10:00', 100, 1)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO schedule_students (schedule_id, student_name, position) VALUES (10, '张三', 0)",
    ).run();

    const deleted = await api('/api/users/3', adminCookie, { method: 'DELETE' });
    expect(deleted.status).toBe(200);
    expect((await env.DB.prepare('SELECT COUNT(*) AS total FROM sessions WHERE user_id = 3')
      .first<{ total: number }>())?.total).toBe(0);

    const deletedUser = await env.DB.prepare(
      'SELECT username, display_name, status, deleted_at FROM users WHERE id = 3',
    ).first<{ username: string; display_name: string; status: string; deleted_at: string | null }>();
    expect(deletedUser?.username).toMatch(/^__deleted__3__[0-9a-f]{32}$/);
    expect(deletedUser?.display_name).toBe('张三');
    expect(deletedUser?.status).toBe('DISABLED');
    expect(deletedUser?.deleted_at).not.toBeNull();

    const list = await api('/api/users', adminCookie);
    const listBody = await list.json<{ data: Array<{ id: number }> }>();
    expect(listBody.data.some((user) => user.id === 3)).toBe(false);

    const history = await api('/api/schedules/10', adminCookie);
    const historyBody = await history.json<{ data: { student_names: string[] } }>();
    expect(history.status).toBe(200);
    expect(historyBody.data.student_names).toEqual(['张三']);

    const login = await SELF.fetch(`${origin}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ username: '张三', password: '12345' }),
    });
    expect(login.status).toBe(401);

    const replacement = await api('/api/users', adminCookie, {
      method: 'POST', body: JSON.stringify({ username: '张三', password: '12345', role: 'STUDENT' }),
    });
    expect(replacement.status).toBe(201);

    const canScheduleByNameWithoutStudentAccount = await api('/api/schedules', adminCookie, {
      method: 'POST',
      body: JSON.stringify({
        teacherName: '李老师', studentNames: ['张三'], subject: '英语', classDate: '2026-09-23',
        startTime: '09:00', endTime: '10:00', classroom: '',
      }),
    });
    expect(canScheduleByNameWithoutStudentAccount.status).toBe(201);

    const deletedTeacher = await api('/api/users/2', adminCookie, { method: 'DELETE' });
    expect(deletedTeacher.status).toBe(200);
    const canScheduleByNameWithoutTeacherAccount = await api('/api/schedules', adminCookie, {
      method: 'POST',
      body: JSON.stringify({
        teacherName: '王老师', studentNames: ['李四'], subject: '数学', classDate: '2026-09-23',
        startTime: '10:00', endTime: '11:00', classroom: '',
      }),
    });
    expect(canScheduleByNameWithoutTeacherAccount.status).toBe(201);
  });

  it('拒绝跨站写请求', async () => {
    const response = await SELF.fetch(`${origin}/api/users/3/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: adminCookie },
      body: JSON.stringify({ status: 'DISABLED' }),
    });
    expect(response.status).toBe(403);
  });

  it('人工课时调整使用请求 ID 保证重复提交幂等', async () => {
    const body = JSON.stringify({ amountHundredths: 125, note: '续费', requestId: 'aabf3441-6240-4d1e-97e1-4a6787829e36' });
    const first = await api('/api/users/3/adjust-hours', adminCookie, { method: 'POST', body });
    const second = await api('/api/users/3/adjust-hours', adminCookie, { method: 'POST', body });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const balance = await env.DB.prepare('SELECT remaining_hundredths FROM student_profiles WHERE user_id = 3')
      .first<{ remaining_hundredths: number }>();
    const records = await env.DB.prepare('SELECT COUNT(*) AS total FROM lesson_adjustments WHERE student_id = 3')
      .first<{ total: number }>();
    expect(balance?.remaining_hundredths).toBe(1125);
    expect(records?.total).toBe(1);
  });

  it('筛选数量变化时不删除任何课程', async () => {
    await env.DB.prepare(
      "INSERT INTO schedules (id, teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, created_by) VALUES (10, '王老师', '数学', '2026-09-22', '09:00', '10:00', 100, 1)",
    ).run();
    const response = await api('/api/schedules/bulk-delete', adminCookie, {
      method: 'POST',
      body: JSON.stringify({ mode: 'filtered', filters: { subject: '数学' }, expectedCount: 0 }),
    });
    expect(response.status).toBe(409);
    expect((await env.DB.prepare('SELECT COUNT(*) AS total FROM schedules').first<{ total: number }>())?.total).toBe(1);
  });
});
