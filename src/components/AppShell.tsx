import { CalendarDays, ClipboardList, KeyRound, LogOut, Menu, Pencil, Users, X } from 'lucide-react';
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
    <main className="main-content">{children}</main>{profileOpen && <ProfileDialog open onClose={() => setProfileOpen(false)} />}
  </div>;
}

function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout, clearSession, updateUser } = useAuth();
  const [subject, setSubject] = useState(user?.subject ?? ''); const [school, setSchool] = useState(user?.school ?? ''); const [grade, setGrade] = useState(user?.grade ?? '');
  const [profileError, setProfileError] = useState(''); const [profileSuccess, setProfileSuccess] = useState(''); const [profileBusy, setProfileBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState(''); const [newPassword, setNewPassword] = useState(''); const [passwordError, setPasswordError] = useState(''); const [passwordBusy, setPasswordBusy] = useState(false);
  if (!user) return null;
  async function saveProfile(event: FormEvent) {
    if (!user) return;
    event.preventDefault(); setProfileBusy(true); setProfileError(''); setProfileSuccess('');
    const profile = user.role === 'TEACHER' ? { subject } : { school, grade };
    try {
      const saved = await api<{ subject?: string; school?: string; grade?: string }>('/auth/profile', { method: 'PATCH', body: JSON.stringify(profile) });
      updateUser(saved); setSubject(saved.subject ?? subject); setSchool(saved.school ?? school); setGrade(saved.grade ?? grade); setProfileSuccess('资料已保存');
    } catch (reason) { setProfileError(reason instanceof Error ? reason.message : '保存失败'); } finally { setProfileBusy(false); }
  }
  async function changePassword(event: FormEvent) { event.preventDefault(); setPasswordBusy(true); setPasswordError(''); try { await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }); clearSession(); } catch (reason) { setPasswordError(reason instanceof Error ? reason.message : '修改失败'); } finally { setPasswordBusy(false); } }
  return <Dialog title="我的资料" open={open} onClose={onClose}>
    <div className="profile-summary"><div className="avatar avatar--large">{user.displayName.slice(0, 1)}</div><div><strong>{user.displayName}</strong><span>{roleNames[user.role]}</span></div></div>
    {user.role !== 'ADMIN' && <form className="dialog-form profile-section" onSubmit={saveProfile}>
      <h3><Pencil size={17} />编辑资料</h3><Notice error={profileError} success={profileSuccess} />
      {user.role === 'TEACHER' && <Field label="教授科目" hint="可填写多个科目，用顿号分隔"><Input maxLength={100} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="例如：语文、历史" /></Field>}
      {user.role === 'STUDENT' && <div className="form-grid"><Field label="学校"><Input maxLength={100} value={school} onChange={(event) => setSchool(event.target.value)} placeholder="填写所在学校" /></Field><Field label="年级"><Input maxLength={50} value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="例如：初三" /></Field></div>}
      {user.role === 'STUDENT' && <div className="profile-balance"><span>预计剩余课时</span><strong>{((user.remainingHundredths ?? 0) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} 课时</strong><small>仅供参考，具体以排课记录为准。</small></div>}
      <footer><Button disabled={profileBusy}>{profileBusy ? '保存中…' : '保存资料'}</Button></footer>
    </form>}
    <form className="dialog-form profile-password" onSubmit={changePassword}><h3><KeyRound size={17} />修改密码</h3><Notice error={passwordError} /><Field label="当前密码"><Input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" /></Field><Field label="新密码" hint="至少 5 位字符；修改后需重新登录"><Input type="password" required minLength={5} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></Field><footer><Button type="button" variant="danger" onClick={() => void logout()}><LogOut size={16} />退出登录</Button><Button disabled={passwordBusy}>{passwordBusy ? '更新中…' : '更新密码'}</Button></footer></form>
  </Dialog>;
}
