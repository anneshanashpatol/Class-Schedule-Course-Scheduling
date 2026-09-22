/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { AuthUser, Role } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, role: Exclude<Role, 'ADMIN'>) => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<AuthUser>('/auth/me').then(setUser).catch(() => setUser(null)).finally(() => setLoading(false)); }, []);
  const value = useMemo<AuthContextValue>(() => ({
    user, loading,
    login: async (username, password) => setUser(await api<AuthUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })),
    register: async (username, password, role) => setUser(await api<AuthUser>('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, role }) })),
    logout: async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); },
    clearSession: () => setUser(null),
  }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
