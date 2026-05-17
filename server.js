require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const supabase = require('./database/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use((req, res, next) => {
    res.setHeader('X-System-Version', '2.6.0');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});
app.get('/manifest.json', async (req, res) => {
    try {
        const { data: row } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'pwa_settings')
            .maybeSingle();
            
        const pwa = row ? JSON.parse(row.value) : {};
        
        const { data: brandingRow } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'branding')
            .maybeSingle();
        const branding = brandingRow ? JSON.parse(brandingRow.value) : {};

        const manifest = {
          "id": "com.academy.management.system",
          "name": branding.name || "Academy Management System",
          "short_name": branding.name ? branding.name.split(' ')[0] : "Academy",
          "description": branding.tagline || "Academy Management System",
          "start_url": "/",
          "display": "standalone",
          "background_color": "#ffffff",
          "theme_color": (branding.colors && branding.colors.primary) || "#6C63FF",
          "icons": [
            {
              "src": pwa.icon || "/icons/icon-192x192.png",
              "sizes": "192x192",
              "type": "image/png"
            },
            {
              "src": pwa.icon || "/icons/icon-512x512.png",
              "sizes": "512x512",
              "type": "image/png"
            }
          ]
        };
        res.setHeader('Content-Type', 'application/json');
        res.json(manifest);
    } catch (e) {
        res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
    }
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

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
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/registrations', require('./routes/registrations'));
app.use('/api/data', require('./routes/import_export'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/payments', require('./routes/payments'));

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
require('./database/seed_gateways').seedGateways();

// ─── Stats Endpoint (Public counts) ──────────────────────────────────────────
app.get('/api/stats/public', async (req, res) => {
    try {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

        const [
            { count: total_teachers },
            { count: total_students },
            { count: total_workers },
            { count: present_today },
            { count: active_visitors }
        ] = await Promise.all([
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'teacher').eq('status', 'active'),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'active'),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'worker').eq('status', 'active'),
            supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('date', today).in('status', ['present', 'late']),
            supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('status', 'inside')
        ]);

        res.json({
            total_members: (total_teachers || 0) + (total_students || 0) + (total_workers || 0),
            present_today: present_today || 0,
            active_visitors: active_visitors || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stats', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

        const [
            { count: total_teachers },
            { count: total_students },
            { count: total_workers },
            { count: present_today },
            { count: active_visitors },
            { count: pending_leaves }
        ] = await Promise.all([
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'teacher').eq('status', 'active'),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'active'),
            supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'worker').eq('status', 'active'),
            supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('date', today).in('status', ['present', 'late']),
            supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('status', 'inside'),
            supabase.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending')
        ]);

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

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        version: '2.6.3',
        db: 'sqlite',
        supabase_connected: !!process.env.SUPABASE_URL,
        env: process.env.NODE_ENV || 'production'
    });
});

app.listen(PORT, () => {
    console.log(`\n🎓 Academy Management System v2.6.3 running at http://localhost:${PORT}`);
    console.log(`   CWD: ${process.cwd()}`);
    console.log(`   Dirname: ${__dirname}`);
    try {
        const fs = require('fs');
        console.log(`   Public Contents: ${fs.readdirSync(path.join(__dirname, 'public'))}`);
        const regFile = fs.readFileSync(path.join(__dirname, 'public/registration.html'), 'utf8');
        console.log(`   Registration.html Length: ${regFile.length}`);
    } catch(e) { console.error('Dir check failed', e); }
    console.log(`   Built by ClickTake Technologies | clicktaketech.com\n`);
});
