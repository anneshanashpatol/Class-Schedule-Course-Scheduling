import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/ui';
import { AuthPage } from './pages/AuthPage';
import { CalendarPage } from './pages/CalendarPage';
import { SchedulesPage } from './pages/SchedulesPage';
import { UsersPage } from './pages/UsersPage';

function ProtectedLayout() { const { user, loading } = useAuth(); if (loading) return <main className="center-page"><LoadingState /></main>; if (!user) return <Navigate to="/login" replace />; return <AppShell><Outlet /></AppShell>; }
export default function App() { return <Routes><Route path="/login" element={<AuthPage />} /><Route element={<ProtectedLayout />}><Route path="/calendar" element={<CalendarPage />} /><Route path="/schedules" element={<SchedulesPage />} /><Route path="/users" element={<UsersPage />} /><Route index element={<Navigate to="/calendar" replace />} /></Route><Route path="*" element={<Navigate to="/calendar" replace />} /></Routes>; }
