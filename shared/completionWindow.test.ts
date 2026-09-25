import { describe, expect, it } from 'vitest';
import { canChangeCompletion } from './completionWindow';

describe('教师完课操作时间', () => {
  const now = new Date('2026-09-25T15:59:00Z'); // 北京时间 9 月 25 日 23:59

  it('仅允许课程当天和次日', () => {
    expect(canChangeCompletion('TEACHER', '2026-09-25', now)).toBe(true);
    expect(canChangeCompletion('TEACHER', '2026-09-24', now)).toBe(true);
    expect(canChangeCompletion('TEACHER', '2026-09-23', now)).toBe(false);
    expect(canChangeCompletion('TEACHER', '2026-09-26', now)).toBe(false);
  });

  it('按北京时间跨日，管理员不受限制', () => {
    const nextMinute = new Date('2026-09-25T16:00:00Z');
    expect(canChangeCompletion('TEACHER', '2026-09-24', nextMinute)).toBe(false);
    expect(canChangeCompletion('ADMIN', '2026-09-24', nextMinute)).toBe(true);
    expect(canChangeCompletion('STUDENT', '2026-09-26', nextMinute)).toBe(false);
  });
});
