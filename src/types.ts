import type { Role, UserStatus } from '../shared/domain';

export type { Role, UserStatus };

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  deleted_at?: string | null;
  subject?: string;
  school?: string;
  grade?: string;
  remainingHundredths?: number;
}

export interface Schedule {
  id: number;
  teacher_name: string;
  student_name: string;
  student_names?: string[];
  subject: string;
  class_date: string;
  start_time: string;
  end_time: string;
  lesson_hundredths: number;
  classroom: string;
  is_completed: number;
  version: number;
}

export interface UserRecord {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  status: UserStatus;
  deleted_at?: string | null;
  created_at: string;
  subject?: string;
  school?: string;
  grade?: string;
  remaining_hundredths?: number;
}

export interface PersonOption { id: number; name: string; subject?: string; status?: UserStatus }

export interface ScheduleFilters {
  teacherName: string;
  studentName: string;
  dateFrom: string;
  dateTo: string;
  subject: string;
  classroom: string;
  completed: string;
}
