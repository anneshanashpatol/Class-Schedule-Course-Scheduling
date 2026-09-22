import { useState, type FormEvent } from 'react';
import { CalendarDays, CheckCircle2, Clock3 } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button, Field, Input, Notice, Select } from '../components/ui';
import type { Role } from '../types';

export function AuthPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'ADMIN'>>('STUDENT');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/calendar" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { if (mode === 'login') await login(username.trim(), password); else await register(username.trim(), password, role); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page">
    <section className="auth-story" aria-label="产品介绍">
      <div className="brand"><span className="brand__mark"><CalendarDays /></span><span>青禾排课</span></div>
      <div className="auth-story__copy"><p className="eyebrow">轻量教学管理</p><h1>每一节课，<br />都安排得清清楚楚。</h1><p>一处查看课程、完课进度和剩余课时，让老师把时间留给教学。</p></div>
      <ul><li><Clock3 /> 60 分钟固定为 1 课时</li><li><CheckCircle2 /> 课程冲突与完课状态清晰可见</li></ul>
    </section>
    <section className="auth-form-wrap">
      <form className="auth-form" onSubmit={submit}>
        <div><p className="eyebrow">{mode === 'login' ? '欢迎回来' : '开始使用'}</p><h2>{mode === 'login' ? '登录青禾排课' : '创建新账号'}</h2><p className="muted">使用姓名作为登录账号</p></div>
        <Notice error={error} />
        <Field label="姓名"><Input autoFocus required maxLength={40} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="例如：王老师" autoComplete="username" /></Field>
        <Field label="密码" hint={mode === 'register' ? '至少 8 位字符' : undefined}><Input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>
        {mode === 'register' && <Field label="身份"><Select value={role} onChange={(e) => setRole(e.target.value as Exclude<Role, 'ADMIN'>)}><option value="STUDENT">学生</option><option value="TEACHER">教师</option></Select></Field>}
        <Button type="submit" disabled={busy}>{busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并进入'}</Button>
        <p className="auth-switch">{mode === 'login' ? '还没有账号？' : '已经有账号？'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? '立即注册' : '返回登录'}</button></p>
      </form>
    </section>
  </main>;
}
