import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migrationsDir = join(root, 'migrations');

describe('D1 migration compatibility', () => {
  it('uses trigger syntax accepted by the remote D1 statement splitter', () => {
    const migrations = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .map((name) => readFileSync(join(migrationsDir, name), 'utf8'));

    for (const sql of migrations) {
      expect(sql).not.toMatch(/\bSELECT\s+CASE\b/i);
      expect(sql).not.toContain('\r');
      for (const keyword of sql.matchAll(/\bbegin\b/gi)) {
        expect(keyword[0]).toBe('BEGIN');
      }
    }

    const attributes = readFileSync(join(root, '.gitattributes'), 'utf8');
    expect(attributes).toMatch(/^migrations\/\*\.sql text eol=lf$/m);
  });

  it('keeps a single final schema without legacy schedule storage', () => {
    const migrationNames = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'));
    expect(migrationNames).toEqual(['0001_initial.sql']);

    const sql = readFileSync(join(migrationsDir, migrationNames[0]), 'utf8');
    const schedulesTable = sql.slice(
      sql.indexOf('CREATE TABLE schedules'),
      sql.indexOf('CREATE TABLE schedule_students'),
    );
    expect(schedulesTable).not.toContain('student_name');
    expect(sql).not.toContain('app_settings');
    expect(sql).not.toContain('idx_sessions_expiry');
    expect(sql).not.toContain('idx_schedules_student_date');
    expect(sql).not.toContain('idx_schedule_students_schedule_position');
  });
});
