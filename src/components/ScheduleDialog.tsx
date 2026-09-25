/* eslint-disable react-hooks/set-state-in-effect, react-refresh/only-export-components */
import dayjs from 'dayjs';
import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { canChangeCompletion } from '../../shared/completionWindow';
import { calculateLessonHundredths, formatLessonHours } from '../../shared/domain';
import { teacherNameForViewer } from '../../shared/teacherName';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import type { AuthUser, PersonOption, Schedule } from '../types';
import { AdjustmentDialog, type AdjustmentStudent } from './AdjustmentDialog';
import { Button, Dialog, Field, Input, Notice } from './ui';

interface Props {
  open: boolean;
  item: Schedule | null;
  initialDate?: string;
  onClose: () => void;
  onChanged: () => void;
}

const blankForm = (date?: string) => ({
  teacherName: '', studentNames: [''], subject: '',
  classDate: date ?? dayjs().format('YYYY-MM-DD'), startTime: '09:00', endTime: '10:00', classroom: '',
});

export function scheduleStudentNames(item: Schedule) {
  return item.student_names;
}

export function compactStudentNames(item: Schedule) {
  const names = scheduleStudentNames(item);
  return names.length > 3 ? `${names.slice(0, 3).join('、')}…（共${names.length}人）` : names.join('、');
}

export function ScheduleDialog({ open, item, initialDate, onClose, onChanged }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState(blankForm(initialDate));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [studentBalances, setStudentBalances] = useState<Record<string, AdjustmentStudent> | null>(null);
  const [balanceLoadFailed, setBalanceLoadFailed] = useState(false);
  const [adjusting, setAdjusting] = useState<AdjustmentStudent | null>(null);
  const [balanceHintIndex, setBalanceHintIndex] = useState<number | null>(null);
  const readOnly = user?.role !== 'ADMIN';
  const canComplete = Boolean(item && canChangeCompletion(user?.role, item.class_date));
  const locked = Boolean(item?.is_completed);
  const lessonHundredths = useMemo(() => {
    try { return calculateLessonHundredths(form.startTime, form.endTime); } catch { return 0; }
  }, [form.startTime, form.endTime]);

  useEffect(() => {
    setForm(item ? {
      teacherName: item.teacher_name,
      studentNames: scheduleStudentNames(item),
      subject: item.subject, classDate: item.class_date, startTime: item.start_time,
      endTime: item.end_time, classroom: item.classroom,
    } : blankForm(initialDate));
    setError('');
    setBalanceHintIndex(null);
  }, [item, initialDate, open]);

  useEffect(() => {
    if (!open || (user?.role !== 'ADMIN' && user?.role !== 'STUDENT')) return;
    let active = true;
    setStudentBalances(null);
    setBalanceLoadFailed(false);
    if (user.role === 'ADMIN') {
      api<{ students: PersonOption[] }>('/schedule-options').then(({ students }) => {
        if (active) setStudentBalances(Object.fromEntries(students
          .filter((student) => student.remaining_hundredths != null)
          .map((student) => [student.name.trim().toLocaleLowerCase(), { id: student.id, name: student.name, remainingHundredths: student.remaining_hundredths as number }])));
      }).catch(() => { if (active) setBalanceLoadFailed(true); });
    } else {
      api<AuthUser>('/auth/me').then((profile) => {
        if (active) setStudentBalances(profile.remainingHundredths === undefined ? {} : {
          [profile.displayName.trim().toLocaleLowerCase()]: { id: profile.id, name: profile.displayName, remainingHundredths: profile.remainingHundredths },
        });
      }).catch(() => { if (active) setBalanceLoadFailed(true); });
    }
    return () => { active = false; };
  }, [open, user?.role]);

  function balanceText(name: string) {
    if (!name.trim()) return '—';
    if (balanceLoadFailed) return '读取失败';
    if (!studentBalances) return '读取中…';
    const student = studentBalances[name.trim().toLocaleLowerCase()];
    return student === undefined ? '暂无数据' : `${formatLessonHours(student.remainingHundredths)} 课时`;
  }

  function balanceStudent(name: string) {
    return studentBalances?.[name.trim().toLocaleLowerCase()];
  }

  function changeStudent(index: number, value: string) {
    setBalanceHintIndex(null);
    setForm((current) => ({ ...current, studentNames: current.studentNames.map((name, position) => position === index ? value : name) }));
  }

  function removeStudent(index: number) {
    setBalanceHintIndex(null);
    setForm((current) => ({ ...current, studentNames: current.studentNames.filter((_, position) => position !== index) }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    const studentNames = form.studentNames.map((name) => name.trim()).filter(Boolean);
    if (studentNames.length === 0) { setError('请至少输入一名学生'); return; }
    if (new Set(studentNames.map((name) => name.toLocaleLowerCase())).size !== studentNames.length) { setError('学生姓名不能重复'); return; }
    if (!lessonHundredths) { setError('结束时间必须晚于开始时间'); return; }
    setBusy(true); setError('');
    try {
      const payload = {
        teacherName: user?.role === 'ADMIN' ? form.teacherName.trim() : undefined,
        studentNames, subject: form.subject, classDate: form.classDate,
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
    if (!item || !canComplete) return;
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

  return <><Dialog title={!item ? '新增排课' : readOnly ? '课程详情' : '编辑排课'} open={open && !adjusting} onClose={onClose} wide>
    <form className="dialog-form" onSubmit={submit}>
      <Notice error={error} />
      {locked && !readOnly && <div className="notice">已完课课程的学生和时间已锁定。如需调整，请先取消完课。</div>}
      <div className="form-grid">
        {user?.role === 'ADMIN' && <Field label="教师姓名" hint="可填写尚未注册账号的教师"><Input required disabled={readOnly || locked} maxLength={40} value={form.teacherName} onChange={(event) => setForm({ ...form, teacherName: event.target.value })} placeholder="输入教师姓名" /></Field>}
        {user?.role !== 'ADMIN' && item && <Field label="教师"><Input disabled value={teacherNameForViewer(item.teacher_name, user?.role)} /></Field>}
        <Field label="科目"><Input required disabled={readOnly} maxLength={100} value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="可自由输入，如：语文" /></Field>
        <Field label="日期"><Input required disabled={readOnly || locked} type="date" value={form.classDate} onChange={(event) => setForm({ ...form, classDate: event.target.value })} /></Field>
        <Field label="开始时间"><Input required disabled={readOnly || locked} type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></Field>
        <Field label="结束时间"><Input required disabled={readOnly || locked} type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></Field>
        <Field label="自动课时"><Input disabled value={lessonHundredths ? `${formatLessonHours(lessonHundredths)} 课时` : '时间无效'} /></Field>
        <Field label="教室"><Input disabled={readOnly} maxLength={100} value={form.classroom} onChange={(event) => setForm({ ...form, classroom: event.target.value })} placeholder="可不填" /></Field>
      </div>
      <fieldset className="student-name-list" disabled={readOnly}>
        <legend>学生姓名</legend>
        {readOnly ? <>
          <p>{item ? scheduleStudentNames(item).join('、') : ''}</p>
          {user?.role === 'STUDENT' && item && <div className="student-name-row student-name-row--readonly"><span>我的课时</span><span className="student-name-balance"><small>预计剩余</small><strong>{balanceText(user.displayName)}</strong></span></div>}
        </> : <>
          {form.studentNames.map((name, index) => <div className="student-name-entry" key={index}>
            <div className="student-name-row">
              <Input required disabled={locked} maxLength={40} aria-label={`学生姓名 ${index + 1}`} value={name} onChange={(event) => changeStudent(index, event.target.value)} placeholder={`输入第 ${index + 1} 名学生姓名`} />
              {balanceStudent(name) ? <button type="button" className="student-name-balance student-name-balance--button" aria-label={`调整${name}的课时`} onClick={() => setAdjusting(balanceStudent(name) ?? null)}><small>预计剩余</small><strong>{balanceText(name)}</strong></button> : name.trim() && studentBalances && !balanceLoadFailed ? <button type="button" className="student-name-balance student-name-balance--button" aria-label={`${name}尚无学生账号`} onClick={() => setBalanceHintIndex(index)}><small>预计剩余</small><strong>暂无账号</strong></button> : <span className="student-name-balance"><small>预计剩余</small><strong>{balanceText(name)}</strong></span>}
              {form.studentNames.length > 1 && <button type="button" disabled={locked} className="icon-button bordered" aria-label={`移除第 ${index + 1} 名学生`} onClick={() => removeStudent(index)}><X size={17} /></button>}
            </div>
            {balanceHintIndex === index && <small className="student-name-hint" role="status">请先在用户管理添加该学生。</small>}
          </div>)}
          <Button type="button" variant="secondary" className="add-student" disabled={locked} onClick={() => setForm((current) => ({ ...current, studentNames: [...current.studentNames, ''] }))}><Plus size={16} />添加学生</Button>
          <small>姓名对应的账号尚未注册也可以保存；账号注册后会自动看到课程。</small>
        </>}
      </fieldset>
      <div className="completion-row"><div><strong>是否完课</strong><span>{user?.role === 'TEACHER' && item && !canComplete ? '仅可在上课当天或次日修改；其他时间请联系管理员' : item ? '切换后会立即扣减或返还全部学生的课时' : '新建课程默认为未完课'}</span></div><button type="button" role="switch" aria-label="是否完课" aria-checked={Boolean(item?.is_completed)} className={`switch ${item?.is_completed ? 'switch--on' : ''}`} disabled={!canComplete || busy} onClick={() => void toggleCompletion()}><span /></button></div>
      <footer className="dialog-actions">{item && !readOnly && <Button type="button" variant="danger" className="dialog-delete" disabled={busy} onClick={() => void remove()}><Trash2 size={16} />删除课程</Button>}<Button type="button" variant="secondary" onClick={onClose}>{readOnly ? '关闭' : '取消'}</Button>{!readOnly && <Button disabled={busy}>{busy ? '保存中…' : '保存'}</Button>}</footer>
    </form>
  </Dialog><AdjustmentDialog item={adjusting} onClose={() => setAdjusting(null)} onSaved={(remainingHundredths) => {
    if (adjusting) setStudentBalances((current) => current && { ...current, [adjusting.name.trim().toLocaleLowerCase()]: { ...adjusting, remainingHundredths } });
    setAdjusting(null);
  }} /></>;
}
