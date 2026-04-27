const router = require('express').Router();
const db = require('../database/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// Real-time clients for SSE
const clients = new Set();

// GET /api/attendance/live  — SSE stream
router.get('/live', requireRole('admin'), (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    const data = getLiveData(today);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  clients.add(send);
  send();
  const interval = setInterval(send, 10000);
  req.on('close', () => { clients.delete(send); clearInterval(interval); });
});

function getLiveData(date) {
  const teachers = db.prepare(`
    SELECT u.id,u.full_name,u.login_id,u.photo,
      a.punch_in,a.punch_out,a.status
    FROM users u LEFT JOIN attendance a ON a.user_id=u.id AND a.date=?
    WHERE u.role='teacher' AND u.status='active'
    ORDER BY u.full_name
  `).all(date);

  const students = db.prepare(`
    SELECT u.id,u.full_name,u.login_id,u.photo,u.class_name,u.section,u.roll_no,
      a.punch_in,a.punch_out,a.status,a.is_manual
    FROM users u LEFT JOIN attendance a ON a.user_id=u.id AND a.date=?
    WHERE u.role='student' AND u.status='active'
    ORDER BY u.class_name, u.roll_no
  `).all(date);

  const workers = db.prepare(`
    SELECT u.id,u.full_name,u.login_id,u.photo,u.designation,
      a.punch_in,a.punch_out,a.status
    FROM users u LEFT JOIN attendance a ON a.user_id=u.id AND a.date=?
    WHERE u.role='worker' AND u.status='active'
    ORDER BY u.full_name
  `).all(date);

  const visitors = db.prepare(`
    SELECT v.*,u.full_name as host_name FROM visitors v
    LEFT JOIN users u ON u.id=v.host_id
    WHERE v.status='inside' ORDER BY v.check_in DESC
  `).all();

  return { teachers, students, workers, visitors, timestamp: Date.now() };
}

// Helper for local date/time
const getToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
const getNowTime = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour12: false, hour: '2-digit', minute: '2-digit' });

// POST /api/attendance/punch  — Punch In/Out
router.post('/punch', (req, res) => {
  const today = getToday();
  const now = Math.floor(Date.now() / 1000);
  const { lat, lng, device, reason } = req.body;
  const location = lat && lng ? JSON.stringify({ lat, lng }) : null;

  const existing = db.prepare("SELECT * FROM attendance WHERE user_id=? AND date=?").get(req.user.id, today);
  const user = db.prepare("SELECT shift_start, shift_end, role FROM users WHERE id=?").get(req.user.id);

  if (!existing) {
    // Punch In
    const nowTime = getNowTime();
    let status = 'present';
    if (user && user.shift_start && nowTime > user.shift_start) {
        status = 'late';
    } else if (!user || !user.shift_start) {
        if (new Date().getHours() >= 9) status = 'late';
    }

    db.prepare("INSERT INTO attendance (user_id,punch_in,date,location_in,device_in,status,location_lat,location_lng,method) VALUES (?,?,?,?,?,?,?,?,'manual')")
      .run(req.user.id, now, today, location, device, status, lat || null, lng || null);
    
    return res.json({ action: 'punch_in', time: now, status });
  }

  if (!existing.punch_out) {
    // Punch Out
    const nowTime = getNowTime();
    let isEarly = 0;
    let isLate = 0;

    if (user && user.shift_end) {
      if (nowTime < user.shift_end) {
        isEarly = 1;
      } else {
        const [h, m] = user.shift_end.split(':').map(Number);
        const shiftEndMinutes = h * 60 + m;
        const [nowH, nowM] = nowTime.split(':').map(Number);
        const nowMinutes = nowH * 60 + nowM;
        if (nowMinutes > shiftEndMinutes + 120) isLate = 1;
      }
    }

    const duration = now - existing.punch_in;
    db.prepare(`
      UPDATE attendance SET 
        punch_out=?, location_out=?, device_out=?, 
        early_leave=?, early_leave_reason=?, early_leave_status=?,
        late_checkout=?, late_checkout_reason=?, late_checkout_status=?
      WHERE id=?
    `).run(
        now, location, device, 
        isEarly, isEarly ? reason : null, isEarly ? 'pending' : 'approved',
        isLate, isLate ? reason : null, isLate ? 'flagged' : 'approved',
        existing.id
    );
    
    return res.json({ 
      action: 'punch_out', 
      time: now, 
      duration_seconds: duration,
      is_early: !!isEarly,
      is_late: !!isLate
    });
  }

  res.json({ action: 'already_complete', message: 'Already punched in and out today' });
});

// GET /api/attendance/my-status
router.get('/my-status', (req, res) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  const record = db.prepare("SELECT * FROM attendance WHERE user_id=? AND date=?").get(req.user.id, today);
  res.json(record || { status: 'not_punched' });
});

// GET /api/attendance/daily-report?date=YYYY-MM-DD
router.get('/daily-report', requireRole('admin'), (req, res) => {
  const date = req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  const records = db.prepare(`
    SELECT u.id, u.full_name, u.login_id, u.role, u.class_name,
      a.punch_in, a.punch_out, a.status, a.is_manual, a.method
    FROM users u LEFT JOIN attendance a ON a.user_id=u.id AND a.date=?
    WHERE u.status='active' AND u.role != 'admin'
    ORDER BY u.role, u.full_name
  `).all(date);
  res.json(records);
});

// POST /api/attendance/mark  — Admin/Teacher manual mark
router.post('/mark', requireRole('admin', 'teacher'), (req, res) => {
  const { user_id, date, status, notes } = req.body;
  const today = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  const now = Math.floor(Date.now() / 1000);

  const existing = db.prepare("SELECT * FROM attendance WHERE user_id=? AND date=?").get(user_id, today);
  if (existing) {
    db.prepare("UPDATE attendance SET status=?,is_manual=1,marked_by=?,notes=? WHERE id=?")
      .run(status, req.user.id, notes, existing.id);
  } else {
    db.prepare("INSERT INTO attendance (user_id,date,status,is_manual,marked_by,notes,punch_in) VALUES (?,?,?,1,?,?,?)")
      .run(user_id, today, status, req.user.id, notes, now);
  }
  res.json({ success: true });
});

// GET /api/attendance/summary/:userId  — Monthly summary
router.get('/summary/:userId', (req, res) => {
  const { month } = req.query; // YYYY-MM
  const m = month || new Date().toISOString().slice(0, 7);
  const records = db.prepare(`
    SELECT date, punch_in, punch_out, status, is_manual
    FROM attendance WHERE user_id=? AND date LIKE ?
    ORDER BY date
  `).all(req.params.userId, `${m}%`);

  const present = records.filter(r => r.status === 'present' || r.status === 'late').length;
  const absent = records.filter(r => r.status === 'absent').length;
  const late = records.filter(r => r.status === 'late').length;

  res.json({ records, summary: { present, absent, late } });
});

// GET /api/attendance/early-leaves — Admin list
router.get('/early-leaves', requireRole('admin'), (req, res) => {
  const records = db.prepare(`
    SELECT a.*, u.full_name, u.login_id, u.role, u.shift_end
    FROM attendance a JOIN users u ON a.user_id=u.id
    WHERE a.early_leave=1 AND a.early_leave_status='pending'
    ORDER BY a.date DESC, a.punch_out DESC
  `).all();
  res.json(records);
});

// POST /api/attendance/early-leaves/:id/review — Admin action
router.post('/early-leaves/:id/review', requireRole('admin'), (req, res) => {
  const { status, comment } = req.body; // approved, flagged, rejected
  if (!['approved', 'flagged', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  db.prepare("UPDATE attendance SET early_leave_status=?, early_leave_reviewed_by=?, notes=COALESCE(?, notes) WHERE id=?")
    .run(status, req.user.id, comment, req.params.id);
  
  res.json({ success: true });
});

module.exports = router;
