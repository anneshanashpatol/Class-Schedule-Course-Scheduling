import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function passwordHash(password) {
  const salt = randomBytes(16);
  const iterations = 210_000;
  return `pbkdf2-sha256$${iterations}$${salt.toString('base64')}$${pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('base64')}`;
}

const accounts = [
  ['e2e_admin', 'ADMIN'],
  ['e2e_王老师', 'TEACHER'],
  ['e2e_张三', 'STUDENT'],
  ['e2e_李四', 'STUDENT'],
  ['e2e_王五', 'STUDENT'],
  ['e2e_赵六', 'STUDENT'],
  ['e2e_待删除', 'STUDENT'],
];
const values = accounts.map(([name, role]) => `('${name}', '${name}', '${passwordHash('e2e-pass-123')}', '${role}')`).join(',\n');
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const sql = `
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%' OR display_name LIKE 'e2e_%');
DELETE FROM lesson_adjustments WHERE student_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%' OR display_name LIKE 'e2e_%');
DELETE FROM schedules
WHERE teacher_name LIKE 'e2e_%'
  OR EXISTS (
    SELECT 1 FROM schedule_students ss
    WHERE ss.schedule_id = schedules.id AND ss.student_name LIKE 'e2e_%'
  );
DELETE FROM teacher_profiles WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%' OR display_name LIKE 'e2e_%');
DELETE FROM student_profiles WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e_%' OR display_name LIKE 'e2e_%');
DELETE FROM users WHERE username LIKE 'e2e_%' OR display_name LIKE 'e2e_%';
INSERT INTO users (username, display_name, password_hash, role) VALUES ${values};
UPDATE teacher_profiles SET subject = '数学、物理' WHERE user_id = (SELECT id FROM users WHERE username = 'e2e_王老师');
UPDATE student_profiles SET school = '青禾中学', grade = '初三', remaining_hundredths = 1000 WHERE user_id = (SELECT id FROM users WHERE username = 'e2e_张三');
INSERT INTO schedules (teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, classroom, created_by)
SELECT 'e2e_王老师', 'E2E历史课程', '${today}', '14:00', '15:30', 150, 'E2E-H201', admin.id
FROM users admin WHERE admin.username = 'e2e_admin';
INSERT INTO schedule_students (schedule_id, student_name, position)
SELECT schedule.id, 'e2e_张三', 0 FROM schedules schedule
WHERE schedule.subject = 'E2E历史课程';
INSERT INTO schedule_students (schedule_id, student_name, position)
SELECT schedule.id, 'e2e_待删除', 1 FROM schedules schedule
WHERE schedule.subject = 'E2E历史课程';
`;
const sqlFile = join(tmpdir(), `course-scheduler-e2e-${process.pid}.sql`);

try {
  writeFileSync(sqlFile, sql, { encoding: 'utf8', mode: 0o600 });
  const wranglerCli = join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const result = spawnSync(process.execPath, [wranglerCli, 'd1', 'execute', 'course-scheduler-db', '--local', '--file', sqlFile], { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
} finally {
  rmSync(sqlFile, { force: true });
}
