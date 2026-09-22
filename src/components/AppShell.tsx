import { CalendarDays, ClipboardList, KeyRound, LogOut, Menu, Users, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { Button, Dialog, Field, Input, Notice } from './ui';

const roleNames = { ADMIN: '管理员', TEACHER: '教师', STUDENT: '学生' };

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth(); const [open, setOpen] = useState(false); const [profileOpen, setProfileOpen] = useState(false);
  if (!user) return null;
  const links = [{ to: '/calendar', label: '课程表', icon: CalendarDays }, { to: '/schedules', label: '排课管理', icon: ClipboardList }, ...(user.role === 'ADMIN' ? [{ to: '/users', label: '用户管理', icon: Users }] : [])];
  return <div className="app-shell">
    <header className="mobile-header"><div className="brand"><span className="brand__mark"><CalendarDays /></span><span>前程π日程</span></div><button className="icon-button" aria-label="打开菜单" onClick={() => setOpen(true)}><Menu /></button></header>
    {open && <button className="sidebar-scrim" aria-label="关闭菜单" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? 'sidebar--open' : ''}`}><div className="sidebar__top"><div className="brand"><span className="brand__mark"><CalendarDays /></span><span>前程π日程</span></div><button className="icon-button mobile-only" aria-label="关闭菜单" onClick={() => setOpen(false)}><X /></button></div><nav aria-label="主导航">{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={19} />{label}</NavLink>)}</nav><div className="sidebar__user"><button className="avatar avatar-button" aria-label="查看我的资料" onClick={() => setProfileOpen(true)}>{user.displayName.slice(0, 1)}</button><button className="sidebar__identity" onClick={() => setProfileOpen(true)}><strong>{user.displayName}</strong><span>{roleNames[user.role]} · 我的资料</span></button><button className="icon-button" onClick={() => void logout()} aria-label="退出登录"><LogOut size={18} /></button></div></aside>
    <main className="main-content">{children}</main><ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
  </div>;
}

function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout, clearSession } = useAuth(); const [currentPassword, setCurrentPassword] = useState(''); const [newPassword, setNewPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (!user) return null;
  async function changePassword(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }); clearSession(); } catch (reason) { setError(reason instanceof Error ? reason.message : '修改失败'); } finally { setBusy(false); } }
  return <Dialog title="我的资料" open={open} onClose={onClose}><div className="profile-summary"><div className="avatar avatar--large">{user.displayName.slice(0, 1)}</div><div><strong>{user.displayName}</strong><span>{roleNames[user.role]}</span></div></div><dl className="profile-details">{user.role === 'TEACHER' && <div><dt>教授科目</dt><dd>{user.subject || '未填写'}</dd></div>}{user.role === 'STUDENT' && <><div><dt>学校 / 年级</dt><dd>{[user.school, user.grade].filter(Boolean).join(' · ') || '未填写'}</dd></div><div><dt>预计剩余课时</dt><dd>{((user.remainingHundredths ?? 0) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 课时</dd></div><p>仅供参考，具体以排课记录为准。</p></>}</dl><form className="dialog-form profile-password" onSubmit={changePassword}><h3><KeyRound size={17} />修改密码</h3><Notice error={error} /><Field label="当前密码"><Input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" /></Field><Field label="新密码" hint="至少 5 位字符；修改后需重新登录"><Input type="password" required minLength={5} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></Field><footer><Button type="button" variant="danger" onClick={() => void logout()}><LogOut size={16} />退出登录</Button><Button disabled={busy}>{busy ? '更新中…' : '更新密码'}</Button></footer></form></Dialog>;
}
