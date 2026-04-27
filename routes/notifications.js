const router = require('express').Router();
const supabase = require('../database/supabase');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/notifications — user's notifications
router.get('/', async (req, res) => {
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

    const { data: notes, error } = await supabase
        .from('notifications')
        .select('*')
        .or(`user_id.eq.${req.user.id},broadcast.eq.1`)
        .gt('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(50);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(notes);
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res) => {
    const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .or(`user_id.eq.${req.user.id},broadcast.eq.1`)
        .eq('is_read', 0);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ count: count || 0 });
});

// POST /api/notifications/read/:id
router.post('/read/:id', async (req, res) => {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: 1 })
        .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// POST /api/notifications/read-all
router.post('/read-all', async (req, res) => {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: 1 })
        .or(`user_id.eq.${req.user.id},broadcast.eq.1`);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// POST /api/notifications/broadcast — Admin broadcast
router.post('/broadcast', async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { title, message, type } = req.body;
    
    const { error } = await supabase
        .from('notifications')
        .insert({
            broadcast: 1,
            type: type || 'announcement',
            title,
            message
        });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

module.exports = router;
