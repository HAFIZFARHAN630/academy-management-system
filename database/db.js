const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const fs = require('fs');
const DB_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const DB_PATH = path.join(DB_DIR, 'academy.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    login_id    TEXT UNIQUE NOT NULL,
    full_name   TEXT NOT NULL,
    email       TEXT,
    cnic        TEXT,
    phone       TEXT,
    role        TEXT NOT NULL CHECK(role IN ('admin','teacher','student','worker')),
    password    TEXT NOT NULL,
    temp_password  INTEGER DEFAULT 1,
    photo       TEXT,
    status      TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','locked')),
    failed_attempts INTEGER DEFAULT 0,
    locked_until    INTEGER,
    last_login  INTEGER,
    created_at  INTEGER DEFAULT (strftime('%s','now')),
    -- Teacher/Worker extras
    subject     TEXT,
    qualification TEXT,
    joining_date TEXT,
    designation TEXT,
    shift_start  TEXT,
    shift_end    TEXT,
    salary_type  TEXT CHECK(salary_type IN ('fixed','hourly') OR salary_type IS NULL),
    base_salary  REAL,
    hourly_rate  REAL,
    -- Student extras
    roll_no     TEXT,
    class_name  TEXT,
    section     TEXT,
    parent_name TEXT,
    parent_phone TEXT,
    medical_notes TEXT,
    -- V3 additions
    address     TEXT,
    emergency_contact TEXT,
    preferred_language TEXT DEFAULT 'English',
    -- V4 additions
    face_embedding TEXT,
    is_face_enrolled INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    punch_in    INTEGER,
    punch_out   INTEGER,
    date        TEXT NOT NULL,
    location_in TEXT,
    location_out TEXT,
    device_in   TEXT,
    device_out  TEXT,
    status      TEXT DEFAULT 'present' CHECK(status IN ('present','late','absent','half-day')),
    is_manual   INTEGER DEFAULT 0,
    marked_by   INTEGER REFERENCES users(id),
    notes       TEXT,
    -- V3 additions
    method      TEXT DEFAULT 'manual' CHECK(method IN ('manual','system_auto','admin_override')),
    location_lat REAL,
    location_lng REAL,
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS visitors (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id   TEXT UNIQUE NOT NULL,
    full_name    TEXT NOT NULL,
    phone        TEXT NOT NULL,
    cnic         TEXT,
    purpose      TEXT NOT NULL,
    host_id      INTEGER REFERENCES users(id),
    photo        TEXT,
    check_in     INTEGER NOT NULL,
    check_out    INTEGER,
    duration_mins INTEGER,
    badge_qr     TEXT,
    status       TEXT DEFAULT 'inside' CHECK(status IN ('inside','checked-out')),
    registered_by INTEGER REFERENCES users(id),
    feedback_stars INTEGER,
    notes        TEXT,
    blacklisted  INTEGER DEFAULT 0,
    created_at   INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    leave_type  TEXT NOT NULL,
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    reason      TEXT,
    document    TEXT,
    status      TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    admin_comment TEXT,
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at INTEGER,
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS salary_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    month       TEXT NOT NULL,
    base_salary REAL,
    days_present INTEGER,
    days_absent  INTEGER,
    late_deduction REAL DEFAULT 0,
    leave_deduction REAL DEFAULT 0,
    advance_deduction REAL DEFAULT 0,
    overtime_bonus REAL DEFAULT 0,
    net_salary  REAL,
    status      TEXT DEFAULT 'pending' CHECK(status IN ('pending','processed','paid')),
    processed_at INTEGER,
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id),
    broadcast   INTEGER DEFAULT 0,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    is_read     INTEGER DEFAULT 0,
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id    INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,
    target_table TEXT,
    target_id   INTEGER,
    details     TEXT,
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS timetable (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    class_name  TEXT NOT NULL,
    teacher_id  INTEGER REFERENCES users(id),
    subject     TEXT,
    room        TEXT,
    day_of_week TEXT NOT NULL, -- Mon, Tue, etc.
    start_time  TEXT NOT NULL, -- HH:mm
    end_time    TEXT NOT NULL, -- HH:mm
    recurrence  TEXT DEFAULT 'weekly',
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS academy_holidays (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT UNIQUE NOT NULL,
    title       TEXT NOT NULL,
    is_public   INTEGER DEFAULT 1,
    created_at  INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS pending_registrations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    student_details TEXT NOT NULL,
    parent_details  TEXT NOT NULL,
    health_details  TEXT,
    payment_method  TEXT,
    gdpr_consent    INTEGER,
    status          TEXT DEFAULT 'PENDING',
    admin_notes     TEXT,
    created_at      INTEGER DEFAULT (strftime('%s','now')),
    updated_at      INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS privacy_policies (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    version      INTEGER NOT NULL,
    content      TEXT NOT NULL,
    status       TEXT DEFAULT 'draft',
    published_by INTEGER,
    created_at   INTEGER DEFAULT (strftime('%s','now'))
  );
`);

// ─── Migrations ───────────────────────────────────────────────────────────────
function runMigrations() {
  try { db.exec("ALTER TABLE users ADD COLUMN email TEXT;"); } catch (e) { }
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);"); } catch (e) { }
  try { db.exec("ALTER TABLE users ADD COLUMN address TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE users ADD COLUMN emergency_contact TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE users ADD COLUMN preferred_language TEXT DEFAULT 'English';"); } catch (e) { }
  try { db.exec("ALTER TABLE attendance ADD COLUMN method TEXT DEFAULT 'manual';"); } catch (e) { }
  try { db.exec("ALTER TABLE attendance ADD COLUMN reason TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE attendance ADD COLUMN outside_window INTEGER DEFAULT 0;"); } catch (e) { }
  try { db.exec("ALTER TABLE attendance ADD COLUMN location_lat REAL;"); } catch (e) { }
  try { db.exec("ALTER TABLE attendance ADD COLUMN location_lng REAL;"); } catch (e) { }
  try { db.exec("ALTER TABLE users ADD COLUMN face_embedding TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE users ADD COLUMN is_face_enrolled INTEGER DEFAULT 0;"); } catch (e) { }
  
  // V7.0 Migrations
  try { db.exec("ALTER TABLE attendance ADD COLUMN early_leave INTEGER DEFAULT 0;"); } catch (e) { }
  try { db.exec("ALTER TABLE attendance ADD COLUMN early_leave_reason TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE attendance ADD COLUMN early_leave_status TEXT DEFAULT 'pending';"); } catch (e) { }
  try { db.exec("ALTER TABLE attendance ADD COLUMN early_leave_reviewed_by INTEGER REFERENCES users(id);"); } catch (e) { }
  
  // V8.0 Migrations - Late Checkout
  try { db.exec("ALTER TABLE attendance ADD COLUMN late_checkout INTEGER DEFAULT 0;"); } catch (e) { }
  try { db.exec("ALTER TABLE attendance ADD COLUMN late_checkout_reason TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE attendance ADD COLUMN late_checkout_status TEXT DEFAULT 'approved';"); } catch (e) { }
  
  // Settings initialization
  const settings = [
    ['country', 'Pakistan'],
    ['timezone', 'Asia/Karachi'],
    ['weekends', 'Friday,Saturday'],
    ['face_enabled', '1'],
    ['liveness_enabled', '1'],
    ['match_threshold', '90'],
    ['require_reason', '0'],
    ['track_location', '1'],
    ['shift_start', '09:00'],
    ['grace_period', '15']
  ];
  const insertSetting = db.prepare("INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)");
  settings.forEach(s => insertSetting.run(s[0], s[1]));
}
runMigrations();

// ─── Seed Admin Account ───────────────────────────────────────────────────────
function seedAdmin() {
  const existing = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
  if (!existing) {
    const hash = bcrypt.hashSync('Admin@1234', 10);
    db.prepare(`
      INSERT INTO users (login_id, full_name, phone, role, password, temp_password)
      VALUES ('ADMIN-001', 'Academy Admin', '03000000000', 'admin', ?, 0)
    `).run(hash);
    console.log('✅ Admin seeded: ADMIN-001 / Admin@1234');
  }
}

seedAdmin();

module.exports = db;
