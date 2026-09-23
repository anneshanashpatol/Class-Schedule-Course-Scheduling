PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'TEACHER', 'STUDENT')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE teacher_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  subject TEXT NOT NULL DEFAULT ''
);

CREATE TABLE student_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  school TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  remaining_hundredths INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_name TEXT NOT NULL,
  student_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  class_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  lesson_hundredths INTEGER NOT NULL CHECK (lesson_hundredths > 0),
  classroom TEXT NOT NULL DEFAULT '',
  is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(class_date) = 10),
  CHECK (start_time < end_time)
);

CREATE TABLE lesson_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_hundredths INTEGER NOT NULL CHECK (amount_hundredths != 0),
  note TEXT NOT NULL CHECK (length(trim(note)) > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO app_settings (key, value) VALUES ('lesson_minutes', '60');

CREATE INDEX idx_users_role_status ON users(role, status);
CREATE INDEX idx_schedules_date ON schedules(class_date, start_time);
CREATE INDEX idx_schedules_teacher_date ON schedules(teacher_name COLLATE NOCASE, class_date, start_time);
CREATE INDEX idx_schedules_student_date ON schedules(student_name COLLATE NOCASE, class_date, start_time);
CREATE INDEX idx_schedules_classroom_date ON schedules(classroom, class_date, start_time);
CREATE INDEX idx_adjustments_student_created ON lesson_adjustments(student_id, created_at DESC, id DESC);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

CREATE TRIGGER schedules_prevent_conflict_insert
BEFORE INSERT ON schedules
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.class_date = NEW.class_date
      AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time
      AND (s.teacher_name = NEW.teacher_name COLLATE NOCASE OR s.student_name = NEW.student_name COLLATE NOCASE
        OR (trim(NEW.classroom) != '' AND s.classroom = NEW.classroom))
  ) THEN RAISE(ABORT, 'SCHEDULE_CONFLICT') END);
END;

CREATE TRIGGER schedules_prevent_conflict_update
BEFORE UPDATE OF teacher_name, student_name, class_date, start_time, end_time, classroom ON schedules
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1 FROM schedules s
    WHERE s.id != NEW.id AND s.class_date = NEW.class_date
      AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time
      AND (s.teacher_name = NEW.teacher_name COLLATE NOCASE OR s.student_name = NEW.student_name COLLATE NOCASE
        OR (trim(NEW.classroom) != '' AND s.classroom = NEW.classroom))
  ) THEN RAISE(ABORT, 'SCHEDULE_CONFLICT') END);
END;

CREATE TRIGGER schedules_lock_completed
BEFORE UPDATE OF teacher_name, student_name, class_date, start_time, end_time, lesson_hundredths ON schedules
WHEN OLD.is_completed = 1 AND (
  OLD.teacher_name != NEW.teacher_name COLLATE NOCASE OR OLD.student_name != NEW.student_name COLLATE NOCASE
  OR OLD.class_date != NEW.class_date OR OLD.start_time != NEW.start_time
  OR OLD.end_time != NEW.end_time OR OLD.lesson_hundredths != NEW.lesson_hundredths
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
  WHERE user_id IN (
    SELECT id FROM users WHERE role = 'STUDENT' AND display_name = NEW.student_name COLLATE NOCASE
  );
END;

CREATE TRIGGER keep_recent_adjustments
AFTER INSERT ON lesson_adjustments
BEGIN
  DELETE FROM lesson_adjustments
  WHERE student_id = NEW.student_id
    AND id NOT IN (
      SELECT id FROM lesson_adjustments
      WHERE student_id = NEW.student_id
      ORDER BY created_at DESC, id DESC
      LIMIT 20
    );
END;
