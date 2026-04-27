require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const supabase = require('./database/supabase');

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

// ─── Seed Admin Account ───────────────────────────────────────────────────────
const bcrypt = require('bcryptjs');
async function seedAdmin() {
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'admin');
    if (count === 0) {
        const hash = bcrypt.hashSync('Admin@1234', 10);
        await supabase.from('users').insert({
            login_id: 'ADMIN-001',
            full_name: 'Academy Admin',
            phone: '03000000000',
            role: 'admin',
            password: hash,
            temp_password: 0
        });
        console.log('✅ Admin seeded: ADMIN-001 / Admin@1234');
    }
}
seedAdmin();

app.get('/api/stats', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const { count: total_teachers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'teacher').eq('status', 'active');
        const { count: total_students } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'active');
        const { count: total_workers } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'worker').eq('status', 'active');
        const { count: present_today } = await supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('date', today).in('status', ['present', 'late']);
        const { count: active_visitors } = await supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('status', 'inside');
        const { count: pending_leaves } = await supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending');

        res.json({
            total_teachers: total_teachers || 0,
            total_students: total_students || 0,
            total_workers: total_workers || 0,
            present_today: present_today || 0,
            active_visitors: active_visitors || 0,
            pending_leaves: pending_leaves || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Base Route (Health Check) ────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Academy API Server is running',
        deployed_at: '2026-04-27T10:30:00Z'
    });
});

app.listen(PORT, () => {
    console.log(`\n🎓 Academy Management System running at http://localhost:${PORT}`);
    console.log(`   Built by ClickTake Technologies | clicktaketech.com\n`);
});
