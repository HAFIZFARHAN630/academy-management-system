const router = require('express').Router();
const db = require('../database/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/salary/summary?month=YYYY-MM
router.get('/summary', requireRole('admin'), (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const staff = db.prepare(`
    SELECT u.id, u.full_name, u.login_id, u.role, u.salary_type, u.base_salary, u.hourly_rate,
      s.id as salary_id, s.days_present, s.days_absent, s.late_deduction,
      s.leave_deduction, s.advance_deduction, s.overtime_bonus, s.net_salary, s.status
    FROM users u LEFT JOIN salary_records s ON s.user_id=u.id AND s.month=?
    WHERE u.role IN ('teacher','worker') AND u.status='active'
    ORDER BY u.role, u.full_name
  `).all(month);
    res.json(staff);
});

// POST /api/salary/calculate  — Auto-calculate for a month
router.post('/calculate', requireRole('admin'), (req, res) => {
    const month = req.body.month || new Date().toISOString().slice(0, 7);
    const staff = db.prepare("SELECT * FROM users WHERE role IN ('teacher','worker') AND status='active'").all();

    for (const u of staff) {
        const attendance = db.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) as present_days,
        SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) as absent_days,
        SUM(CASE WHEN status='late' THEN 1 ELSE 0 END) as late_days
      FROM attendance WHERE user_id=? AND date LIKE ?
    `).get(u.id, `${month}%`);

        const present = attendance.present_days || 0;
        const absent = attendance.absent_days || 0;
        const late_days = attendance.late_days || 0;

        let net = 0;
        const late_deduction = late_days * 50; // 50 per late (configurable)

        if (u.salary_type === 'fixed' && u.base_salary) {
            const working_days = 26;
            const daily_rate = u.base_salary / working_days;
            net = u.base_salary - (absent * daily_rate) - late_deduction;
        } else if (u.salary_type === 'hourly' && u.hourly_rate) {
            const hours = db.prepare(`
        SELECT SUM((COALESCE(punch_out,punch_in) - punch_in)/3600.0) as hrs
        FROM attendance WHERE user_id=? AND date LIKE ? AND punch_in IS NOT NULL
      `).get(u.id, `${month}%`).hrs || 0;
            net = hours * u.hourly_rate - late_deduction;
        }

        const existing = db.prepare("SELECT id FROM salary_records WHERE user_id=? AND month=?").get(u.id, month);
        if (!existing) {
            db.prepare(`
        INSERT INTO salary_records (user_id,month,base_salary,days_present,days_absent,late_deduction,net_salary)
        VALUES (?,?,?,?,?,?,?)
      `).run(u.id, month, u.base_salary || 0, present, absent, late_deduction, Math.round(net));
        } else {
            db.prepare(`
        UPDATE salary_records SET days_present=?,days_absent=?,late_deduction=?,net_salary=? WHERE id=?
      `).run(present, absent, late_deduction, Math.round(net), existing.id);
        }
    }

    res.json({ success: true, month, staff_processed: staff.length });
});

// POST /api/salary/mark-paid/:id
router.post('/mark-paid/:id', requireRole('admin'), (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    db.prepare("UPDATE salary_records SET status='paid', processed_at=? WHERE id=?").run(now, req.params.id);
    res.json({ success: true });
});

// GET /api/salary/history/:userId
router.get('/history/:userId', (req, res) => {
    const records = db.prepare("SELECT * FROM salary_records WHERE user_id=? ORDER BY month DESC LIMIT 12").all(req.params.userId);
    res.json(records);
});

module.exports = router;
