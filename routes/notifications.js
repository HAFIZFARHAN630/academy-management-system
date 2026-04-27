const router = require('express').Router();
const db = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/notifications  — user's notifications
router.get('/', (req, res) => {
    const notes = db.prepare(`
    SELECT * FROM notifications
    WHERE (user_id=? OR broadcast=1) AND created_at > strftime('%s','now','-30 days')
    ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);
    res.json(notes);
});

// GET /api/notifications/unread-count
router.get('/unread-count', (req, res) => {
    const count = db.prepare(`
    SELECT COUNT(*) as c FROM notifications
    WHERE (user_id=? OR broadcast=1) AND is_read=0
  `).get(req.user.id).c;
    res.json({ count });
});

// POST /api/notifications/read/:id
router.post('/read/:id', (req, res) => {
    db.prepare("UPDATE notifications SET is_read=1 WHERE id=?").run(req.params.id);
    res.json({ success: true });
});

// POST /api/notifications/read-all
router.post('/read-all', (req, res) => {
    db.prepare("UPDATE notifications SET is_read=1 WHERE user_id=? OR broadcast=1").run(req.user.id);
    res.json({ success: true });
});

// POST /api/notifications/broadcast  — Admin broadcast
router.post('/broadcast', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { title, message, type } = req.body;
    db.prepare("INSERT INTO notifications (broadcast,type,title,message) VALUES (1,?,?,?)")
        .run(type || 'announcement', title, message);
    res.json({ success: true });
});

module.exports = router;
