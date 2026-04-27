const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../database/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCKOUT_SECONDS = parseInt(process.env.LOCKOUT_DURATION) || 900;
const SESSION_TIMEOUT = process.env.SESSION_TIMEOUT ? parseInt(process.env.SESSION_TIMEOUT) : 28800;

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { login_id, password } = req.body;
    if (!login_id || !password) return res.status(400).json({ error: 'Login ID and password are required' });

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('login_id', login_id.trim())
        .neq('status', 'inactive')
        .single();

    if (error || !user) return res.status(401).json({ error: 'Invalid credentials' });

    // Check lockout
    const now = Math.floor(Date.now() / 1000);
    if (user.locked_until && user.locked_until > now) {
        const remaining = Math.ceil((user.locked_until - now) / 60);
        return res.status(403).json({ error: `Account locked. Try again in ${remaining} minute(s)` });
    }

    const match = bcrypt.compareSync(password, user.password);
    if (!match) {
        const attempts = (user.failed_attempts || 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
            await supabase
                .from('users')
                .update({ failed_attempts: attempts, locked_until: now + LOCKOUT_SECONDS })
                .eq('id', user.id);
            return res.status(403).json({ error: 'Too many failed attempts. Account locked for 15 minutes.' });
        }
        await supabase
            .from('users')
            .update({ failed_attempts: attempts })
            .eq('id', user.id);
        return res.status(401).json({ error: 'Invalid credentials', attempts_remaining: MAX_ATTEMPTS - attempts });
    }

    // Reset failed attempts
    await supabase
        .from('users')
        .update({ failed_attempts: 0, locked_until: null, last_login: now })
        .eq('id', user.id);

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: SESSION_TIMEOUT });

    res.json({
        token,
        user: {
            id: user.id,
            login_id: user.login_id,
            full_name: user.full_name,
            role: user.role,
            temp_password: user.temp_password === 1,
            photo: user.photo
        }
    });
});

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
    const { login_id, current_password, new_password } = req.body;
    if (!login_id || !current_password || !new_password)
        return res.status(400).json({ error: 'All fields required' });
    if (new_password.length < 8)
        return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('login_id', login_id)
        .single();

    if (error || !user) return res.status(404).json({ error: 'User not found' });

    if (!bcrypt.compareSync(current_password, user.password))
        return res.status(401).json({ error: 'Current password incorrect' });

    const hash = bcrypt.hashSync(new_password, 10);
    await supabase
        .from('users')
        .update({ password: hash, temp_password: 0 })
        .eq('id', user.id);

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: SESSION_TIMEOUT });
    res.json({ success: true, token, role: user.role });
});

// GET /api/auth/me (needs auth header)
const { authMiddleware } = require('../middleware/auth');
router.get('/me', authMiddleware, async (req, res) => {
    const { data: user, error } = await supabase
        .from('users')
        .select('id, login_id, full_name, role, photo, status')
        .eq('id', req.user.id)
        .single();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(user);
});

// ─── Public Gallery for Navigation ──────────────────────────────────────────
router.get('/gallery/:role', async (req, res) => {
    const role = req.params.role;
    if (!['teacher', 'student', 'worker'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    
    const { data: users, error } = await supabase
        .from('users')
        .select('login_id, full_name, photo, is_face_enrolled')
        .eq('role', role)
        .eq('status', 'active')
        .order('full_name');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(users);
});

// ─── Public Face Embeddings for Camera Login ────────────────────────────────
router.get('/faces', async (req, res) => {
    const { data: users, error } = await supabase
        .from('users')
        .select('login_id, role, face_embedding')
        .eq('status', 'active')
        .eq('is_face_enrolled', 1);

    if (error) return res.status(500).json({ error: error.message });

    const payload = users.map(u => {
        let arr = null;
        try { arr = JSON.parse(u.face_embedding); } catch (e) { }
        return { login_id: u.login_id, role: u.role, embedding: arr };
    }).filter(u => u.embedding !== null);
    res.json(payload);
});

// ─── Face Recognition Smart Auto Punch ──────────────────────────────────────
router.post('/face-punch', async (req, res) => {
    const { login_id, role, lat, lng } = req.body;
    if (!login_id || !role) return res.status(400).json({ error: 'Missing details' });

    const { data: user, error: userErr } = await supabase
        .from('users')
        .select('id')
        .eq('login_id', login_id)
        .eq('role', role)
        .eq('status', 'active')
        .single();

    if (userErr || !user) return res.status(401).json({ error: 'User no longer active' });

    const userId = user.id;
    const today = new Date().toISOString().split('T')[0];
    const now = Math.floor(Date.now() / 1000);
    const location = lat && lng ? JSON.stringify({ lat, lng }) : null;

    const { data: existing, error: existErr } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();

    if (!existing) {
        // Punch In
        const hour = new Date().getHours();
        const status = hour >= 9 ? 'late' : 'present';
        await supabase
            .from('attendance')
            .insert({
                user_id: userId,
                punch_in: now,
                date: today,
                location_in: location,
                device_in: 'Face Scanner',
                status: status,
                location_lat: lat || null,
                location_lng: lng || null,
                method: 'system_auto'
            });
        return res.json({ action: 'punch_in', time: now, status, login_id });
    }

    if (!existing.punch_out) {
        // Punch Out
        const duration = now - existing.punch_in;
        await supabase
            .from('attendance')
            .update({
                punch_out: now,
                location_out: location,
                device_out: 'Face Scanner',
                method: 'system_auto'
            })
            .eq('id', existing.id);
        return res.json({ action: 'punch_out', time: now, duration_seconds: duration, login_id });
    }

    res.json({ action: 'already_complete', message: 'Already completed for the day' });
});

module.exports = router;
