const router = require('express').Router();
const supabase = require('../database/supabase');

// POST /api/analytics/pwa-install
router.post('/pwa-install', async (req, res) => {
    try {
        const { device_type, os, browser, user_id } = req.body;
        
        const { error } = await supabase.from('pwa_installs').insert({
            user_id: user_id || null,
            device_type: device_type || 'unknown',
            os: os || 'unknown',
            browser: browser || 'unknown',
            installed_at: new Date().toISOString()
        });

        if (error) throw error;
        
        res.json({ success: true });
    } catch (err) {
        console.error('PWA install log failed:', err);
        res.status(500).json({ error: 'Failed to record installation' });
    }
});

module.exports = router;
