/* eslint-disable react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization */
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import isoWeek from 'dayjs/plugin/isoWeek';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { compactStudentNames, ScheduleDialog } from '../components/ScheduleDialog';
import { Button, LoadingState, Notice } from '../components/ui';
import { api, queryString } from '../lib/api';
import type { Schedule } from '../types';

dayjs.extend(isoWeek);
dayjs.locale('zh-cn');

const subjectColors = [
  ['语文', 'chinese'],
  ['数学', 'math'],
  ['英语', 'english'],
  ['物理', 'physics'],
  ['化学', 'chemistry'],
  ['生物', 'biology'],
  ['政治', 'politics'],
  ['历史', 'history'],
  ['地理', 'geography'],
] as const;
const periods = [
  { key: 'morning', label: '上午', matches: (item: Schedule) => item.start_time < '12:00' },
  { key: 'afternoon', label: '下午', matches: (item: Schedule) => item.start_time >= '12:00' },
];

function subjectColor(subject: string) {
  return subjectColors.find(([name]) => subject.includes(name))?.[1] ?? 'other';
}

export function CalendarPage() {
  const { user } = useAuth();
  const [anchor, setAnchor] = useState(dayjs());
  const [items, setItems] = useState<Schedule[]>([]);
  const [dialog, setDialog] = useState<{ item: Schedule | null; date?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const weekStart = anchor.startOf('isoWeek');
  const weekStartKey = weekStart.format('YYYY-MM-DD');
  const weekDays = Array.from({ length: 7 }, (_, index) => weekStart.add(index, 'day'));
  const canEdit = user?.role !== 'STUDENT';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const rows: Schedule[] = [];
      for (let offset = 0; ; offset += 500) {
        const batch = await api<Schedule[]>(`/schedules/export-data?${queryString({ dateFrom: weekStartKey, dateTo: dayjs(weekStartKey).add(6, 'day').format('YYYY-MM-DD'), offset, limit: 500 })}`);
        rows.push(...batch);
        if (batch.length < 500) break;
      }
      setItems(rows);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '加载失败'); }
    finally { setLoading(false); }
  }, [weekStartKey]);

  useEffect(() => { void load(); }, [load]);
  const byDate = useMemo(() => items.reduce<Record<string, Schedule[]>>((groups, item) => {
    (groups[item.class_date] ??= []).push(item);
    return groups;
  }, {}), [items]);
  const activeDateKey = anchor.format('YYYY-MM-DD');

  function openDate(date: string) { if (canEdit) setDialog({ item: null, date }); }
  function openItem(item: Schedule) { setDialog({ item }); }
  function changed() { setDialog(null); void load(); }

  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">教学日程</p><h1>课程表</h1><p>你好，{user?.displayName}。点击日期空白处即可排课，点击课程查看详情。</p></div><div className="calendar-controls"><Button variant="secondary" onClick={() => setAnchor(dayjs())}>今天</Button><span className="desktop-calendar-controls"><button className="icon-button bordered" aria-label="上一周" onClick={() => setAnchor(anchor.subtract(1, 'week'))}><ChevronLeft /></button><button className="icon-button bordered" aria-label="下一周" onClick={() => setAnchor(anchor.add(1, 'week'))}><ChevronRight /></button></span><span className="mobile-calendar-controls"><button className="icon-button bordered" aria-label="前一天" onClick={() => setAnchor(anchor.subtract(1, 'day'))}><ChevronLeft /></button><button className="icon-button bordered" aria-label="后一天" onClick={() => setAnchor(anchor.add(1, 'day'))}><ChevronRight /></button></span></div></header>
    <div className="calendar-heading">
      <div className="calendar-heading__range"><strong>{anchor.format('YYYY年M月')}</strong><span className="desktop-week-label">{weekStart.format('M月D日')} — {weekStart.add(6, 'day').format('M月D日')}</span><span className="mobile-day-label">{anchor.format('M月D日 dddd')}</span></div>
      <label className="calendar-date-picker"><span>选择日期</span><input type="date" value={activeDateKey} onChange={(event) => { if (event.target.value) setAnchor(dayjs(event.target.value)); }} /></label>
    </div>
    <Notice error={error} />
    {loading ? <LoadingState /> : <>
      <div className="week-grid">
        <div className="week-grid__dates">{weekDays.map((date) => <header key={date.format('YYYY-MM-DD')} className={date.isSame(dayjs(), 'day') ? 'today' : ''}><span>{date.format('ddd')}</span><strong>{date.format('D')}</strong></header>)}</div>
        {periods.map((period) => <section className="week-period-row" key={period.key}>
          <h2 aria-label={period.label}><span aria-hidden="true">{period.label[0]}</span><span aria-hidden="true">{period.label[1]}</span></h2>
          <div className="week-period-days">{weekDays.map((date) => {
            const dateKey = date.format('YYYY-MM-DD');
            return <CalendarPeriod key={dateKey} label={`${date.format('M月D日')}${period.label}`} hideLabel items={(byDate[dateKey] ?? []).filter(period.matches)} canEdit={canEdit} onBlank={() => openDate(dateKey)} onOpen={openItem} />;
          })}</div>
        </section>)}
      </div>
      <div className="day-list"><section><header><h2>{anchor.format('M月D日 dddd')}</h2>{canEdit && <Button variant="secondary" onClick={() => openDate(activeDateKey)}><Plus size={16} />新增排课</Button>}</header>{periods.map((period) => <CalendarPeriod key={period.key} label={period.label} items={(byDate[activeDateKey] ?? []).filter(period.matches)} canEdit={canEdit} onBlank={() => openDate(activeDateKey)} onOpen={openItem} />)}</section></div>
    </>}
    <ScheduleDialog open={dialog !== null} item={dialog?.item ?? null} initialDate={dialog?.date} onClose={() => setDialog(null)} onChanged={changed} />
  </div>;
}

function CalendarPeriod({ label, hideLabel = false, items, canEdit, onBlank, onOpen }: { label: string; hideLabel?: boolean; items: Schedule[]; canEdit: boolean; onBlank: () => void; onOpen: (item: Schedule) => void }) {
  return <section className={`calendar-period ${canEdit ? 'calendar-period--editable' : ''}`} onClick={() => canEdit && onBlank()}>
    {!hideLabel && <h3>{label}</h3>}
    <div className="calendar-period__body">{items.length ? items.map((item) => <CourseCard key={item.id} item={item} onOpen={() => onOpen(item)} />) : canEdit ? <button type="button" className="calendar-empty calendar-empty--add" aria-label={`在${label}新增排课`} onClick={(event) => { event.stopPropagation(); onBlank(); }}><Plus size={22} strokeWidth={1.5} /></button> : <span className="calendar-empty">暂无课程</span>}</div>
  </section>;
}

function CourseCard({ item, onOpen }: { item: Schedule; onOpen: () => void }) {
  const allStudents = item.student_names.join('、');
  return <button type="button" className={`course-card course-card--${subjectColor(item.subject)}`} onClick={(event) => { event.stopPropagation(); onOpen(); }}>
    <span className="course-card__time">{item.start_time}–{item.end_time}</span><strong>{item.subject}</strong><span>{item.teacher_name}</span><span title={allStudents}>{compactStudentNames(item)}</span>{item.classroom && <span>{item.classroom}</span>}<em>{item.is_completed ? '已完课' : '待上课'}</em>
  </button>;
}
