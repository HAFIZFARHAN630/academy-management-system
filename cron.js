const db = require('./database/db');

function initCron() {
    // Run every minute
    setInterval(() => {
        const now = new Date();
        const localTimeStr = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour12: false, hour: '2-digit', minute: '2-digit' });
        const localToday = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
        const nowSeconds = Math.floor(now.getTime() / 1000);

        // 1. Midnight Reset (Run at 00:00)
        if (localTimeStr === '00:00') {
            const activePunches = db.prepare(`SELECT id, user_id FROM attendance WHERE punch_out IS NULL`).all();
            if (activePunches.length > 0) {
                const stmt = db.prepare(`UPDATE attendance SET punch_out=?, method='system_auto', notes='Midnight Auto Reset' WHERE id=?`);
                db.transaction(() => {
                    for (const p of activePunches) {
                        stmt.run(nowSeconds, p.id);
                        db.prepare("INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'system', 'Day Reset', 'Your session was automatically closed at midnight.')").run(p.user_id);
                    }
                })();
                console.log(`[CRON] Midnight reset: Auto-closed ${activePunches.length} sessions.`);
            }
            return;
        }

        // 2. Regular Shift End Auto Punch Out
        let shiftRow = db.prepare("SELECT value FROM system_settings WHERE key='shift_end'").get();
        if (!shiftRow) return;
        const shiftEnd = shiftRow.value; 

        const [shiftH, shiftM] = shiftEnd.split(':').map(Number);
        const shiftMinutes = shiftH * 60 + shiftM;
        const [currH, currM] = localTimeStr.split(':').map(Number);
        const currentMinutes = currH * 60 + currM;

        // Run within 2 hours after shift end
        if (currentMinutes >= shiftMinutes && currentMinutes <= shiftMinutes + 120) {
            const activePunches = db.prepare(`SELECT id, user_id FROM attendance WHERE date=? AND punch_out IS NULL`).all(localToday);
            if (activePunches.length > 0) {
                const stmt = db.prepare(`UPDATE attendance SET punch_out=?, method='system_auto' WHERE id=?`);
                db.transaction(() => {
                    for (const p of activePunches) {
                        stmt.run(nowSeconds, p.id);
                        db.prepare("INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'system', 'Auto Checkout', 'You were automatically checked out at shift end.')").run(p.user_id);
                    }
                })();
                console.log(`[CRON] Auto-checked out ${activePunches.length} users at ${localTimeStr}`);
            }
        }
    }, 60000); 
}

module.exports = { initCron };
