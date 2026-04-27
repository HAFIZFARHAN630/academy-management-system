const router = require('express').Router();
const supabase = require('../database/supabase');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/leave/my — user's own leave requests
router.get('/my', async (req, res) => {
    const { data: requests, error } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(requests);
});

// POST /api/leave/apply
router.post('/apply', async (req, res) => {
    const { leave_type, start_date, end_date, reason } = req.body;
    if (!leave_type || !start_date || !end_date) return res.status(400).json({ error: 'Leave type and dates required' });

    const { data: newLeave, error } = await supabase
        .from('leave_requests')
        .insert({
            user_id: req.user.id,
            leave_type,
            start_date,
            end_date,
            reason
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });

    // Notify admins
    const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin');
    if (admins) {
        const notifications = admins.map(admin => ({
            user_id: admin.id,
            type: 'leave',
            title: '📋 New Leave Request',
            message: `${req.user.full_name || 'A user'} applied for ${leave_type} leave (${start_date} to ${end_date})`
        }));
        await supabase.from('notifications').insert(notifications);
    }

    res.json({ id: newLeave.id, status: 'pending' });
});

// GET /api/leave/all — Admin: all pending + recent
router.get('/all', requireRole('admin'), async (req, res) => {
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

    const { data: requests, error } = await supabase
        .from('leave_requests')
        .select(`
            *,
            users!user_id(full_name, role, login_id)
        `)
        .or(`status.eq.pending,created_at.gt.${thirtyDaysAgo}`)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const flattened = requests.map(r => ({
        ...r,
        full_name: r.users?.full_name,
        role: r.users?.role,
        login_id: r.users?.login_id
    }));

    res.json(flattened);
});

// POST /api/leave/review/:id — Admin approve/reject
router.post('/review/:id', requireRole('admin'), async (req, res) => {
    const { status, admin_comment } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const now = Math.floor(Date.now() / 1000);
    const { data: leave, error: getErr } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('id', req.params.id)
        .single();

    if (getErr || !leave) return res.status(404).json({ error: 'Not found' });

    const { error: updErr } = await supabase
        .from('leave_requests')
        .update({
            status,
            admin_comment: admin_comment || null,
            reviewed_by: req.user.id,
            reviewed_at: now
        })
        .eq('id', req.params.id);

    if (updErr) return res.status(500).json({ error: updErr.message });

    // Notify requester
    const icon = status === 'approved' ? '✅' : '❌';
    await supabase.from('notifications').insert({
        user_id: leave.user_id,
        type: 'leave',
        title: `${icon} Leave ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: `Your ${leave.leave_type} leave (${leave.start_date} to ${leave.end_date}) has been ${status}.`
    });

    res.json({ success: true });
});

module.exports = router;
