const router = require('express').Router();
const supabase = require('../database/supabase');
const db = require('../database/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// Seed default settings if they don't exist
async function fetchSettings() {
    const defaultModules = {
        timetable: 'ON',
        payslips: 'ON',
        result_cards: 'PREPARE',
        library: 'OFF',
        transport: 'OFF'
    };

    const { data: allSettings } = await supabase.from('system_settings').select('*');
    const settingsMap = {};
    allSettings?.forEach(s => settingsMap[s.key] = s.value);

    if (!settingsMap['modules']) {
        await supabase.from('system_settings').insert({ key: 'modules', value: JSON.stringify(defaultModules) });
        settingsMap['modules'] = JSON.stringify(defaultModules);
    }

    if (!settingsMap['shift_start']) {
        await supabase.from('system_settings').insert({ key: 'shift_start', value: '09:00' });
        settingsMap['shift_start'] = '09:00';
    }

    if (!settingsMap['grace_period']) {
        await supabase.from('system_settings').insert({ key: 'grace_period', value: '15' });
        settingsMap['grace_period'] = '15';
    }

    if (!settingsMap['require_reason']) {
        await supabase.from('system_settings').insert({ key: 'require_reason', value: 'false' });
        settingsMap['require_reason'] = 'false';
    }

    if (!settingsMap['track_location']) {
        await supabase.from('system_settings').insert({ key: 'track_location', value: 'true' });
        settingsMap['track_location'] = 'true';
    }

    return {
        modules: JSON.parse(settingsMap['modules']),
        shift_start: settingsMap['shift_start'],
        shift_end: settingsMap['shift_end'],
        grace_period: parseInt(settingsMap['grace_period']),
        require_reason: settingsMap['require_reason'] === 'true',
        track_location: settingsMap['track_location'] === 'true',
        country: settingsMap['country'] || 'Pakistan',
        timezone: settingsMap['timezone'] || 'Asia/Karachi',
        weekends: settingsMap['weekends'] || 'Friday,Saturday',
        currency: settingsMap['currency'] || 'PKR',
        phone_prefix: settingsMap['phone_prefix'] || '+92'
    };
}

// GET /api/settings (Public config)
router.get('/', async (req, res) => {
    try {
        const settings = await fetchSettings();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/settings/modules (Admin only)
router.put('/modules', authMiddleware, requireRole('admin'), async (req, res) => {
    const updatedModules = req.body;
    const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'modules', value: JSON.stringify(updatedModules) });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, modules: updatedModules });
});

// PUT /api/settings/shift (Admin only)
router.put('/shift', authMiddleware, requireRole('admin'), async (req, res) => {
    const { shift_start, shift_end, grace_period, require_reason, track_location } = req.body;
    const updates = [];
    if (shift_start) updates.push({ key: 'shift_start', value: shift_start });
    if (shift_end) updates.push({ key: 'shift_end', value: shift_end });
    if (grace_period !== undefined) updates.push({ key: 'grace_period', value: String(grace_period) });
    if (require_reason !== undefined) updates.push({ key: 'require_reason', value: String(require_reason) });
    if (track_location !== undefined) updates.push({ key: 'track_location', value: String(track_location) });
    
    if (updates.length > 0) {
        await supabase.from('system_settings').upsert(updates);
    }
    res.json({ success: true });
});

// GET /api/settings/branding (Public)
router.get('/branding', async (req, res) => {
    const { data: row } = await supabase.from('system_settings').select('value').eq('key', 'branding').maybeSingle();
    if (!row) return res.json({ name: 'ClickTake Academy', tagline: 'Management System', colors: { primary: '#6C63FF', secondary: '#2ED573', accent: '#00D2D3' } });
    res.json(JSON.parse(row.value));
});

// PUT /api/settings/branding (Admin only)
router.put('/branding', authMiddleware, requireRole('admin'), async (req, res) => {
    const branding = req.body;
    const { error } = await supabase.from('system_settings').upsert({ key: 'branding', value: JSON.stringify(branding) });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// PUT /api/settings/regional (Admin only)
router.put('/regional', authMiddleware, requireRole('admin'), async (req, res) => {
    const { country, timezone, weekends, currency, phone_prefix } = req.body;
    
    const updates = [];
    if (country) updates.push({ key: 'country', value: country });
    if (timezone) updates.push({ key: 'timezone', value: timezone });
    if (weekends) updates.push({ key: 'weekends', value: weekends });
    if (currency) updates.push({ key: 'currency', value: currency });
    if (phone_prefix) updates.push({ key: 'phone_prefix', value: phone_prefix });
    
    if (updates.length > 0) {
        const { error } = await supabase.from('system_settings').upsert(updates);
        if (error) return res.status(500).json({ error: error.message });
    }
    
    res.json({ success: true });
});

// ─── Privacy Policy ──────────────────────────────────────────────────────────
router.get('/privacy', async (req, res) => {
    try {
        const row = db.prepare("SELECT * FROM privacy_policies ORDER BY version DESC LIMIT 1").get();
            
        if (!row) return res.json({ content: '', status: 'draft', version: 0 });
        
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/privacy', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { content, status } = req.body;
        if (!content) return res.status(400).json({ error: 'Content required' });
        
        // Get current version
        const current = db.prepare("SELECT version FROM privacy_policies ORDER BY version DESC LIMIT 1").get();
            
        let newVersion = (current?.version || 0) + 1;
        
        const stmt = db.prepare(`
            INSERT INTO privacy_policies (content, status, version, published_by)
            VALUES (?, ?, ?, ?)
        `);
        const info = stmt.run(content, status || 'draft', newVersion, req.user.id);
        
        // Log action
        await supabase.from('audit_log').insert({
            admin_id: req.user.id,
            action: 'UPDATE_PRIVACY_POLICY',
            target_table: 'privacy_policies',
            details: `Created new privacy policy (v${newVersion}) - Status: ${status}`
        });

        res.json({ id: info.lastInsertRowid, content, status: status || 'draft', version: newVersion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
