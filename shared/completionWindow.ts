import type { Role } from './domain';

// 课程日期按北京时间计算，老师可在上课当天及次日操作。
export function canChangeCompletion(role: Role | undefined, classDate: string, now = new Date()): boolean {
  if (role === 'ADMIN') return true;
  if (role !== 'TEACHER') return false;

  const shanghaiTime = now.getTime() + 8 * 60 * 60 * 1000;
  const today = new Date(shanghaiTime).toISOString().slice(0, 10);
  const yesterday = new Date(shanghaiTime - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return classDate === today || classDate === yesterday;
}
