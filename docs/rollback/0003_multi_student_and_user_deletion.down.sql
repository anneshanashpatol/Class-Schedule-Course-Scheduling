DROP TRIGGER IF EXISTS schedules_completion_balance;
DROP TRIGGER IF EXISTS schedule_students_lock_completed_insert;
DROP TRIGGER IF EXISTS schedules_version_step;
DROP TRIGGER IF EXISTS schedules_lock_completed;
DROP TRIGGER IF EXISTS schedule_students_validate_insert;
DROP TRIGGER IF EXISTS schedules_prevent_resource_conflict_update;
DROP TRIGGER IF EXISTS schedules_prevent_resource_conflict_insert;
DROP TRIGGER IF EXISTS schedules_validate_teacher_update;
DROP TRIGGER IF EXISTS schedules_validate_teacher_insert;
DROP INDEX IF EXISTS idx_schedule_students_schedule_position;
DROP INDEX IF EXISTS idx_schedule_students_student;
DROP TABLE IF EXISTS schedule_students;

CREATE TRIGGER schedules_validate_people_insert
BEFORE INSERT ON schedules
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.teacher_id AND role = 'TEACHER' AND status = 'ACTIVE'
  ) THEN RAISE(ABORT, 'TEACHER_NOT_ACTIVE') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.student_id AND role = 'STUDENT' AND status = 'ACTIVE'
  ) THEN RAISE(ABORT, 'STUDENT_NOT_ACTIVE') END;
END;

CREATE TRIGGER schedules_validate_people_update
BEFORE UPDATE OF teacher_id, student_id, class_date, start_time, end_time ON schedules
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.teacher_id AND role = 'TEACHER' AND status = 'ACTIVE'
  ) THEN RAISE(ABORT, 'TEACHER_NOT_ACTIVE') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.student_id AND role = 'STUDENT' AND status = 'ACTIVE'
  ) THEN RAISE(ABORT, 'STUDENT_NOT_ACTIVE') END;
END;

CREATE TRIGGER schedules_prevent_conflict_insert
BEFORE INSERT ON schedules
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.class_date = NEW.class_date
      AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time
      AND (s.teacher_id = NEW.teacher_id OR s.student_id = NEW.student_id
        OR (trim(NEW.classroom) != '' AND s.classroom = NEW.classroom))
  ) THEN RAISE(ABORT, 'SCHEDULE_CONFLICT') END;
END;

CREATE TRIGGER schedules_prevent_conflict_update
BEFORE UPDATE OF teacher_id, student_id, class_date, start_time, end_time, classroom ON schedules
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.id != NEW.id AND s.class_date = NEW.class_date
      AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time
      AND (s.teacher_id = NEW.teacher_id OR s.student_id = NEW.student_id
        OR (trim(NEW.classroom) != '' AND s.classroom = NEW.classroom))
  ) THEN RAISE(ABORT, 'SCHEDULE_CONFLICT') END;
END;

CREATE TRIGGER schedules_lock_completed
BEFORE UPDATE OF student_id, class_date, start_time, end_time, lesson_hundredths ON schedules
WHEN OLD.is_completed = 1 AND (
  OLD.student_id != NEW.student_id OR OLD.class_date != NEW.class_date
  OR OLD.start_time != NEW.start_time OR OLD.end_time != NEW.end_time
  OR OLD.lesson_hundredths != NEW.lesson_hundredths
)
BEGIN
  SELECT RAISE(ABORT, 'COMPLETED_SCHEDULE_LOCKED');
END;

CREATE TRIGGER schedules_completion_balance
AFTER UPDATE OF is_completed ON schedules
WHEN OLD.is_completed != NEW.is_completed
BEGIN
  UPDATE student_profiles
  SET remaining_hundredths = remaining_hundredths
    + CASE WHEN NEW.is_completed = 1 THEN -NEW.lesson_hundredths ELSE NEW.lesson_hundredths END
  WHERE user_id = NEW.student_id;
END;

ALTER TABLE users DROP COLUMN deleted_at;
