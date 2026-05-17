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

// GET /api/settings/public (Public regional settings)
router.get('/public', async (req, res) => {
    try {
        const { data } = await supabase.from('system_settings').select('key, value').in('key', ['currency', 'phone_prefix', 'timezone']);
        const settings = {};
        if (data) data.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (err) { res.status(500).json({ error: err.message }); }
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
// ─── PWA Settings ──────────────────────────────────────────────────────────────
router.get('/pwa', async (req, res) => {
    try {
        const { data: row } = await supabase.from('system_settings').select('value').eq('key', 'pwa_settings').maybeSingle();
        if (!row) return res.json({ enabled: false, force_app: false, prompt_install: false });
        res.json(JSON.parse(row.value));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/pwa', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const pwa_settings = req.body;
        const { error } = await supabase.from('system_settings').upsert({ key: 'pwa_settings', value: JSON.stringify(pwa_settings) });
        if (error) throw error;
        
        await supabase.from('audit_log').insert({
            admin_id: req.user.id,
            action: 'UPDATE_PWA_SETTINGS',
            target_table: 'system_settings',
            details: `Updated PWA Settings`
        });
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Face ID Settings ──────────────────────────────────────────────────────────
router.get('/face-id', async (req, res) => {
    try {
        const { data: row } = await supabase.from('system_settings').select('value').eq('key', 'face_id_settings').maybeSingle();
        if (!row) return res.json({ enabled: true, liveness: true, threshold: 90, fallback_pin: true });
        res.json(JSON.parse(row.value));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/face-id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const face_settings = req.body;
        const { error } = await supabase.from('system_settings').upsert({ key: 'face_id_settings', value: JSON.stringify(face_settings) });
        if (error) throw error;
        
        await supabase.from('audit_log').insert({
            admin_id: req.user.id,
            action: 'UPDATE_FACE_ID_SETTINGS',
            target_table: 'system_settings',
            details: `Updated Face ID Settings`
        });
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ─── Privacy Policy ──────────────────────────────────────────────────────────
router.get('/privacy', async (req, res) => {
    try {
        const { data: row, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'privacy_policy')
            .maybeSingle();

        if (error) throw error;
            
        if (!row) return res.json({ content: '', status: 'draft', version: 0 });
        
        res.json(JSON.parse(row.value));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/privacy', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { content, status } = req.body;
        if (!content) return res.status(400).json({ error: 'Content required' });
        
        // Get current version
        const { data: current } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'privacy_policy')
            .maybeSingle();
            
        let currentData = current ? JSON.parse(current.value) : { version: 0 };
        let newVersion = (currentData.version || 0) + 1;
        
        const policyData = {
            content,
            status: status || 'draft',
            version: newVersion,
            published_by: req.user.id,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('system_settings')
            .upsert({ key: 'privacy_policy', value: JSON.stringify(policyData) });
            
        if (error) throw error;
        
        // Log action
        await supabase.from('audit_log').insert({
            admin_id: req.user.id,
            action: 'UPDATE_PRIVACY_POLICY',
            target_table: 'system_settings',
            details: `Updated privacy policy (v${newVersion}) - Status: ${status}`
        });

        res.json(policyData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/settings/archive-data (Admin only)
router.post('/archive-data', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { years } = req.body;
        if (!years) return res.status(400).json({ error: 'Years parameter is required' });
        
        const yearsInt = parseInt(years);
        if (isNaN(yearsInt) || yearsInt < 1) return res.status(400).json({ error: 'Invalid years parameter' });

        const cutoffDate = new Date();
        cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsInt);
        const cutoffString = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const cutoffUnix = Math.floor(cutoffDate.getTime() / 1000);

        // Delete from attendance where date <= cutoffString
        const { error: attError, count: attCount } = await supabase
            .from('attendance')
            .delete({ count: 'exact' })
            .lte('date', cutoffString);

        if (attError) throw attError;

        // Delete from visitors where check_in <= cutoffUnix
        const { error: visError, count: visCount } = await supabase
            .from('visitors')
            .delete({ count: 'exact' })
            .lte('check_in', cutoffUnix);

        if (visError) throw visError;

        await supabase.from('audit_log').insert({
            admin_id: req.user.id,
            action: 'ARCHIVE_DATA',
            target_table: 'multiple',
            details: `Deleted data older than ${yearsInt} years. Attendance: ${attCount || 0}, Visitors: ${visCount || 0}`
        });

        res.json({ success: true, deleted: { attendance: attCount || 0, visitors: visCount || 0 } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
