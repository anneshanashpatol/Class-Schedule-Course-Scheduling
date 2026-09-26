import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import { calendarRange, dailyStudentNames, shortSubject } from './calendar';
import type { Schedule } from '../types';

describe('calendar helpers', () => {
  it('covers the full visible month including adjacent dates', () => {
    expect(calendarRange(dayjs('2024-02-15'), 'month')).toEqual({ from: '2024-01-29', to: '2024-03-03', days: 35 });
    expect(calendarRange(dayjs('2026-08-15'), 'month')).toEqual({ from: '2026-07-27', to: '2026-09-06', days: 42 });
    expect(calendarRange(dayjs('2027-01-01'), 'week')).toEqual({ from: '2026-12-28', to: '2027-01-03', days: 7 });
  });

  it('keeps each student once and preserves the first displayed spelling', () => {
    const rows = [
      { student_names: ['张三', '李四'] },
      { student_names: ['张三', '王五', ' '] },
    ] as Schedule[];
    expect(dailyStudentNames(rows)).toEqual(['张三', '李四', '王五']);
  });

  it('uses familiar subject initials while preserving other subject names', () => {
    expect(shortSubject('初二数学')).toBe('数');
    expect(shortSubject('编程入门')).toBe('编程入');
  });
});
