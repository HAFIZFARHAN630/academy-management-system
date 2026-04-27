const router = require('express').Router();
const db = require('../database/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

function generateVisitorId() {
    const d = new Date();
    const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const count = db.prepare("SELECT COUNT(*) as c FROM visitors WHERE date(check_in,'unixepoch')=date('now')").get().c + 1;
    return `VIS-${date}-${String(count).padStart(3, '0')}`;
}

// POST /api/visitors/checkin
router.post('/checkin', (req, res) => {
    const { full_name, phone, cnic, purpose, host_id, notes } = req.body;
    if (!full_name || !phone || !purpose) return res.status(400).json({ error: 'Name, phone, and purpose required' });

    // Check blacklist
    if (cnic) {
        const bl = db.prepare("SELECT blacklisted FROM visitors WHERE cnic=? AND blacklisted=1 LIMIT 1").get(cnic);
        if (bl) return res.status(403).json({ error: 'This visitor is blacklisted' });
    }

    const visitor_id = generateVisitorId();
    const now = Math.floor(Date.now() / 1000);
    const result = db.prepare(`
    INSERT INTO visitors (visitor_id,full_name,phone,cnic,purpose,host_id,check_in,registered_by,notes,badge_qr)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(visitor_id, full_name, phone, cnic || null, purpose, host_id || null, now, req.user.id, notes || null, visitor_id);

    // Notify host if present
    if (host_id) {
        db.prepare("INSERT INTO notifications (user_id,type,title,message) VALUES (?,?,?,?)")
            .run(host_id, 'visitor', '📍 Visitor Arrived', `${full_name} has arrived to meet you. (${purpose})`);
    }

    res.json({ id: result.lastInsertRowid, visitor_id, check_in: now });
});

// POST /api/visitors/checkout/:id
router.post('/checkout/:id', (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const visitor = db.prepare("SELECT * FROM visitors WHERE id=? OR visitor_id=?").get(req.params.id, req.params.id);
    if (!visitor) return res.status(404).json({ error: 'Visitor not found' });
    if (visitor.status === 'checked-out') return res.status(400).json({ error: 'Already checked out' });

    const duration = Math.floor((now - visitor.check_in) / 60);
    db.prepare("UPDATE visitors SET check_out=?,duration_mins=?,status='checked-out' WHERE id=?")
        .run(now, duration, visitor.id);

    const { feedback_stars } = req.body;
    if (feedback_stars) db.prepare("UPDATE visitors SET feedback_stars=? WHERE id=?").run(feedback_stars, visitor.id);

    res.json({ success: true, duration_mins: duration });
});

// GET /api/visitors/active  — currently inside
router.get('/active', requireRole('admin'), (req, res) => {
    const visitors = db.prepare(`
    SELECT v.*,u.full_name as host_name
    FROM visitors v LEFT JOIN users u ON u.id=v.host_id
    WHERE v.status='inside' ORDER BY v.check_in DESC
  `).all();
    res.json(visitors);
});

// GET /api/visitors/logs  — historical with filters
router.get('/logs', requireRole('admin'), (req, res) => {
    const { from, to, purpose, host_id, search } = req.query;
    let q = `SELECT v.*,u.full_name as host_name FROM visitors v LEFT JOIN users u ON u.id=v.host_id WHERE 1=1`;
    const params = [];

    if (from) { q += ' AND date(v.check_in,"unixepoch") >= ?'; params.push(from); }
    if (to) { q += ' AND date(v.check_in,"unixepoch") <= ?'; params.push(to); }
    if (purpose) { q += ' AND v.purpose=?'; params.push(purpose); }
    if (host_id) { q += ' AND v.host_id=?'; params.push(host_id); }
    if (search) { q += ' AND (v.full_name LIKE ? OR v.phone LIKE ? OR v.cnic LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    q += ' ORDER BY v.check_in DESC LIMIT 200';
    res.json(db.prepare(q).all(...params));
});

// POST /api/visitors/:id/blacklist
router.post('/:id/blacklist', requireRole('admin'), (req, res) => {
    db.prepare("UPDATE visitors SET blacklisted=1 WHERE id=?").run(req.params.id);
    res.json({ success: true });
});

// GET /api/visitors/stats
router.get('/stats', requireRole('admin'), (req, res) => {
    const today_count = db.prepare("SELECT COUNT(*) as c FROM visitors WHERE date(check_in,'unixepoch')=date('now')").get().c;
    const inside_count = db.prepare("SELECT COUNT(*) as c FROM visitors WHERE status='inside'").get().c;
    const avg_duration = db.prepare("SELECT AVG(duration_mins) as avg FROM visitors WHERE duration_mins IS NOT NULL").get().avg;
    res.json({ today_count, inside_count, avg_duration: Math.round(avg_duration || 0) });
});

module.exports = router;
