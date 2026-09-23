import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

async function seedPeople() {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, username, display_name, password_hash, role) VALUES (1, '管理员', '管理员', 'x', 'ADMIN')"),
    env.DB.prepare("INSERT INTO users (id, username, display_name, password_hash, role) VALUES (2, '王老师', '王老师', 'x', 'TEACHER')"),
    env.DB.prepare("INSERT INTO users (id, username, display_name, password_hash, role) VALUES (3, '张三', '张三', 'x', 'STUDENT')"),
    env.DB.prepare("INSERT INTO users (id, username, display_name, password_hash, role) VALUES (4, '李老师', '李老师', 'x', 'TEACHER')"),
    env.DB.prepare("INSERT INTO users (id, username, display_name, password_hash, role) VALUES (5, '李四', '李四', 'x', 'STUDENT')"),
    env.DB.prepare("UPDATE teacher_profiles SET subject = '数学' WHERE user_id = 2"),
    env.DB.prepare("UPDATE teacher_profiles SET subject = '英语' WHERE user_id = 4"),
    env.DB.prepare('UPDATE student_profiles SET remaining_hundredths = 1000 WHERE user_id = 3'),
    env.DB.prepare('UPDATE student_profiles SET remaining_hundredths = 1000 WHERE user_id = 5'),
  ]);
}

async function addMembers(scheduleId: number, ...studentNames: string[]) {
  await env.DB.batch(studentNames.map((studentName, position) => env.DB.prepare(
    'INSERT INTO schedule_students (schedule_id, student_name, position) VALUES (?, ?, ?)',
  ).bind(scheduleId, studentName, position)));
}

describe('D1 排课约束', () => {
  it('完课扣减、重复状态不重复扣减、取消完课返还', async () => {
    await seedPeople();
    await env.DB.prepare(
      `INSERT INTO schedules (id, teacher_name, subject, class_date, start_time, end_time,
       lesson_hundredths, created_by) VALUES (10, '王老师', '数学', '2026-09-22', '09:00', '10:30', 150, 1)`,
    ).run();
    await addMembers(10, '张三', '李四');
    await env.DB.prepare('UPDATE schedules SET is_completed = 1, version = version + 1 WHERE id = 10').run();
    await env.DB.prepare('UPDATE schedules SET is_completed = 1, version = version + 1 WHERE id = 10').run();
    const completedBalances = await env.DB.prepare(
      'SELECT user_id, remaining_hundredths FROM student_profiles WHERE user_id IN (3, 5) ORDER BY user_id',
    ).all<{ user_id: number; remaining_hundredths: number }>();
    expect(completedBalances.results).toEqual([
      { user_id: 3, remaining_hundredths: 850 },
      { user_id: 5, remaining_hundredths: 850 },
    ]);
    await env.DB.prepare('UPDATE schedules SET is_completed = 0, version = version + 1 WHERE id = 10').run();
    const restoredBalances = await env.DB.prepare(
      'SELECT user_id, remaining_hundredths FROM student_profiles WHERE user_id IN (3, 5) ORDER BY user_id',
    ).all<{ user_id: number; remaining_hundredths: number }>();
    expect(restoredBalances.results).toEqual([
      { user_id: 3, remaining_hundredths: 1000 },
      { user_id: 5, remaining_hundredths: 1000 },
    ]);
  });

  it('阻止重叠课程但允许首尾相接', async () => {
    await seedPeople();
    await env.DB.prepare(
      "INSERT INTO schedules (teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, created_by) VALUES ('王老师', '数学', '2026-09-22', '09:00', '10:00', 100, 1)",
    ).run();
    const firstId = Number((await env.DB.prepare('SELECT id FROM schedules ORDER BY id LIMIT 1').first<{ id: number }>())?.id);
    await addMembers(firstId, '张三');
    await expect(env.DB.prepare(
      "INSERT INTO schedules (teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, created_by) VALUES ('王老师', '数学', '2026-09-22', '09:59', '11:00', 102, 1)",
    ).run()).rejects.toThrow('SCHEDULE_CONFLICT');
    await expect(env.DB.prepare(
      "INSERT INTO schedules (teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, created_by) VALUES ('王老师', '数学', '2026-09-22', '10:00', '11:00', 100, 1)",
    ).run()).resolves.toBeDefined();
  });

  it('删除已完课课程不返还课时', async () => {
    await seedPeople();
    await env.DB.prepare(
      "INSERT INTO schedules (id, teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, created_by) VALUES (10, '王老师', '数学', '2026-09-22', '09:00', '10:00', 100, 1)",
    ).run();
    await addMembers(10, '张三', '李四');
    await env.DB.prepare('UPDATE schedules SET is_completed = 1 WHERE id = 10').run();
    await env.DB.prepare('DELETE FROM schedules WHERE id = 10').run();
    const balances = await env.DB.prepare(
      'SELECT user_id, remaining_hundredths FROM student_profiles WHERE user_id IN (3, 5) ORDER BY user_id',
    ).all<{ user_id: number; remaining_hundredths: number }>();
    expect(balances.results).toEqual([
      { user_id: 3, remaining_hundredths: 900 },
      { user_id: 5, remaining_hundredths: 900 },
    ]);
  });

  it('已完课课程锁定学生与时间', async () => {
    await seedPeople();
    await env.DB.prepare(
      "INSERT INTO schedules (id, teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, is_completed, created_by) VALUES (10, '王老师', '数学', '2026-09-22', '09:00', '10:00', 100, 1, 1)",
    ).run();
    await env.DB.prepare('UPDATE schedules SET is_completed = 0 WHERE id = 10').run();
    await addMembers(10, '张三', '李四');
    await env.DB.prepare('UPDATE schedules SET is_completed = 1 WHERE id = 10').run();
    await expect(env.DB.prepare("UPDATE schedules SET start_time = '08:30' WHERE id = 10").run())
      .rejects.toThrow('COMPLETED_SCHEDULE_LOCKED');
  });

  it('健康检查在真实 Worker 运行时返回成功', async () => {
    const response = await SELF.fetch('https://example.com/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: 'ok' } });
  });

  it('数据库阻止停用最后一个启用管理员', async () => {
    await env.DB.prepare("INSERT INTO users (id, username, display_name, password_hash, role) VALUES (1, 'admin', 'admin', 'x', 'ADMIN')").run();
    await expect(env.DB.prepare("UPDATE users SET status = 'DISABLED' WHERE id = 1").run())
      .rejects.toThrow('LAST_ACTIVE_ADMIN');
  });
});
