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
});
