const router = require('express').Router();
const db = require('../database/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/leave/my  — user's own leave requests
router.get('/my', (req, res) => {
    const requests = db.prepare("SELECT * FROM leave_requests WHERE user_id=? ORDER BY created_at DESC").all(req.user.id);
    res.json(requests);
});

// POST /api/leave/apply
router.post('/apply', (req, res) => {
    const { leave_type, start_date, end_date, reason } = req.body;
    if (!leave_type || !start_date || !end_date) return res.status(400).json({ error: 'Leave type and dates required' });

    const result = db.prepare(`
    INSERT INTO leave_requests (user_id,leave_type,start_date,end_date,reason)
    VALUES (?,?,?,?,?)
  `).run(req.user.id, leave_type, start_date, end_date, reason);

    // Notify admin
    db.prepare("INSERT INTO notifications (user_id,type,title,message) SELECT id,'leave','📋 New Leave Request',? FROM users WHERE role='admin'")
        .run(`${req.user.full_name} applied for ${leave_type} leave (${start_date} to ${end_date})`);

    res.json({ id: result.lastInsertRowid, status: 'pending' });
});

// GET /api/leave/all  — Admin: all pending + recent
router.get('/all', requireRole('admin'), (req, res) => {
    const requests = db.prepare(`
    SELECT lr.*, u.full_name, u.role, u.login_id
    FROM leave_requests lr JOIN users u ON u.id=lr.user_id
    WHERE lr.status='pending' OR lr.created_at > strftime('%s','now','-30 days')
    ORDER BY lr.created_at DESC
  `).all();
    res.json(requests);
});

// POST /api/leave/review/:id  — Admin approve/reject
router.post('/review/:id', requireRole('admin'), (req, res) => {
    const { status, admin_comment } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const now = Math.floor(Date.now() / 1000);
    const leave = db.prepare("SELECT * FROM leave_requests WHERE id=?").get(req.params.id);
    if (!leave) return res.status(404).json({ error: 'Not found' });

    db.prepare("UPDATE leave_requests SET status=?,admin_comment=?,reviewed_by=?,reviewed_at=? WHERE id=?")
        .run(status, admin_comment || null, req.user.id, now, req.params.id);

    // Notify requester
    const icon = status === 'approved' ? '✅' : '❌';
    db.prepare("INSERT INTO notifications (user_id,type,title,message) VALUES (?,?,?,?)")
        .run(leave.user_id, 'leave', `${icon} Leave ${status.charAt(0).toUpperCase() + status.slice(1)}`, `Your ${leave.leave_type} leave (${leave.start_date} to ${leave.end_date}) has been ${status}.`);

    res.json({ success: true });
});

module.exports = router;
