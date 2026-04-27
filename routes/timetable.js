const router = require('express').Router();
const db = require('../database/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/timetable — List all entries (Admin/Staff)
router.get('/', requireRole('admin', 'teacher'), (req, res) => {
  const { class_name, teacher_id } = req.query;
  let query = "SELECT t.*, u.full_name as teacher_name FROM timetable t LEFT JOIN users u ON t.teacher_id = u.id";
  const params = [];
  
  if (class_name || teacher_id) {
    query += " WHERE";
    if (class_name) {
      query += " t.class_name = ?";
      params.push(class_name);
    }
    if (teacher_id) {
      if (class_name) query += " AND";
      query += " t.teacher_id = ?";
      params.push(teacher_id);
    }
  }
  
  query += " ORDER BY CASE day_of_week WHEN 'Mon' THEN 1 WHEN 'Tue' THEN 2 WHEN 'Wed' THEN 3 WHEN 'Thu' THEN 4 WHEN 'Fri' THEN 5 WHEN 'Sat' THEN 6 WHEN 'Sun' THEN 7 END, start_time";
  
  const entries = db.prepare(query).all(...params);
  res.json(entries);
});

// POST /api/timetable — Create entry
router.post('/', requireRole('admin'), (req, res) => {
  const { class_name, teacher_id, subject, room, day_of_week, start_time, end_time, recurrence } = req.body;
  if (!class_name || !day_of_week || !start_time || !end_time) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const result = db.prepare(`
    INSERT INTO timetable (class_name, teacher_id, subject, room, day_of_week, start_time, end_time, recurrence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(class_name, teacher_id || null, subject || null, room || null, day_of_week, start_time, end_time, recurrence || 'weekly');

  res.json({ success: true, id: result.lastInsertRowid });
});

// DELETE /api/timetable/:id
router.delete('/:id', requireRole('admin'), (req, res) => {
  db.prepare("DELETE FROM timetable WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// GET /api/timetable/today — Today's schedule for logged in user
router.get('/today', (req, res) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = days[new Date().getDay()];
  
  let query = "SELECT * FROM timetable WHERE day_of_week = ?";
  const params = [today];

  if (req.user.role === 'student') {
    // Get student's class
    const student = db.prepare("SELECT class_name FROM users WHERE id = ?").get(req.user.id);
    if (!student || !student.class_name) return res.json([]);
    query += " AND class_name = ?";
    params.push(student.class_name);
  } else if (req.user.role === 'teacher') {
    query += " AND teacher_id = ?";
    params.push(req.user.id);
  } else {
    // Admin sees everything for today? Maybe not needed here.
    return res.json([]);
  }

  const schedule = db.prepare(query + " ORDER BY start_time").all(...params);
  res.json(schedule);
});

module.exports = router;
