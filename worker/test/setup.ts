import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM lesson_adjustments'),
    env.DB.prepare('DELETE FROM schedules'),
    env.DB.prepare('DELETE FROM student_profiles'),
    env.DB.prepare('DELETE FROM teacher_profiles'),
    env.DB.prepare('DELETE FROM users'),
  ]);
});
