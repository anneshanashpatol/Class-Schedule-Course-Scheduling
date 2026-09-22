import { calculateLessonHundredths, formatLessonHours, overlaps } from './domain';
import { describe, expect, it } from 'vitest';

describe('课时计算', () => {
  it.each([
    ['09:00', '10:00', 100],
    ['09:00', '10:30', 150],
    ['09:00', '11:00', 200],
  ])('%s 到 %s 计算为 %i 个百分之一课时', (start, end, expected) => {
    expect(calculateLessonHundredths(start, end)).toBe(expected);
  });

  it('将分钟结果四舍五入到百分之一课时', () => {
    expect(calculateLessonHundredths('09:00', '09:10')).toBe(17);
    expect(formatLessonHours(17)).toBe('0.17');
  });

  it('拒绝结束时间不晚于开始时间', () => {
    expect(() => calculateLessonHundredths('10:00', '10:00')).toThrow('结束时间必须晚于开始时间');
  });
});

describe('课程重叠', () => {
  it('允许首尾相接的课程', () => {
    expect(overlaps('09:00', '10:00', '10:00', '11:00')).toBe(false);
  });

  it('识别部分重叠的课程', () => {
    expect(overlaps('09:00', '10:00', '09:59', '11:00')).toBe(true);
  });
});
