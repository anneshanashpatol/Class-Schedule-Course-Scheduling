/* eslint-disable react-hooks/set-state-in-effect */
import dayjs from 'dayjs';
import { Check, Download, Filter, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { compactStudentNames, ScheduleDialog } from '../components/ScheduleDialog';
import { Button, EmptyState, Field, Input, LoadingState, Notice, Select } from '../components/ui';
import { useScheduleOptions } from '../hooks/useScheduleOptions';
import { api, queryString } from '../lib/api';
import type { Schedule, ScheduleFilters } from '../types';

const emptyFilters: ScheduleFilters = { teacherId: '', studentId: '', dateFrom: '', dateTo: '', subject: '', classroom: '', completed: '' };
const lessonText = (value: number) => `${(value / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 课时`;
const safeCell = (value: string) => /^[=+\-@]/.test(value) ? `'${value}` : value;

export function SchedulesPage() {
  const { user } = useAuth();
  const options = useScheduleOptions();
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [items, setItems] = useState<Schedule[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Schedule | 'new' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const canEdit = user?.role !== 'STUDENT';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = queryString({ ...applied, page, pageSize });
      const response = await fetch(`/api/schedules?${qs}`, { credentials: 'same-origin' });
      const body = await response.json() as { data?: Schedule[]; meta?: { total: number }; error?: { message: string } };
      if (!response.ok) throw new Error(body.error?.message ?? '加载失败');
      setItems(body.data ?? []); setTotal(body.meta?.total ?? 0);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '加载失败'); }
    finally { setLoading(false); }
  }, [applied, page, pageSize]);
  useEffect(() => { void load(); }, [load]);

  function applyFilters(event: FormEvent) { event.preventDefault(); setApplied(filters); setPage(1); setSelected(new Set()); }
  function resetFilters() { setFilters(emptyFilters); setApplied(emptyFilters); setPage(1); setSelected(new Set()); }
  async function remove(item: Schedule) {
    if (!confirm(`确定删除「${item.subject}」吗？\n删除后不可恢复，已完课课程也不会返还课时。`)) return;
    try { await api(`/schedules/${item.id}`, { method: 'DELETE' }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : '删除失败'); }
  }
  async function toggleComplete(item: Schedule) {
    try { await api(`/schedules/${item.id}/completion`, { method: 'PATCH', body: JSON.stringify({ completed: !item.is_completed, version: item.version }) }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); }
  }
  async function bulkDelete(mode: 'ids' | 'filtered') {
    const count = mode === 'ids' ? selected.size : total;
    if (!count || !confirm(`将删除 ${count} 条排课。已完课记录不会返还课时，确定继续吗？`)) return;
    setBusy(true);
    try {
      const body = mode === 'ids' ? { mode, ids: [...selected] } : { mode, filters: cleanFilters(applied), expectedCount: total };
      await api('/schedules/bulk-delete', { method: 'POST', body: JSON.stringify(body) }); setSelected(new Set()); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '批量删除失败'); }
    finally { setBusy(false); }
  }
  async function exportRows() {
    setBusy(true); setError('');
    try {
      const rows: Schedule[] = [];
      if (selected.size) {
        const ids = [...selected];
        for (let offset = 0; offset < ids.length; offset += 80) {
          rows.push(...await api<Schedule[]>(`/schedules/export-data?${queryString({ ids: ids.slice(offset, offset + 80).join(','), limit: 80 })}`));
        }
      } else {
        for (let offset = 0; ; offset += 500) {
          const batch = await api<Schedule[]>(`/schedules/export-data?${queryString({ ...applied, offset, limit: 500 })}`);
          rows.push(...batch); if (batch.length < 500) break;
        }
      }
      const { Workbook } = await import('exceljs');
      const workbook = new Workbook(); const sheet = workbook.addWorksheet('排课记录');
      sheet.columns = [
        { header: '日期', key: 'date', width: 14 }, { header: '时间', key: 'time', width: 16 },
        { header: '科目', key: 'subject', width: 20 }, { header: '教师', key: 'teacher', width: 14 },
        { header: '学生', key: 'student', width: 14 }, { header: '教室', key: 'room', width: 16 },
        { header: '课时', key: 'hours', width: 10 }, { header: '状态', key: 'status', width: 10 },
      ];
      rows.forEach((row) => sheet.addRow({ date: row.class_date, time: `${row.start_time}-${row.end_time}`, subject: safeCell(row.subject), teacher: safeCell(row.teacher_name), student: safeCell((row.student_names?.length ? row.student_names : [row.student_name]).join('、')), room: safeCell(row.classroom), hours: row.lesson_hundredths / 100, status: row.is_completed ? '已完课' : '未完课' }));
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF315C4D' } };
      const buffer = await workbook.xlsx.writeBuffer(); const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `排课记录-${dayjs().format('YYYYMMDD')}.xlsx`; link.click(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '导出失败'); }
    finally { setBusy(false); }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">课程档案</p><h1>排课管理</h1><p>{user?.role === 'STUDENT' ? '查看与你相关的课程记录。' : '新增、调整课程并跟进完课状态。'}</p></div>{canEdit && <Button onClick={() => setEditing('new')}><Plus size={18} />新增排课</Button>}</header>
    <Notice error={error} />
    <form className={`filter-panel ${filtersOpen ? '' : 'filter-panel--collapsed'}`} onSubmit={applyFilters}>
      <div className="filter-title"><span><Filter size={17} />筛选</span><button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>{filtersOpen ? '收起' : '展开'}</button></div>
      {user?.role === 'ADMIN' && <Field label="教师"><Select value={filters.teacherId} onChange={(e) => setFilters({ ...filters, teacherId: e.target.value })}><option value="">全部教师</option>{options.teachers.map((x) => <option value={x.id} key={x.id}>{x.name}</option>)}</Select></Field>}
      {user?.role !== 'STUDENT' && <Field label="学生"><Select value={filters.studentId} onChange={(e) => setFilters({ ...filters, studentId: e.target.value })}><option value="">全部学生</option>{options.students.map((x) => <option value={x.id} key={x.id}>{x.name}</option>)}</Select></Field>}
      <Field label="开始日期"><Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} /></Field>
      <Field label="结束日期"><Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} /></Field>
      <Field label="科目"><Input value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })} placeholder="输入科目" /></Field>
      <Field label="教室"><Input value={filters.classroom} onChange={(e) => setFilters({ ...filters, classroom: e.target.value })} placeholder="输入教室" /></Field>
      <Field label="状态"><Select value={filters.completed} onChange={(e) => setFilters({ ...filters, completed: e.target.value })}><option value="">全部</option><option value="false">未完课</option><option value="true">已完课</option></Select></Field>
      <div className="filter-actions"><Button type="submit">查询</Button><Button type="button" variant="ghost" onClick={resetFilters}>重置</Button></div>
    </form>
    <div className="table-toolbar"><span>共 {total} 条{selected.size > 0 && ` · 已选 ${selected.size} 条`}</span><div><Button variant="secondary" disabled={busy || total === 0} onClick={() => void exportRows()}><Download size={17} />{selected.size ? '导出选中' : '导出筛选结果'}</Button>{user?.role === 'ADMIN' && selected.size > 0 && <Button variant="danger" disabled={busy} onClick={() => void bulkDelete('ids')}><Trash2 size={17} />删除选中</Button>}{user?.role === 'ADMIN' && total > 0 && <Button variant="ghost" disabled={busy} onClick={() => void bulkDelete('filtered')}>删除全部筛选结果</Button>}</div></div>
    {loading ? <LoadingState /> : items.length === 0 ? <EmptyState title="没有符合条件的课程" text="调整筛选条件，或新建第一条排课。" action={canEdit && <Button onClick={() => setEditing('new')}>新增排课</Button>} /> : <>
      <div className="data-table-wrap"><table className="data-table"><thead><tr>{user?.role === 'ADMIN' && <th><input type="checkbox" aria-label="选择本页全部" checked={items.every((x) => selected.has(x.id))} onChange={(e) => setSelected(e.target.checked ? new Set([...selected, ...items.map((x) => x.id)]) : new Set([...selected].filter((id) => !items.some((x) => x.id === id))))} /></th>}<th>日期 / 时间</th><th>科目</th><th>教师</th><th>学生</th><th>教室</th><th>课时</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map((item) => <ScheduleRow key={item.id} item={item} admin={user?.role === 'ADMIN'} canEdit={canEdit} selected={selected.has(item.id)} onSelect={(checked) => setSelected((old) => { const next = new Set(old); if (checked) next.add(item.id); else next.delete(item.id); return next; })} onEdit={() => setEditing(item)} onDelete={() => void remove(item)} onComplete={() => void toggleComplete(item)} />)}</tbody></table></div>
      <div className="schedule-cards">{items.map((item) => <ScheduleMobileCard key={item.id} item={item} canEdit={canEdit} onEdit={() => setEditing(item)} onDelete={() => void remove(item)} onComplete={() => void toggleComplete(item)} />)}</div>
      <div className="pagination"><label>每页 <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>{[10, 20, 50, 100].map((n) => <option key={n}>{n}</option>)}</select> 条</label><span>第 {page} / {pages} 页</span><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button><Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</Button></div>
    </>}
    <ScheduleDialog open={editing !== null} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onChanged={() => { setEditing(null); void load(); }} />
  </div>;
}

function cleanFilters(filters: ScheduleFilters) { return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')); }

function ScheduleRow({ item, admin, canEdit, selected, onSelect, onEdit, onDelete, onComplete }: { item: Schedule; admin: boolean; canEdit: boolean; selected: boolean; onSelect: (value: boolean) => void; onEdit: () => void; onDelete: () => void; onComplete: () => void }) {
  return <tr>{admin && <td><input type="checkbox" aria-label={`选择 ${item.subject}`} checked={selected} onChange={(e) => onSelect(e.target.checked)} /></td>}<td><strong>{item.class_date}</strong><span>{item.start_time}–{item.end_time}</span></td><td>{item.subject}</td><td>{item.teacher_name}</td><td title={item.student_names?.join('、')}>{compactStudentNames(item)}</td><td>{item.classroom || '—'}</td><td>{lessonText(item.lesson_hundredths)}</td><td><span className={`status ${item.is_completed ? 'status--done' : ''}`}>{item.is_completed ? '已完课' : '未完课'}</span></td><td>{canEdit ? <div className="row-actions"><button aria-label={item.is_completed ? '取消完课' : '标记完课'} title={item.is_completed ? '取消完课' : '标记完课'} onClick={onComplete}>{item.is_completed ? <X /> : <Check />}</button><button aria-label="编辑" onClick={onEdit}><Pencil /></button><button aria-label="删除" onClick={onDelete}><Trash2 /></button></div> : <button className="text-button" onClick={onEdit}>查看</button>}</td></tr>;
}

function ScheduleMobileCard({ item, canEdit, onEdit, onDelete, onComplete }: { item: Schedule; canEdit: boolean; onEdit: () => void; onDelete: () => void; onComplete: () => void }) {
  return <article className="mobile-card"><header><div><strong>{item.subject}</strong><span>{item.class_date} · {item.start_time}–{item.end_time}</span></div><span className={`status ${item.is_completed ? 'status--done' : ''}`}>{item.is_completed ? '已完课' : '未完课'}</span></header><dl><div><dt>教师</dt><dd>{item.teacher_name}</dd></div><div><dt>学生</dt><dd>{compactStudentNames(item)}</dd></div><div><dt>教室</dt><dd>{item.classroom || '—'}</dd></div><div><dt>课时</dt><dd>{lessonText(item.lesson_hundredths)}</dd></div></dl><footer>{canEdit && <Button variant="ghost" onClick={onComplete}>{item.is_completed ? '取消完课' : '标记完课'}</Button>}<Button variant="secondary" onClick={onEdit}>{canEdit ? '编辑' : '查看'}</Button>{canEdit && <Button variant="danger" onClick={onDelete}>删除</Button>}</footer></article>;
}
