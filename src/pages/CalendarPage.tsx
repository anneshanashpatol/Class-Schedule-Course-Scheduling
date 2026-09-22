/* eslint-disable react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization */
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import isoWeek from 'dayjs/plugin/isoWeek';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Button, EmptyState, LoadingState, Notice } from '../components/ui';
import { api, queryString } from '../lib/api';
import type { Schedule } from '../types';
dayjs.extend(isoWeek); dayjs.locale('zh-cn');

const colors = ['sage', 'ochre', 'clay', 'blue', 'plum'];
function subjectColor(subject: string) { return colors[[...subject].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length]; }

export function CalendarPage() {
  const { user } = useAuth();
  const [anchor, setAnchor] = useState(dayjs());
  const [items, setItems] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const weekStart = anchor.startOf('isoWeek');
  const weekStartKey = weekStart.format('YYYY-MM-DD');
  const weekDays = Array.from({ length: 7 }, (_, index) => weekStart.add(index, 'day'));
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const start = dayjs(weekStartKey); const result = await api<Schedule[]>(`/schedules/export-data?${queryString({ dateFrom: weekStartKey, dateTo: start.add(6, 'day').format('YYYY-MM-DD'), limit: 500 })}`); setItems(result); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '加载失败'); }
    finally { setLoading(false); }
  }, [weekStartKey]);
  useEffect(() => { void load(); }, [load]);
  const byDate = useMemo(() => items.reduce<Record<string, Schedule[]>>((groups, item) => {
    (groups[item.class_date] ??= []).push(item);
    return groups;
  }, {}), [items]);
  const activeDateKey = anchor.format('YYYY-MM-DD');
  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">教学日程</p><h1>课程表</h1><p>你好，{user?.displayName}。这里是你的课程安排。</p></div><div className="calendar-controls"><Button variant="secondary" onClick={() => setAnchor(dayjs())}>今天</Button><span className="desktop-calendar-controls"><button className="icon-button bordered" aria-label="上一周" onClick={() => setAnchor(anchor.subtract(1, 'week'))}><ChevronLeft /></button><button className="icon-button bordered" aria-label="下一周" onClick={() => setAnchor(anchor.add(1, 'week'))}><ChevronRight /></button></span><span className="mobile-calendar-controls"><button className="icon-button bordered" aria-label="前一天" onClick={() => setAnchor(anchor.subtract(1, 'day'))}><ChevronLeft /></button><button className="icon-button bordered" aria-label="后一天" onClick={() => setAnchor(anchor.add(1, 'day'))}><ChevronRight /></button></span></div></header>
    <div className="week-label desktop-week-label">{weekStart.format('M月D日')} — {weekStart.add(6, 'day').format('M月D日')}</div>
    <div className="week-label mobile-day-label">{anchor.format('M月D日 dddd')}</div>
    <Notice error={error} />
    {loading ? <LoadingState /> : items.length === 0 ? <EmptyState title="这周还没有课程" text="课程安排后会在这里按日期出现。" /> : <>
      <div className="week-grid">{weekDays.map((date) => <section key={date.toString()} className={date.isSame(dayjs(), 'day') ? 'today' : ''}><header><span>{date.format('ddd')}</span><strong>{date.format('D')}</strong></header><div className="day-courses">{(byDate[date.format('YYYY-MM-DD')] ?? []).map((item) => <CourseCard key={item.id} item={item} />)}</div></section>)}</div>
      <div className="day-list"><section><h2>{anchor.format('M月D日 dddd')}</h2>{(byDate[activeDateKey] ?? []).length ? (byDate[activeDateKey] ?? []).map((item) => <CourseCard key={item.id} item={item} />) : <p className="muted">当天没有课程</p>}</section></div>
    </>}
  </div>;
}

function CourseCard({ item }: { item: Schedule }) {
  return <article className={`course-card course-card--${subjectColor(item.subject)}`}><div className="course-card__time">{item.start_time}–{item.end_time}</div><strong>{item.subject}</strong><span>{item.teacher_name} · {item.student_name}</span>{item.classroom && <span>{item.classroom}</span>}<em>{item.is_completed ? '已完课' : '待上课'}</em></article>;
}
