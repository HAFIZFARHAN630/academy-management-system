const router = require('express').Router();
const db = require('../database/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// Seed default settings if they don't exist
function getSettings() {
    const defaultModules = {
        timetable: 'ON',
        payslips: 'ON',
        result_cards: 'PREPARE',
        library: 'OFF',
        transport: 'OFF'
    };

    let modulesRow = db.prepare("SELECT value FROM system_settings WHERE key='modules'").get();
    if (!modulesRow) {
        db.prepare("INSERT INTO system_settings (key, value) VALUES ('modules', ?)").run(JSON.stringify(defaultModules));
        modulesRow = { value: JSON.stringify(defaultModules) };
    }

    let shiftRow = db.prepare("SELECT value FROM system_settings WHERE key='shift_end'").get();
    if (!shiftRow) {
        db.prepare("INSERT INTO system_settings (key, value) VALUES ('shift_end', '16:00')").run();
        shiftRow = { value: '16:00' };
    }

    const country = db.prepare("SELECT value FROM system_settings WHERE key='country'").get()?.value || 'Pakistan';
    const timezone = db.prepare("SELECT value FROM system_settings WHERE key='timezone'").get()?.value || 'Asia/Karachi';
    const weekends = db.prepare("SELECT value FROM system_settings WHERE key='weekends'").get()?.value || 'Friday,Saturday';
    const currency = db.prepare("SELECT value FROM system_settings WHERE key='currency'").get()?.value || 'PKR';
    const phone_prefix = db.prepare("SELECT value FROM system_settings WHERE key='phone_prefix'").get()?.value || '+92';

    return {
        modules: JSON.parse(modulesRow.value),
        shift_end: shiftRow.value,
        country,
        timezone,
        weekends,
        currency,
        phone_prefix
    };
}

// GET /api/settings (Public config)
router.get('/', (req, res) => {
    res.json(getSettings());
});

// PUT /api/settings/modules (Admin only)
router.put('/modules', authMiddleware, requireRole('admin'), (req, res) => {
    const updatedModules = req.body;
    db.prepare("UPDATE system_settings SET value=? WHERE key='modules'").run(JSON.stringify(updatedModules));
    res.json({ success: true, modules: updatedModules });
});

// PUT /api/settings/shift (Admin only)
router.put('/shift', authMiddleware, requireRole('admin'), (req, res) => {
    const { shift_end } = req.body;
    if (shift_end) {
        db.prepare("UPDATE system_settings SET value=? WHERE key='shift_end'").run(shift_end);
    }
    res.json({ success: true });
});

// GET /api/settings/branding (Public)
router.get('/branding', (req, res) => {
    const row = db.prepare("SELECT value FROM system_settings WHERE key='branding'").get();
    if (!row) return res.json({ name: 'ClickTake Academy', tagline: 'Management System', colors: { primary: '#6C63FF', secondary: '#2ED573', accent: '#00D2D3' } });
    res.json(JSON.parse(row.value));
});

// PUT /api/settings/branding (Admin only)
router.put('/branding', authMiddleware, requireRole('admin'), (req, res) => {
    const branding = req.body;
    const exists = db.prepare("SELECT key FROM system_settings WHERE key='branding'").get();
    if (exists) {
        db.prepare("UPDATE system_settings SET value=? WHERE key='branding'").run(JSON.stringify(branding));
    } else {
        db.prepare("INSERT INTO system_settings (key, value) VALUES ('branding', ?)").run(JSON.stringify(branding));
    }
    res.json({ success: true });
});

// PUT /api/settings/regional (Admin only)
router.put('/regional', authMiddleware, requireRole('admin'), (req, res) => {
    const { country, timezone, weekends, currency, phone_prefix } = req.body;
    if (country) db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('country', ?)").run(country);
    if (timezone) db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('timezone', ?)").run(timezone);
    if (weekends) db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('weekends', ?)").run(weekends);
    if (currency) db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('currency', ?)").run(currency);
    if (phone_prefix) db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('phone_prefix', ?)").run(phone_prefix);
    res.json({ success: true });
});

module.exports = router;
