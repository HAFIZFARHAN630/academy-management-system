require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/visitors', require('./routes/visitors'));
app.use('/api/salary', require('./routes/salary'));
app.use('/api/leave', require('./routes/leave'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/timetable', require('./routes/timetable'));

// ─── Cron Jobs ────────────────────────────────────────────────────────────────
require('./cron').initCron();

// ─── Admin Stats Endpoint ─────────────────────────────────────────────────────
const { authMiddleware, requireRole } = require('./middleware/auth');
const db = require('./database/db');

app.get('/api/stats', authMiddleware, requireRole('admin'), (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const total_teachers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='teacher' AND status='active'").get().c;
    const total_students = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='student' AND status='active'").get().c;
    const total_workers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='worker' AND status='active'").get().c;
    const present_today = db.prepare("SELECT COUNT(*) as c FROM attendance WHERE date=? AND status IN ('present','late')").get(today).c;
    const active_visitors = db.prepare("SELECT COUNT(*) as c FROM visitors WHERE status='inside'").get().c;
    const pending_leaves = db.prepare("SELECT COUNT(*) as c FROM leave_requests WHERE status='pending'").get().c;
    res.json({ total_teachers, total_students, total_workers, present_today, active_visitors, pending_leaves });
});

// ─── Base Route (Health Check) ────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Academy API Server is running' });
});

app.listen(PORT, () => {
    console.log(`\n🎓 Academy Management System running at http://localhost:${PORT}`);
    console.log(`   Built by ClickTake Technologies | clicktaketech.com\n`);
});
