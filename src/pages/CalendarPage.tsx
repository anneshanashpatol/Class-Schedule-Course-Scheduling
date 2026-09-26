/* eslint-disable react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization */
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import isoWeek from 'dayjs/plugin/isoWeek';
import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { teacherNameForViewer } from '../../shared/teacherName';
import { useAuth } from '../auth/AuthContext';
import { compactStudentNames, ScheduleDialog } from '../components/ScheduleDialog';
import { Button, LoadingState, Notice } from '../components/ui';
import { api, queryString } from '../lib/api';
import { calendarRange, dailyStudentNames, shortSubject } from '../lib/calendar';
import type { Schedule } from '../types';

dayjs.extend(isoWeek);
dayjs.locale('zh-cn');

const subjectColors = [
  ['语文', 'chinese'], ['数学', 'math'], ['英语', 'english'],
  ['物理', 'physics'], ['化学', 'chemistry'], ['生物', 'biology'],
  ['政治', 'politics'], ['历史', 'history'], ['地理', 'geography'],
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
  const [view, setView] = useState<'week' | 'month'>('week');
  const [items, setItems] = useState<Schedule[]>([]);
  const [dialog, setDialog] = useState<{ item: Schedule | null; date?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const requestId = useRef(0);
  const activeDateKey = anchor.format('YYYY-MM-DD');
  const range = calendarRange(anchor, view);
  const weekStart = anchor.startOf('isoWeek');
  const weekDays = Array.from({ length: 7 }, (_, index) => weekStart.add(index, 'day'));
  const monthDays = Array.from({ length: range.days }, (_, index) => dayjs(range.from).add(index, 'day'));
  const monthNameColumns = viewport.width >= 1200 ? 2 : 1;
  const monthCellHeight = Math.max(420, viewport.height - 240) / (range.days / 7);
  const monthNameSlots = Math.max(2, Math.floor((monthCellHeight - 34) / 16)) * monthNameColumns;
  const canEdit = user?.role === 'ADMIN';

  useEffect(() => {
    const updateViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError('');
    setItems([]);
    try {
      const rows: Schedule[] = [];
      for (let offset = 0; ; offset += 500) {
        const batch = await api<Schedule[]>(`/schedules/export-data?${queryString({ dateFrom: range.from, dateTo: range.to, offset, limit: 500 })}`);
        if (current !== requestId.current) return;
        rows.push(...batch);
        if (batch.length < 500) break;
      }
      setItems(rows);
    } catch (reason) {
      if (current === requestId.current) setError(reason instanceof Error ? reason.message : '加载失败');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load, reloadKey]);

  const byDate = useMemo(() => items.reduce<Record<string, Schedule[]>>((groups, item) => {
    (groups[item.class_date] ??= []).push(item);
    return groups;
  }, {}), [items]);

  function openDate(date: string) { if (canEdit) setDialog({ item: null, date }); }
  function changed() { setDialog(null); setReloadKey((value) => value + 1); }
  function navigate(direction: -1 | 1) {
    setAnchor(view === 'month' ? anchor.add(direction, 'month') : anchor.add(direction, 'week'));
  }

  return <div className="page calendar-page">
    <header className="page-header calendar-page__header"><div><p className="eyebrow">教学日程</p><h1>课程表</h1><p>你好，{user?.displayName}。点击课程查看详情。</p></div>
      <div className="calendar-controls">
        <div className="calendar-view-switch" role="group" aria-label="日历视图"><button type="button" className={view === 'week' ? 'active' : ''} aria-pressed={view === 'week'} onClick={() => setView('week')}>周</button><button type="button" className={view === 'month' ? 'active' : ''} aria-pressed={view === 'month'} onClick={() => setView('month')}>月</button></div>
        <Button variant="secondary" onClick={() => setAnchor(dayjs())}>今天</Button>
        <span className="desktop-calendar-controls"><button className="icon-button bordered" aria-label={view === 'month' ? '上一月' : '上一周'} onClick={() => navigate(-1)}><ChevronLeft /></button><button className="icon-button bordered" aria-label={view === 'month' ? '下一月' : '下一周'} onClick={() => navigate(1)}><ChevronRight /></button></span>
        <span className="mobile-calendar-controls"><button className="icon-button bordered" aria-label="前一天" onClick={() => setAnchor(anchor.subtract(1, 'day'))}><ChevronLeft /></button><button className="icon-button bordered" aria-label="后一天" onClick={() => setAnchor(anchor.add(1, 'day'))}><ChevronRight /></button></span>
      </div>
    </header>
    <div className="calendar-heading"><div className="calendar-heading__range"><strong>{anchor.format('YYYY年M月')}</strong>{view === 'week' && <span className="desktop-week-label">{weekStart.format('M月D日')} — {weekStart.add(6, 'day').format('M月D日')}</span>}<span className="mobile-day-label">{anchor.format('M月D日 dddd')}</span></div><label className="calendar-date-picker"><span>选择日期</span><input type="date" value={activeDateKey} onChange={(event) => { if (event.target.value) setAnchor(dayjs(event.target.value)); }} /></label></div>
    {error && <div className="calendar-error"><Notice error={error} /><Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>重试</Button></div>}
    {loading ? <LoadingState /> : <>
      {view === 'month' ? <div className="month-calendar" style={{ '--month-rows': range.days / 7 } as CSSProperties} aria-label={`${anchor.format('YYYY年M月')}月视图`}>
        <div className="month-calendar__weekdays">{weekDays.map((date) => <span key={date.day()}>{date.format('ddd')}</span>)}</div>
        <div className="month-calendar__grid">{monthDays.map((date) => {
          const key = date.format('YYYY-MM-DD');
          const dayItems = byDate[key] ?? [];
          const names = dailyStudentNames(dayItems);
          const shownNames = names.slice(0, names.length > monthNameSlots ? monthNameSlots - 1 : monthNameSlots);
          return <button type="button" key={key} className={`month-day${date.isSame(anchor, 'month') ? '' : ' month-day--outside'}${date.isSame(dayjs(), 'day') ? ' month-day--today' : ''}${key === activeDateKey ? ' month-day--selected' : ''}`} title={names.length ? `${date.format('M月D日')} · ${dayItems.length}节课\n${names.join('、')}` : `${date.format('M月D日')} · 无课程`} aria-label={`${date.format('YYYY年M月D日')}，${dayItems.length}节课，学生：${names.join('、') || '无'}`} onFocus={() => setFocusedDay(key)} onBlur={() => setFocusedDay(null)} onClick={() => { setAnchor(date); setView('week'); }}>
            <span className="month-day__head"><strong>{date.format('D')}</strong><small>{dayItems.length ? `${dayItems.length}节课` : ''}</small></span>
            {names.length > 0 && <span className="month-day__names">{shownNames.map((name) => <span key={name} title={name}>{name}</span>)}{names.length > shownNames.length && <span className="month-day__more">另有 {names.length - shownNames.length} 人</span>}</span>}
          </button>;
        })}</div>
        {focusedDay && <div className="month-calendar__focus-list" role="tooltip"><strong>{dayjs(focusedDay).format('M月D日')} · 学生名单</strong><span>{dailyStudentNames(byDate[focusedDay] ?? []).join('、') || '暂无课程'}</span></div>}
      </div> : <div className={`week-grid week-grid--compact${weekDays.some((date) => periods.some((period) => (byDate[date.format('YYYY-MM-DD')] ?? []).filter(period.matches).length >= 12)) ? ' week-grid--busy' : ''}`} aria-label="周课程表">
        <div className="week-grid__dates">{weekDays.map((date) => <header key={date.format('YYYY-MM-DD')} className={`${date.isSame(dayjs(), 'day') ? 'today' : ''}${date.format('YYYY-MM-DD') === activeDateKey ? ' selected' : ''}`}><span>{date.format('ddd')}</span><strong>{date.format('D')}</strong><small>{(byDate[date.format('YYYY-MM-DD')] ?? []).length} 节课</small></header>)}</div>
        {periods.map((period) => <section className="week-period-row" key={period.key}>
          <h2 aria-label={period.label}><span aria-hidden="true">{period.label[0]}</span><span aria-hidden="true">{period.label[1]}</span></h2>
          <div className="week-period-days">{weekDays.map((date) => {
            const dateKey = date.format('YYYY-MM-DD');
            return <CalendarPeriod key={dateKey} label={`${date.format('M月D日')}${period.label}`} hideLabel compact items={(byDate[dateKey] ?? []).filter(period.matches)} canEdit={canEdit} onBlank={() => openDate(dateKey)} onOpen={(item) => setDialog({ item })} />;
          })}</div>
        </section>)}
      </div>}
      <div className="day-list"><section><header><h2>{anchor.format('M月D日 dddd')}</h2>{canEdit && <Button variant="secondary" onClick={() => openDate(activeDateKey)}><Plus size={16} />新增排课</Button>}</header>{periods.map((period) => <CalendarPeriod key={period.key} label={period.label} items={(byDate[activeDateKey] ?? []).filter(period.matches)} canEdit={canEdit} onBlank={() => openDate(activeDateKey)} onOpen={(item) => setDialog({ item })} />)}</section></div>
    </>}
    <ScheduleDialog open={dialog !== null} item={dialog?.item ?? null} initialDate={dialog?.date} onClose={() => setDialog(null)} onChanged={changed} />
  </div>;
}

function CompactCourseCard({ item, onOpen }: { item: Schedule; onOpen: () => void }) {
  const { user } = useAuth();
  const teacher = teacherNameForViewer(item.teacher_name, 'STUDENT').replace(/老师$/, '');
  const details = `${item.start_time}–${item.end_time} ${item.subject}\n学生：${item.student_names.join('、')}\n教师：${teacherNameForViewer(item.teacher_name, user?.role)}${item.classroom ? `\n教室：${item.classroom}` : ''}\n${item.is_completed ? '已完课' : '待上课'}`;
  return <button type="button" className={`compact-course compact-course--${subjectColor(item.subject)}`} onClick={(event) => { event.stopPropagation(); onOpen(); }} title={details} aria-label={details.replaceAll('\n', '，')}>
    <span className="compact-course__line"><time>{item.start_time}–{item.end_time}</time><strong title={item.subject}>{shortSubject(item.subject)}</strong><span className="compact-course__students" title={item.student_names.join('、')}>{compactStudentNames(item)}</span><span className="compact-course__teacher" title={`${teacher}老师`}>{teacher}</span>{item.is_completed ? <Check size={14} aria-label="已完课" /> : null}</span>
  </button>;
}

function CalendarPeriod({ label, hideLabel = false, compact = false, items, canEdit, onBlank, onOpen }: { label: string; hideLabel?: boolean; compact?: boolean; items: Schedule[]; canEdit: boolean; onBlank: () => void; onOpen: (item: Schedule) => void }) {
  return <section className={`calendar-period ${canEdit ? 'calendar-period--editable' : ''}${compact ? ` calendar-period--${items.length <= 3 ? 'few' : items.length <= 6 ? 'medium' : 'many'}` : ''}`} onClick={() => canEdit && onBlank()}>
    {!hideLabel && <h3>{label}</h3>}
    <div className="calendar-period__body">{items.length ? <>{items.map((item) => compact ? <CompactCourseCard key={item.id} item={item} onOpen={() => onOpen(item)} /> : <CourseCard key={item.id} item={item} onOpen={() => onOpen(item)} />)}{compact && canEdit && <button type="button" className="calendar-period__add" aria-label={`在${label}新增排课`} onClick={(event) => { event.stopPropagation(); onBlank(); }}><Plus size={15} /></button>}</> : canEdit ? <button type="button" className="calendar-empty calendar-empty--add" aria-label={`在${label}新增排课`} onClick={(event) => { event.stopPropagation(); onBlank(); }}><Plus size={22} strokeWidth={1.5} /></button> : <span className="calendar-empty">暂无课程</span>}</div>
  </section>;
}

function CourseCard({ item, onOpen }: { item: Schedule; onOpen: () => void }) {
  const { user } = useAuth();
  return <button type="button" className={`course-card course-card--${subjectColor(item.subject)}`} onClick={(event) => { event.stopPropagation(); onOpen(); }}>
    <span className="course-card__time">{item.start_time}–{item.end_time}</span><strong>{item.subject}</strong><span className="course-card__teacher">{teacherNameForViewer(item.teacher_name, user?.role)}</span><span className="course-card__students" title={item.student_names.join('、')}>{compactStudentNames(item)}</span>{item.classroom && <span>{item.classroom}</span>}<em className={item.is_completed ? 'course-card__completed' : undefined}>{item.is_completed ? <><Check size={18} strokeWidth={3} aria-hidden="true" />已完课</> : '待上课'}</em>
  </button>;
}
