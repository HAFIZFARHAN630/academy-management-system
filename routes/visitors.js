const router = require('express').Router();
const supabase = require('../database/supabase');
const { authMiddleware, requireRole } = require('../middleware/auth');

async function generateVisitorId() {
    const d = new Date();
    const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const today = d.toISOString().split('T')[0];

    const { count, error } = await supabase
        .from('visitors')
        .select('*', { count: 'exact', head: true })
        .gte('check_in', Math.floor(new Date(today).getTime() / 1000));
    
    const nextNum = (count || 0) + 1;
    return `VIS-${date}-${String(nextNum).padStart(3, '0')}`;
}

// POST /api/visitors/checkin
router.post('/checkin', async (req, res) => {
    const { full_name, phone, cnic, purpose, host_id, notes } = req.body;
    if (!full_name || !phone || !purpose) return res.status(400).json({ error: 'Name, phone, and purpose required' });

    // Check blacklist
    if (cnic) {
        const { data: bl, error: blErr } = await supabase
            .from('visitors')
            .select('blacklisted')
            .eq('cnic', cnic)
            .eq('blacklisted', 1)
            .limit(1)
            .maybeSingle();
        
        if (bl) return res.status(403).json({ error: 'This visitor is blacklisted' });
    }

    const visitor_id = await generateVisitorId();
    const now = Math.floor(Date.now() / 1000);
    
    const { data: result, error } = await supabase
        .from('visitors')
        .insert({
            visitor_id,
            full_name,
            phone,
            cnic: cnic || null,
            purpose,
            host_id: host_id || null,
            check_in: now,
            registered_by: req.user ? req.user.id : null,
            notes: notes || null,
            badge_qr: visitor_id
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });

    // Notify host if present
    if (host_id) {
        await supabase
            .from('notifications')
            .insert({
                user_id: host_id,
                type: 'visitor',
                title: '📍 Visitor Arrived',
                message: `${full_name} has arrived to meet you. (${purpose})`
            });
    }

    res.json({ id: result.id, visitor_id, check_in: now });
});

// Apply auth middleware to all routes below this line
router.use(authMiddleware);

// POST /api/visitors/checkout/:id
router.post('/checkout/:id', async (req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const { data: visitor, error: getErr } = await supabase
        .from('visitors')
        .select('*')
        .or(`id.eq.${req.params.id},visitor_id.eq.${req.params.id}`)
        .maybeSingle();

    if (getErr || !visitor) return res.status(404).json({ error: 'Visitor not found' });
    if (visitor.status === 'checked-out') return res.status(400).json({ error: 'Already checked out' });

    const duration = Math.floor((now - visitor.check_in) / 60);
    const { feedback_stars } = req.body;

    await supabase
        .from('visitors')
        .update({
            check_out: now,
            duration_mins: duration,
            status: 'checked-out',
            feedback_stars: feedback_stars || visitor.feedback_stars
        })
        .eq('id', visitor.id);

    res.json({ success: true, duration_mins: duration });
});

// GET /api/visitors/active — currently inside
router.get('/active', requireRole('admin'), async (req, res) => {
    const { data: visitors, error } = await supabase
        .from('visitors')
        .select('*, users!host_id(full_name)')
        .eq('status', 'inside')
        .order('check_in', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const flattened = visitors.map(v => ({
        ...v,
        host_name: v.users?.full_name || null
    }));

    res.json(flattened);
});

// GET /api/visitors/logs — historical with filters
router.get('/logs', requireRole('admin'), async (req, res) => {
    const { from, to, purpose, host_id, search } = req.query;
    let query = supabase
        .from('visitors')
        .select('*, users!host_id(full_name)');

    if (from) query = query.gte('check_in', Math.floor(new Date(from).getTime() / 1000));
    if (to) query = query.lte('check_in', Math.floor(new Date(to).getTime() / 1000) + 86399);
    if (purpose) query = query.eq('purpose', purpose);
    if (host_id) query = query.eq('host_id', host_id);
    if (search) query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,cnic.ilike.%${search}%`);

    const { data: visitors, error } = await query
        .order('check_in', { ascending: false })
        .limit(200);

    if (error) return res.status(500).json({ error: error.message });

    const flattened = visitors.map(v => ({
        ...v,
        host_name: v.users?.full_name || null
    }));

    res.json(flattened);
});

// POST /api/visitors/:id/blacklist
router.post('/:id/blacklist', requireRole('admin'), async (req, res) => {
    const { error } = await supabase
        .from('visitors')
        .update({ blacklisted: 1 })
        .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// GET /api/visitors/stats
router.get('/stats', requireRole('admin'), async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const todayTs = Math.floor(new Date(today).getTime() / 1000);

    const { count: today_count } = await supabase.from('visitors').select('*', { count: 'exact', head: true }).gte('check_in', todayTs);
    const { count: inside_count } = await supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('status', 'inside');
    
    // For avg_duration, we'll fetch records with duration_mins IS NOT NULL
    const { data: durData } = await supabase.from('visitors').select('duration_mins').not('duration_mins', 'is', null);
    
    let avg_duration = 0;
    if (durData && durData.length > 0) {
        const sum = durData.reduce((acc, curr) => acc + (curr.duration_mins || 0), 0);
        avg_duration = sum / durData.length;
    }

    res.json({ today_count: today_count || 0, inside_count: inside_count || 0, avg_duration: Math.round(avg_duration) });
});

module.exports = router;
