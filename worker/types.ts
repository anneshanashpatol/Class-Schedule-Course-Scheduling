import type { Role, UserStatus } from '../shared/domain';

export interface Env {
  DB: D1Database;
  APP_ENV?: string;
}

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  status: UserStatus;
}

export type AppVariables = {
  user: AuthUser;
  sessionTokenHash: string;
};

export type AppBindings = { Bindings: Env; Variables: AppVariables };

