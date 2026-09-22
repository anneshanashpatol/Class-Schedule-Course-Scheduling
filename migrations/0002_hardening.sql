ALTER TABLE lesson_adjustments ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX idx_adjustments_request_id ON lesson_adjustments(request_id) WHERE request_id IS NOT NULL;

CREATE TRIGGER users_create_teacher_profile
AFTER INSERT ON users
WHEN NEW.role = 'TEACHER'
BEGIN
  INSERT INTO teacher_profiles (user_id) VALUES (NEW.id);
END;

CREATE TRIGGER users_create_student_profile
AFTER INSERT ON users
WHEN NEW.role = 'STUDENT'
BEGIN
  INSERT INTO student_profiles (user_id) VALUES (NEW.id);
END;

CREATE TRIGGER users_keep_last_admin
BEFORE UPDATE OF status ON users
WHEN OLD.role = 'ADMIN' AND OLD.status = 'ACTIVE' AND NEW.status = 'DISABLED'
  AND (SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE') <= 1
BEGIN
  SELECT RAISE(ABORT, 'LAST_ACTIVE_ADMIN');
END;

CREATE TRIGGER lesson_adjustment_balance
AFTER INSERT ON lesson_adjustments
BEGIN
  UPDATE student_profiles
  SET remaining_hundredths = remaining_hundredths + NEW.amount_hundredths
  WHERE user_id = NEW.student_id;
END;

DROP TRIGGER schedules_lock_completed;
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
