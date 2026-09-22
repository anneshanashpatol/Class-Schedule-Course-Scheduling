export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';
export type UserStatus = 'ACTIVE' | 'DISABLED';

export const LESSON_MINUTES = 60;

export function minutesBetween(startTime: string, endTime: string): number {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  };
  return toMinutes(endTime) - toMinutes(startTime);
}

export function calculateLessonHundredths(startTime: string, endTime: string): number {
  const minutes = minutesBetween(startTime, endTime);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error('结束时间必须晚于开始时间');
  }
  return Math.round((minutes / LESSON_MINUTES) * 100);
}

export function formatLessonHours(hundredths: number): string {
  return (hundredths / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export function overlaps(
  existingStart: string,
  existingEnd: string,
  nextStart: string,
  nextEnd: string,
): boolean {
  return existingStart < nextEnd && existingEnd > nextStart;
}

