import { describe, expect, it } from 'vitest';
import { SCHEDULE_EXPORT_BATCH_SIZE } from './export';

describe('排课导出批次', () => {
  it('每批最多读取 200 条以适配免费版 Worker CPU 限制', () => {
    expect(SCHEDULE_EXPORT_BATCH_SIZE).toBeGreaterThan(0);
    expect(SCHEDULE_EXPORT_BATCH_SIZE).toBeLessThanOrEqual(200);
  });
});
