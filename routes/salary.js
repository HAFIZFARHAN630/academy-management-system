const router = require('express').Router();
const supabase = require('../database/supabase');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/salary/summary?month=YYYY-MM
router.get('/summary', requireRole('admin'), async (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    
    // Join users and salary_records
    const { data: staff, error } = await supabase
        .from('users')
        .select(`
            id, full_name, login_id, role, salary_type, base_salary, hourly_rate,
            salary_records!left(id, days_present, days_absent, late_deduction, leave_deduction, advance_deduction, overtime_bonus, net_salary, status)
        `)
        .in('role', ['teacher', 'worker'])
        .eq('status', 'active')
        .eq('salary_records.month', month)
        .order('role')
        .order('full_name');

    if (error) return res.status(500).json({ error: error.message });

    const flattened = staff.map(u => ({
        ...u,
        salary_id: u.salary_records?.[0]?.id || null,
        days_present: u.salary_records?.[0]?.days_present || null,
        days_absent: u.salary_records?.[0]?.days_absent || null,
        late_deduction: u.salary_records?.[0]?.late_deduction || null,
        leave_deduction: u.salary_records?.[0]?.leave_deduction || null,
        advance_deduction: u.salary_records?.[0]?.advance_deduction || null,
        overtime_bonus: u.salary_records?.[0]?.overtime_bonus || null,
        net_salary: u.salary_records?.[0]?.net_salary || null,
        status: u.salary_records?.[0]?.status || null
    }));

    res.json(flattened);
});

// POST /api/salary/calculate — Auto-calculate for a month
router.post('/calculate', requireRole('admin'), async (req, res) => {
    const month = req.body.month || new Date().toISOString().slice(0, 7);
    const { data: staff, error: staffErr } = await supabase
        .from('users')
        .select('*')
        .in('role', ['teacher', 'worker'])
        .eq('status', 'active');

    if (staffErr) return res.status(500).json({ error: staffErr.message });

    for (const u of staff) {
        const { data: attendanceData } = await supabase
            .from('attendance')
            .select('status')
            .eq('user_id', u.id)
            .like('date', `${month}%`);

        const present = attendanceData?.filter(a => ['present', 'late'].includes(a.status)).length || 0;
        const absent = attendanceData?.filter(a => a.status === 'absent').length || 0;
        const late_days = attendanceData?.filter(a => a.status === 'late').length || 0;

        let net = 0;
        const late_deduction = late_days * 50; // 50 per late (configurable)

        if (u.salary_type === 'fixed' && u.base_salary) {
            const working_days = 26;
            const daily_rate = u.base_salary / working_days;
            net = u.base_salary - (absent * daily_rate) - late_deduction;
        } else if (u.salary_type === 'hourly' && u.hourly_rate) {
            // Calculate total hours
            const { data: hoursData } = await supabase
                .from('attendance')
                .select('punch_in, punch_out')
                .eq('user_id', u.id)
                .like('date', `${month}%`)
                .not('punch_in', 'is', null);

            const hours = hoursData?.reduce((acc, curr) => {
                const pout = curr.punch_out || curr.punch_in; // Fallback to avoid division by zero if missing
                return acc + ((pout - curr.punch_in) / 3600);
            }, 0) || 0;
            
            net = hours * u.hourly_rate - late_deduction;
        }

        const { data: existing } = await supabase
            .from('salary_records')
            .select('id')
            .eq('user_id', u.id)
            .eq('month', month)
            .maybeSingle();

        if (!existing) {
            await supabase
                .from('salary_records')
                .insert({
                    user_id: u.id,
                    month,
                    base_salary: u.base_salary || 0,
                    days_present: present,
                    days_absent: absent,
                    late_deduction,
                    net_salary: Math.round(net)
                });
        } else {
            await supabase
                .from('salary_records')
                .update({
                    days_present: present,
                    days_absent: absent,
                    late_deduction,
                    net_salary: Math.round(net)
                })
                .eq('id', existing.id);
        }
    }

    res.json({ success: true, month, staff_processed: staff.length });
});

// POST /api/salary/mark-paid/:id
router.post('/mark-paid/:id', requireRole('admin'), async (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const { error } = await supabase
        .from('salary_records')
        .update({ status: 'paid', processed_at: now })
        .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// GET /api/salary/history/:userId
router.get('/history/:userId', async (req, res) => {
    const { data: records, error } = await supabase
        .from('salary_records')
        .select('*')
        .eq('user_id', req.params.userId)
        .order('month', { ascending: false })
        .limit(12);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(records);
});

module.exports = router;
