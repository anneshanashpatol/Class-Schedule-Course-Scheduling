import type { Context } from 'hono';

export class AppError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 422,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function jsonError(c: Context, error: unknown) {
  if (error instanceof AppError) {
    return c.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      error.status,
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('UNIQUE constraint failed: users.username')) {
    return c.json({ error: { code: 'USERNAME_TAKEN', message: '该姓名已被使用，请添加后缀' } }, 409);
  }
  if (message.includes('SCHEDULE_CONFLICT')) {
    return c.json({ error: { code: 'SCHEDULE_CONFLICT', message: '教师、学生或教室在该时间已有排课' } }, 409);
  }
  if (message.includes('COMPLETED_SCHEDULE_LOCKED')) {
    return c.json({ error: { code: 'COMPLETED_SCHEDULE_LOCKED', message: '已完课课程需先取消完课才能修改学生和时间' } }, 409);
  }
  if (message.includes('TEACHER_NOT_ACTIVE') || message.includes('STUDENT_NOT_ACTIVE')) {
    return c.json({ error: { code: 'USER_NOT_ACTIVE', message: '排课参与者必须处于启用状态' } }, 409);
  }
  if (message.includes('LAST_ACTIVE_ADMIN')) {
    return c.json({ error: { code: 'LAST_ADMIN', message: '不能停用最后一个启用的管理员' } }, 409);
  }
  console.error(error);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试' } }, 500);
}
