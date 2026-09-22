DROP TRIGGER IF EXISTS keep_recent_adjustments;
DROP TRIGGER IF EXISTS schedules_completion_balance;
DROP TRIGGER IF EXISTS schedules_lock_completed;
DROP TRIGGER IF EXISTS schedules_prevent_conflict_update;
DROP TRIGGER IF EXISTS schedules_prevent_conflict_insert;
DROP TRIGGER IF EXISTS schedules_validate_people_update;
DROP TRIGGER IF EXISTS schedules_validate_people_insert;
DROP TABLE IF EXISTS app_settings;
DROP TABLE IF EXISTS lesson_adjustments;
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS student_profiles;
DROP TABLE IF EXISTS teacher_profiles;
DROP TABLE IF EXISTS users;

