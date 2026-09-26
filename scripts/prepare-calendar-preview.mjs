import { cp, lstat, mkdir, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const preview = resolve(root, '.calendar-preview');
if (preview !== join(root, '.calendar-preview')) throw new Error('预览目录必须位于项目内');
await mkdir(preview, { recursive: true });
for (const name of ['src', 'worker', 'shared', 'migrations', 'scripts', 'index.html', 'package.json', 'wrangler.jsonc', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.worker.json', 'tsconfig.e2e.json', 'e2e']) {
  await cp(join(root, name), join(preview, name), { recursive: true, force: true });
}
const modules = join(preview, 'node_modules');
try { await lstat(modules); } catch { await symlink(join(root, 'node_modules'), modules, 'junction'); }

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: preview, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run([join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply', 'DB', '--local']);
run([join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', '--local', '--command', "DELETE FROM schedules WHERE subject LIKE '预览课%' OR subject LIKE '预览常规%'"]);
run([join(preview, 'scripts/seed-e2e.mjs')]);

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const busyDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
const nextMonday = new Date();
nextMonday.setDate(nextMonday.getDate() + (8 - nextMonday.getDay()) % 7 + (nextMonday.getDay() === 1 ? 7 : 0));
const nextWednesday = new Date(nextMonday);
nextWednesday.setDate(nextWednesday.getDate() + 2);
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
const sql = `
DELETE FROM schedules WHERE subject LIKE '预览课%' OR subject LIKE '预览常规%';
WITH RECURSIVE nums(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM nums WHERE n < 18)
INSERT INTO schedules (teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, classroom, created_by)
SELECT substr('王李张刘陈杨赵黄周吴徐孙马朱胡郭何林', n, 1) || '老师', CASE n % 3 WHEN 0 THEN '预览课数学' WHEN 1 THEN '预览课英语' ELSE '预览课物理' END,
'${busyDate}', CASE WHEN n <= 16 THEN '09:00' ELSE '14:00' END,
CASE WHEN n <= 16 THEN '10:00' ELSE '15:00' END, 100, '预览教室' || n,
(SELECT id FROM users WHERE username = 'e2e_admin') FROM nums;
INSERT INTO schedule_students (schedule_id, student_name, position)
SELECT id, substr('王李张刘陈杨赵黄周吴徐孙马朱胡郭何林', row_number() OVER (ORDER BY id), 1) || '小明', 0
FROM schedules WHERE subject LIKE '预览课%';
INSERT INTO schedule_students (schedule_id, student_name, position)
SELECT id, '小华' || id, 1 FROM schedules WHERE subject LIKE '预览课%' AND id % 3 = 0;
INSERT INTO schedules (teacher_name, subject, class_date, start_time, end_time, lesson_hundredths, classroom, created_by)
VALUES ('王老师', '预览常规数学', '${dateKey(nextMonday)}', '10:00', '11:00', 100, '预览A101', (SELECT id FROM users WHERE username = 'e2e_admin')),
('李老师', '预览常规英语', '${dateKey(nextWednesday)}', '15:00', '16:00', 100, '预览B102', (SELECT id FROM users WHERE username = 'e2e_admin'));
INSERT INTO schedule_students (schedule_id, student_name, position)
SELECT id, CASE subject WHEN '预览常规数学' THEN '张三' ELSE '李四' END, 0 FROM schedules WHERE subject LIKE '预览常规%';
`;
const sqlPath = join(preview, '.wrangler', 'calendar-preview.sql');
await writeFile(sqlPath, sql);
run([join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', '--local', '--file', sqlPath]);
console.log(`预览数据已准备在 ${preview}；管理员 e2e_admin，密码 e2e-pass-123；${busyDate} 有18节演示课程（上午16节、下午2节），下一周有两节常规课程。`);
