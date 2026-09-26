import dayjs, { type Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import type { Schedule } from '../types';

dayjs.extend(isoWeek);

export function calendarRange(anchor: Dayjs, view: 'week' | 'month') {
  const first = view === 'month' ? anchor.startOf('month').startOf('isoWeek') : anchor.startOf('isoWeek');
  const last = view === 'month' ? anchor.endOf('month').endOf('isoWeek') : first.add(6, 'day');
  return { from: first.format('YYYY-MM-DD'), to: last.format('YYYY-MM-DD'), days: last.diff(first, 'day') + 1 };
}

export function dailyStudentNames(items: Schedule[]) {
  const seen = new Set<string>();
  return items.flatMap((item) => item.student_names).filter((name) => {
    const key = name.trim().toLocaleLowerCase('zh-CN');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const abbreviations = [
  ['语文', '语'], ['数学', '数'], ['英语', '英'],
  ['物理', '物'], ['化学', '化'], ['生物', '生'],
  ['政治', '政'], ['历史', '史'], ['地理', '地'],
] as const;

export function shortSubject(subject: string) {
  return abbreviations.find(([name]) => subject.includes(name))?.[1] ?? Array.from(subject.trim()).slice(0, 3).join('');
}
