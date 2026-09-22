/* eslint-disable react-hooks/set-state-in-effect */
import { ChevronDown, KeyRound, MinusCircle, Pencil, Plus, PlusCircle, Trash2, UserCheck, UserX } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button, Dialog, EmptyState, Field, Input, LoadingState, Notice, Select, Textarea } from '../components/ui';
import { api, queryString } from '../lib/api';
import type { Role, UserRecord, UserStatus } from '../types';

const roleNames = { ADMIN: '管理员', TEACHER: '教师', STUDENT: '学生' };

export function UsersPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState(''); const [role, setRole] = useState(''); const [status, setStatus] = useState('');
  const [items, setItems] = useState<UserRecord[]>([]); const [page, setPage] = useState(1); const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [editing, setEditing] = useState<UserRecord | 'new' | null>(null); const [adjusting, setAdjusting] = useState<UserRecord | null>(null);
  const [resetting, setResetting] = useState<UserRecord | null>(null); const [filtersOpen, setFiltersOpen] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const response = await fetch(`/api/users?${queryString({ search, role, status, page, pageSize: 20 })}`); const body = await response.json() as { data?: UserRecord[]; meta?: { total: number }; error?: { message: string } }; if (!response.ok) throw new Error(body.error?.message); setItems(body.data ?? []); setTotal(body.meta?.total ?? 0); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '加载失败'); } finally { setLoading(false); }
  }, [search, role, status, page]);
  useEffect(() => { if (user?.role === 'ADMIN') void load(); }, [load, user]);
  if (user?.role !== 'ADMIN') return <Navigate to="/calendar" replace />;
  async function changeStatus(item: UserRecord) {
    const next: UserStatus = item.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    if (next === 'DISABLED' && !confirm(`停用「${item.display_name}」后，该账号将无法登录或参与新排课。历史课程仍会保留。`)) return;
    try { await api(`/users/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); }
  }
  async function deleteUser(item: UserRecord) {
    if (!confirm(`确定删除「${item.display_name}」吗？\n\n删除后该账号不可登录、不能参与新排课，历史排课仍会保留。此操作不可撤销。`)) return;
    try { await api(`/users/${item.id}`, { method: 'DELETE' }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除失败'); }
  }
  return <div className="page"><header className="page-header"><div><p className="eyebrow">账号与课时</p><h1>用户管理</h1><p>维护教师、学生和管理员账号。停用不会影响历史排课。</p></div><Button onClick={() => setEditing('new')}><Plus size={18} />新增用户</Button></header><Notice error={error} />
    <section className={`users-filter-panel ${filtersOpen ? '' : 'users-filter-panel--closed'}`}><button type="button" className="users-filter-toggle" aria-expanded={filtersOpen} aria-controls="user-filters" onClick={() => setFiltersOpen((value) => !value)}><span>筛选用户</span><ChevronDown size={18} /></button>{filtersOpen && <form id="user-filters" className="users-filter" onSubmit={(e) => { e.preventDefault(); setPage(1); void load(); }}><Input aria-label="搜索姓名" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索姓名" /><Select aria-label="筛选身份" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="">全部身份</option><option value="ADMIN">管理员</option><option value="TEACHER">教师</option><option value="STUDENT">学生</option></Select><Select aria-label="筛选状态" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">全部状态</option><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></Select><Button>搜索</Button></form>}</section>
    <div className="table-toolbar"><span>共 {total} 位用户</span></div>
    {loading ? <LoadingState /> : items.length === 0 ? <EmptyState title="没有找到用户" text="更换搜索条件后再试。" /> : <><div className="user-grid">{items.map((item) => <article className={`user-card ${item.status === 'DISABLED' ? 'user-card--disabled' : ''}`} key={item.id}><header><div className="avatar avatar--large">{item.display_name.slice(0, 1)}</div><div><h2>{item.display_name}</h2><span>{roleNames[item.role]} · {item.deleted_at ? '已删除' : item.status === 'ACTIVE' ? '正常使用' : '已停用'}</span></div></header><dl>{item.role === 'TEACHER' && <div><dt>教授科目</dt><dd>{item.subject || '未填写'}</dd></div>}{item.role === 'STUDENT' && <><div><dt>学校 / 年级</dt><dd>{[item.school, item.grade].filter(Boolean).join(' · ') || '未填写'}</dd></div><div className="balance"><dt>预计剩余</dt><dd>{((item.remaining_hundredths ?? 0) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 课时</dd></div></>}</dl>{item.deleted_at ? <footer><span className="muted">历史课程与姓名已保留</span></footer> : <footer><Button variant="ghost" onClick={() => setEditing(item)}><Pencil size={16} />编辑</Button><Button variant="secondary" onClick={() => setResetting(item)}><KeyRound size={16} />重置密码</Button>{item.role === 'STUDENT' && <Button variant="secondary" onClick={() => setAdjusting(item)}><PlusCircle size={16} />调整课时</Button>}<Button variant={item.status === 'ACTIVE' ? 'danger' : 'secondary'} onClick={() => void changeStatus(item)}>{item.status === 'ACTIVE' ? <><UserX size={16} />停用</> : <><UserCheck size={16} />启用</>}</Button><Button variant="danger" onClick={() => void deleteUser(item)}><Trash2 size={16} />删除</Button></footer>}</article>)}</div><div className="pagination"><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页</span><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button><Button variant="secondary" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>下一页</Button></div></>}
    <UserDialog open={editing !== null} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />
    <AdjustmentDialog item={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); void load(); }} />
    <ResetPasswordDialog item={resetting} onClose={() => setResetting(null)} />
  </div>;
}

function UserDialog({ open, item, onClose, onSaved }: { open: boolean; item: UserRecord | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ username: '', password: '', role: 'STUDENT' as Role, subject: '', school: '', grade: '' }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(item ? { username: item.username, password: '', role: item.role, subject: item.subject ?? '', school: item.school ?? '', grade: item.grade ?? '' } : { username: '', password: '', role: 'STUDENT', subject: '', school: '', grade: '' }); setError(''); }, [item, open]);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await api(item ? `/users/${item.id}` : '/users', { method: item ? 'PATCH' : 'POST', body: JSON.stringify(form) }); onSaved(); } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); } finally { setBusy(false); } }
  return <Dialog open={open} title={item ? '编辑用户' : '新增用户'} onClose={onClose}><form className="dialog-form" onSubmit={submit}><Notice error={error} /><Field label="姓名"><Input required maxLength={40} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>{!item && <><Field label="初始密码" hint="至少 5 位字符"><Input required minLength={5} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field><Field label="身份"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}><option value="STUDENT">学生</option><option value="TEACHER">教师</option><option value="ADMIN">管理员</option></Select></Field></>}{form.role === 'TEACHER' && <Field label="教授科目" hint="自由文本，可填写多个科目"><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="例如：语文、历史" /></Field>}{form.role === 'STUDENT' && <div className="form-grid"><Field label="学校"><Input value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} /></Field><Field label="年级"><Input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></Field></div>}<footer><Button type="button" variant="secondary" onClick={onClose}>取消</Button><Button disabled={busy}>{busy ? '保存中…' : '保存'}</Button></footer></form></Dialog>;
}

function ResetPasswordDialog({ item, onClose }: { item: UserRecord | null; onClose: () => void }) {
  const [password, setPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState(''); const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { setPassword(''); setConfirmPassword(''); setError(''); setSuccess(''); }, [item]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!item) return; setError(''); setSuccess('');
    if (password !== confirmPassword) { setError('两次输入的新密码不一致'); return; }
    setBusy(true);
    try { await api(`/users/${item.id}/password`, { method: 'POST', body: JSON.stringify({ password }) }); setPassword(''); setConfirmPassword(''); setSuccess('密码已重置，该用户现有登录已退出。'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '重置失败'); }
    finally { setBusy(false); }
  }
  return <Dialog open={Boolean(item)} title={`重置密码 · ${item?.display_name ?? ''}`} onClose={onClose}><form className="dialog-form" onSubmit={submit}><p className="muted">重置后，该用户在其他设备上的登录会立即失效。</p><Notice error={error} success={success} /><Field label="新密码" hint="至少 5 位字符"><Input required minLength={5} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field><Field label="确认新密码"><Input required minLength={5} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" aria-invalid={Boolean(confirmPassword && password !== confirmPassword)} /></Field><footer><Button type="button" variant="secondary" onClick={onClose}>取消</Button><Button disabled={busy}>{busy ? '重置中…' : '确认重置'}</Button></footer></form></Dialog>;
}

interface Adjustment { id: number; amount_hundredths: number; note: string; created_at: string; operator_name: string }
function AdjustmentDialog({ item, onClose, onSaved }: { item: UserRecord | null; onClose: () => void; onSaved: () => void }) {
  const [hours, setHours] = useState(''); const [direction, setDirection] = useState<'add' | 'subtract'>('add'); const [note, setNote] = useState(''); const [records, setRecords] = useState<Adjustment[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [requestId, setRequestId] = useState('');
  useEffect(() => { if (item) api<Adjustment[]>(`/users/${item.id}/adjustments`).then(setRecords).catch(() => setRecords([])); setHours(''); setNote(''); setError(''); setRequestId(''); }, [item]);
  async function submit(event: FormEvent) { event.preventDefault(); if (!item) return; const amount = Math.round(Number(hours) * 100) * (direction === 'add' ? 1 : -1); if (!Number.isFinite(amount) || amount === 0) return setError('请输入非零课时'); const operationId = requestId || crypto.randomUUID(); if (!requestId) setRequestId(operationId); setBusy(true); try { await api(`/users/${item.id}/adjust-hours`, { method: 'POST', body: JSON.stringify({ amountHundredths: amount, note, requestId: operationId }) }); setRequestId(''); onSaved(); } catch (reason) { setError(reason instanceof Error ? reason.message : '调整失败'); } finally { setBusy(false); } }
  return <Dialog open={Boolean(item)} title={`调整课时 · ${item?.display_name ?? ''}`} onClose={onClose} wide><form className="dialog-form" onSubmit={submit}><Notice error={error} /><p className="muted">当前预计剩余 <strong>{((item?.remaining_hundredths ?? 0) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 课时</strong>。仅供参考，具体以排课记录为准。</p><div className="adjust-row"><div className="segment"><button type="button" className={direction === 'add' ? 'active' : ''} onClick={() => setDirection('add')}><PlusCircle size={16} />增加</button><button type="button" className={direction === 'subtract' ? 'active' : ''} onClick={() => setDirection('subtract')}><MinusCircle size={16} />减少</button></div><Field label="课时数量"><Input required min="0.01" step="0.01" type="number" value={hours} onChange={(e) => setHours(e.target.value)} /></Field></div><Field label="调整备注"><Textarea required maxLength={200} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="说明调整原因" /></Field><footer><Button type="button" variant="secondary" onClick={onClose}>取消</Button><Button disabled={busy}>确认调整</Button></footer></form><div className="adjust-history"><h3>最近调整记录</h3>{records.length ? <ul>{records.map((record) => <li key={record.id}><span className={record.amount_hundredths > 0 ? 'positive' : 'negative'}>{record.amount_hundredths > 0 ? '+' : ''}{record.amount_hundredths / 100}</span><div><strong>{record.note}</strong><small>{record.operator_name} · {new Date(record.created_at).toLocaleString('zh-CN')}</small></div></li>)}</ul> : <p className="muted">暂无人工调整记录</p>}</div></Dialog>;
}
