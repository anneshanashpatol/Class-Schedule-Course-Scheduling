DROP TRIGGER IF EXISTS schedules_lock_completed;
DROP TRIGGER IF EXISTS lesson_adjustment_balance;
DROP TRIGGER IF EXISTS users_keep_last_admin;
DROP TRIGGER IF EXISTS users_create_student_profile;
DROP TRIGGER IF EXISTS users_create_teacher_profile;
DROP INDEX IF EXISTS idx_adjustments_request_id;
-- SQLite 无法直接 DROP COLUMN；回退 request_id 需要重建 lesson_adjustments 表。
