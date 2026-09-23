ALTER TABLE users ADD COLUMN deleted_at TEXT;

CREATE TABLE schedule_students (
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY (schedule_id, position),
  UNIQUE (schedule_id, student_name COLLATE NOCASE)
);

INSERT INTO schedule_students (schedule_id, student_name, position)
SELECT id, student_name, 0 FROM schedules;

CREATE INDEX idx_schedule_students_name ON schedule_students(student_name COLLATE NOCASE, schedule_id);
CREATE INDEX idx_schedule_students_schedule_position ON schedule_students(schedule_id, position);

DROP TRIGGER schedules_prevent_conflict_insert;
DROP TRIGGER schedules_prevent_conflict_update;
DROP TRIGGER schedules_lock_completed;
DROP TRIGGER schedules_completion_balance;

CREATE TRIGGER schedules_prevent_resource_conflict_insert
BEFORE INSERT ON schedules
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.class_date = NEW.class_date
      AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time
      AND (s.teacher_name = NEW.teacher_name COLLATE NOCASE
        OR (trim(NEW.classroom) != '' AND s.classroom = NEW.classroom))
  ) THEN RAISE(ABORT, 'SCHEDULE_CONFLICT') END);
END;

CREATE TRIGGER schedules_prevent_resource_conflict_update
BEFORE UPDATE OF teacher_name, class_date, start_time, end_time, classroom ON schedules
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.id != NEW.id AND s.class_date = NEW.class_date
      AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time
      AND (s.teacher_name = NEW.teacher_name COLLATE NOCASE
        OR (trim(NEW.classroom) != '' AND s.classroom = NEW.classroom))
  ) THEN RAISE(ABORT, 'SCHEDULE_CONFLICT') END);
  SELECT (CASE WHEN EXISTS (
    SELECT 1
    FROM schedule_students own_students
    JOIN schedule_students other_students ON other_students.student_name = own_students.student_name COLLATE NOCASE
    JOIN schedules other ON other.id = other_students.schedule_id
    WHERE own_students.schedule_id = NEW.id AND other.id != NEW.id
      AND other.class_date = NEW.class_date
      AND other.start_time < NEW.end_time AND other.end_time > NEW.start_time
  ) THEN RAISE(ABORT, 'SCHEDULE_CONFLICT') END);
END;

CREATE TRIGGER schedule_students_prevent_conflict_insert
BEFORE INSERT ON schedule_students
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1
    FROM schedules candidate
    JOIN schedule_students existing_students ON existing_students.student_name = NEW.student_name COLLATE NOCASE
    JOIN schedules existing ON existing.id = existing_students.schedule_id
    WHERE candidate.id = NEW.schedule_id AND existing.id != candidate.id
      AND existing.class_date = candidate.class_date
      AND existing.start_time < candidate.end_time AND existing.end_time > candidate.start_time
  ) THEN RAISE(ABORT, 'SCHEDULE_CONFLICT') END);
END;

CREATE TRIGGER schedules_lock_completed
BEFORE UPDATE OF student_name, class_date, start_time, end_time, lesson_hundredths ON schedules
WHEN OLD.is_completed = 1 AND (
  OLD.student_name != NEW.student_name COLLATE NOCASE OR OLD.class_date != NEW.class_date
  OR OLD.start_time != NEW.start_time OR OLD.end_time != NEW.end_time
  OR OLD.lesson_hundredths != NEW.lesson_hundredths
)
BEGIN
  SELECT RAISE(ABORT, 'COMPLETED_SCHEDULE_LOCKED');
END;

CREATE TRIGGER schedules_version_step
BEFORE UPDATE OF version ON schedules
WHEN NEW.version != OLD.version + 1
BEGIN
  SELECT RAISE(ABORT, 'VERSION_CONFLICT');
END;

CREATE TRIGGER schedule_students_lock_completed_insert
BEFORE INSERT ON schedule_students
WHEN (SELECT is_completed FROM schedules WHERE id = NEW.schedule_id) = 1
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
  WHERE user_id IN (
    SELECT u.id
    FROM schedule_students ss
    JOIN users u ON u.role = 'STUDENT' AND u.display_name = ss.student_name COLLATE NOCASE
    WHERE ss.schedule_id = NEW.id AND u.deleted_at IS NULL
  );
END;
