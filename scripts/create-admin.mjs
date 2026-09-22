import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const username = process.env.ADMIN_NAME?.trim();
const password = process.env.ADMIN_PASSWORD;
const database = process.env.D1_DATABASE_NAME ?? 'course-scheduler-db';
const isRemote = process.argv.includes('--remote');

if (!username || !password || password.length < 8) {
  console.error('请设置 ADMIN_NAME 和至少 8 位的 ADMIN_PASSWORD。');
  process.exit(1);
}

const salt = randomBytes(16);
const iterations = 210_000;
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const encoded = `pbkdf2-sha256$${iterations}$${salt.toString('base64')}$${hash.toString('base64')}`;
const quote = (value) => value.replaceAll("'", "''");
const sql = `INSERT INTO users (username, display_name, password_hash, role)
VALUES ('${quote(username)}', '${quote(username)}', '${quote(encoded)}', 'ADMIN');\n`;
const sqlFile = join(tmpdir(), `course-scheduler-admin-${process.pid}.sql`);

try {
  writeFileSync(sqlFile, sql, { encoding: 'utf8', mode: 0o600 });
  const wranglerCli = join(process.cwd(), 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const args = [wranglerCli, 'd1', 'execute', database, isRemote ? '--remote' : '--local', '--file', sqlFile];
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(sqlFile, { force: true });
}
