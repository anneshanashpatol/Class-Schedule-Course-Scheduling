/* eslint-disable react-hooks/set-state-in-effect, react-refresh/only-export-components */
import dayjs from 'dayjs';
import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { calculateLessonHundredths, formatLessonHours } from '../../shared/domain';
import { useAuth } from '../auth/AuthContext';
import { useScheduleOptions } from '../hooks/useScheduleOptions';
import { api } from '../lib/api';
import type { Schedule } from '../types';
import { Button, Dialog, Field, Input, Notice, Select } from './ui';

interface Props {
  open: boolean;
  item: Schedule | null;
  initialDate?: string;
  onClose: () => void;
  onChanged: () => void;
}

const blankForm = (date?: string) => ({
  teacherId: '', studentIds: [] as string[], subject: '',
  classDate: date ?? dayjs().format('YYYY-MM-DD'), startTime: '09:00', endTime: '10:00', classroom: '',
});

export function scheduleStudentNames(item: Schedule) {
  return item.student_names?.length ? item.student_names : [item.student_name].filter(Boolean);
}

export function compactStudentNames(item: Schedule) {
  const names = scheduleStudentNames(item);
  return names.length > 3 ? `${names.slice(0, 3).join('、')}…（共${names.length}人）` : names.join('、');
}

export function ScheduleDialog({ open, item, initialDate, onClose, onChanged }: Props) {
  const { user } = useAuth();
  const options = useScheduleOptions();
  const [form, setForm] = useState(blankForm(initialDate));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const readOnly = user?.role === 'STUDENT';
  const locked = Boolean(item?.is_completed);
  const lessonHundredths = useMemo(() => {
    try { return calculateLessonHundredths(form.startTime, form.endTime); } catch { return 0; }
  }, [form.startTime, form.endTime]);

  useEffect(() => {
    setForm(item ? {
      teacherId: String(item.teacher_id),
      studentIds: (item.student_ids?.length ? item.student_ids : [item.student_id]).map(String),
      subject: item.subject, classDate: item.class_date, startTime: item.start_time,
      endTime: item.end_time, classroom: item.classroom,
    } : blankForm(initialDate));
    setError('');
  }, [item, initialDate, open]);

  function toggleStudent(id: string) {
    setForm((current) => ({
      ...current,
      studentIds: current.studentIds.includes(id)
        ? current.studentIds.filter((value) => value !== id)
        : [...current.studentIds, id],
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    if (form.studentIds.length === 0) { setError('请至少选择一名学生'); return; }
    if (!lessonHundredths) { setError('结束时间必须晚于开始时间'); return; }
    setBusy(true); setError('');
    try {
      const payload = {
        teacherId: user?.role === 'ADMIN' ? Number(form.teacherId) : undefined,
        studentIds: form.studentIds.map(Number), subject: form.subject, classDate: form.classDate,
        startTime: form.startTime, endTime: form.endTime, classroom: form.classroom,
        ...(item ? { version: item.version } : {}),
      };
      await api(item ? `/schedules/${item.id}` : '/schedules', {
        method: item ? 'PATCH' : 'POST', body: JSON.stringify(payload),
      });
      onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
    finally { setBusy(false); }
  }

  async function toggleCompletion() {
    if (!item || readOnly) return;
    setBusy(true); setError('');
    try {
      await api(`/schedules/${item.id}/completion`, {
        method: 'PATCH', body: JSON.stringify({ completed: !item.is_completed, version: item.version }),
      });
      onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '完课状态更新失败'); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!item || readOnly || !confirm(`确定删除「${item.subject}」吗？\n删除后不可恢复，已完课课程也不会返还课时。`)) return;
    setBusy(true); setError('');
    try { await api(`/schedules/${item.id}`, { method: 'DELETE' }); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除失败'); }
    finally { setBusy(false); }
  }

  return <Dialog title={!item ? '新增排课' : readOnly ? '课程详情' : '编辑排课'} open={open} onClose={onClose} wide>
    <form className="dialog-form" onSubmit={submit}>
      <Notice error={error} />
      {locked && !readOnly && <div className="notice">已完课课程的学生和时间已锁定。如需调整，请先取消完课。</div>}
      <div className="form-grid">
        {user?.role === 'ADMIN' && <Field label="教师"><Select required disabled={readOnly} value={form.teacherId} onChange={(event) => setForm({ ...form, teacherId: event.target.value })}><option value="">请选择教师</option>{options.teachers.filter((person) => !person.status || person.status === 'ACTIVE').map((person) => <option key={person.id} value={person.id}>{person.name}{person.subject ? ` · ${person.subject}` : ''}</option>)}</Select></Field>}
        {user?.role !== 'ADMIN' && item && <Field label="教师"><Input disabled value={item.teacher_name} /></Field>}
        <Field label="科目"><Input required disabled={readOnly} maxLength={100} value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="可自由输入，如：语文" /></Field>
        <Field label="日期"><Input required disabled={readOnly || locked} type="date" value={form.classDate} onChange={(event) => setForm({ ...form, classDate: event.target.value })} /></Field>
        <Field label="开始时间"><Input required disabled={readOnly || locked} type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></Field>
        <Field label="结束时间"><Input required disabled={readOnly || locked} type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></Field>
        <Field label="自动课时"><Input disabled value={lessonHundredths ? `${formatLessonHours(lessonHundredths)} 课时` : '时间无效'} /></Field>
        <Field label="教室"><Input disabled={readOnly} maxLength={100} value={form.classroom} onChange={(event) => setForm({ ...form, classroom: event.target.value })} placeholder="可不填" /></Field>
      </div>
      <fieldset className="student-picker" disabled={readOnly || locked}>
        <legend>学生（可多选）</legend>
        {readOnly ? <p>{item ? scheduleStudentNames(item).join('、') : ''}</p> : options.students.filter((person) => !person.status || person.status === 'ACTIVE').map((person) => <label key={person.id}><input type="checkbox" checked={form.studentIds.includes(String(person.id))} onChange={() => toggleStudent(String(person.id))} /><span>{person.name}</span></label>)}
      </fieldset>
      <div className="completion-row"><div><strong>是否完课</strong><span>{item ? '切换后会立即扣减或返还全部学生的课时' : '新建课程默认为未完课'}</span></div><button type="button" role="switch" aria-checked={Boolean(item?.is_completed)} className={`switch ${item?.is_completed ? 'switch--on' : ''}`} disabled={!item || readOnly || busy} onClick={() => void toggleCompletion()}><span /></button></div>
      <footer className="dialog-actions">{item && !readOnly && <Button type="button" variant="danger" className="dialog-delete" disabled={busy} onClick={() => void remove()}><Trash2 size={16} />删除课程</Button>}<Button type="button" variant="secondary" onClick={onClose}>{readOnly ? '关闭' : '取消'}</Button>{!readOnly && <Button disabled={busy}>{busy ? '保存中…' : '保存'}</Button>}</footer>
    </form>
  </Dialog>;
}
