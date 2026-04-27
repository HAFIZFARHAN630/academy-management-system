const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCKOUT_SECONDS = parseInt(process.env.LOCKOUT_DURATION) || 900;
const SESSION_TIMEOUT = process.env.SESSION_TIMEOUT ? parseInt(process.env.SESSION_TIMEOUT) : 28800;


// POST /api/auth/login
router.post('/login', (req, res) => {
    const { login_id, password } = req.body;
    if (!login_id || !password) return res.status(400).json({ error: 'Login ID and password are required' });

    const user = db.prepare('SELECT * FROM users WHERE login_id = ? AND status != ?').get(login_id.trim(), 'inactive');
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

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
            db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')
                .run(attempts, now + LOCKOUT_SECONDS, user.id);
            return res.status(403).json({ error: 'Too many failed attempts. Account locked for 15 minutes.' });
        }
        db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(attempts, user.id);
        return res.status(401).json({ error: 'Invalid credentials', attempts_remaining: MAX_ATTEMPTS - attempts });
    }

    // Reset failed attempts
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = ? WHERE id = ?')
        .run(now, user.id);

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
router.post('/change-password', (req, res) => {
    const { login_id, current_password, new_password } = req.body;
    if (!login_id || !current_password || !new_password)
        return res.status(400).json({ error: 'All fields required' });
    if (new_password.length < 8)
        return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const user = db.prepare('SELECT * FROM users WHERE login_id = ?').get(login_id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!bcrypt.compareSync(current_password, user.password))
        return res.status(401).json({ error: 'Current password incorrect' });

    const hash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password = ?, temp_password = 0 WHERE id = ?').run(hash, user.id);

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: SESSION_TIMEOUT });
    res.json({ success: true, token, role: user.role });
});

// GET /api/auth/me  (needs auth header)
const { authMiddleware } = require('../middleware/auth');
router.get('/me', authMiddleware, (req, res) => {
    const user = db.prepare('SELECT id, login_id, full_name, role, photo, status FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
});

// ─── Public Gallery for Navigation ──────────────────────────────────────────
router.get('/gallery/:role', (req, res) => {
    const role = req.params.role;
    if (!['teacher', 'student', 'worker'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const users = db.prepare(`SELECT login_id, full_name, photo, is_face_enrolled FROM users WHERE role=? AND status='active' ORDER BY full_name`).all(role);
    res.json(users);
});

// ─── Public Face Embeddings for Camera Login ────────────────────────────────
router.get('/faces', (req, res) => {
    const users = db.prepare(`SELECT login_id, role, face_embedding FROM users WHERE status='active' AND is_face_enrolled=1`).all();
    const payload = users.map(u => {
        let arr = null;
        try { arr = JSON.parse(u.face_embedding); } catch (e) { }
        return { login_id: u.login_id, role: u.role, embedding: arr };
    }).filter(u => u.embedding !== null);
    res.json(payload);
});

// ─── Face Recognition Smart Auto Punch ──────────────────────────────────────
router.post('/face-punch', (req, res) => {
    const { login_id, role, lat, lng } = req.body;
    if (!login_id || !role) return res.status(400).json({ error: 'Missing details' });

    const user = db.prepare("SELECT id FROM users WHERE login_id=? AND role=? AND status='active'").get(login_id, role);
    if (!user) return res.status(401).json({ error: 'User no longer active' });

    const userId = user.id;
    const today = new Date().toISOString().split('T')[0];
    const now = Math.floor(Date.now() / 1000);
    const location = lat && lng ? JSON.stringify({ lat, lng }) : null;

    const existing = db.prepare("SELECT * FROM attendance WHERE user_id=? AND date=?").get(userId, today);

    if (!existing) {
        // Punch In
        const hour = new Date().getHours();
        const status = hour >= 9 ? 'late' : 'present';
        db.prepare("INSERT INTO attendance (user_id,punch_in,date,location_in,device_in,status,location_lat,location_lng,method) VALUES (?,?,?,?,?,?,?,?,'system_auto')")
            .run(userId, now, today, location, 'Face Scanner', status, lat || null, lng || null);
        return res.json({ action: 'punch_in', time: now, status, login_id });
    }

    if (!existing.punch_out) {
        // Punch Out
        const duration = now - existing.punch_in;
        db.prepare("UPDATE attendance SET punch_out=?,location_out=?,device_out=?, method='system_auto' WHERE id=?")
            .run(now, location, 'Face Scanner', existing.id);
        return res.json({ action: 'punch_out', time: now, duration_seconds: duration, login_id });
    }

    res.json({ action: 'already_complete', message: 'Already completed for the day' });
});

module.exports = router;
