const supabase = require('./database/supabase');

function initCron() {
    console.log('⏰ Cron jobs initialized...');
    
    // Run every minute
    setInterval(async () => {
        try {
            const now = new Date();
            const localTimeStr = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour12: false, hour: '2-digit', minute: '2-digit' });
            const localToday = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
            const nowSeconds = Math.floor(now.getTime() / 1000);

            // 1. Midnight Reset (Run at 00:00)
            if (localTimeStr === '00:00') {
                const { data: activePunches } = await supabase
                    .from('attendance')
                    .select('id, user_id')
                    .is('punch_out', null);

                if (activePunches && activePunches.length > 0) {
                    for (const p of activePunches) {
                        await supabase
                            .from('attendance')
                            .update({ punch_out: nowSeconds, method: 'system_auto', notes: 'Midnight Auto Reset' })
                            .eq('id', p.id);
                        
                        await supabase
                            .from('notifications')
                            .insert({
                                user_id: p.user_id,
                                type: 'system',
                                title: 'Day Reset',
                                message: 'Your session was automatically closed at midnight.'
                            });
                    }
                    console.log(`[CRON] Midnight reset: Auto-closed ${activePunches.length} sessions.`);
                }
                return;
            }

            // 2. Regular Shift End Auto Punch Out
            const { data: shiftRow } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'shift_end')
                .maybeSingle();

            if (!shiftRow) return;
            const shiftEnd = shiftRow.value; 

            const [shiftH, shiftM] = shiftEnd.split(':').map(Number);
            const shiftMinutes = shiftH * 60 + shiftM;
            const [currH, currM] = localTimeStr.split(':').map(Number);
            const currentMinutes = currH * 60 + currM;

            // Run within 2 hours after shift end (specifically at the 2-hour mark, or checking continuously)
            // The original logic checks if currentMinutes is between shiftMinutes and shiftMinutes + 120.
            // This would run every minute for 2 hours. To avoid redundant calls, we should only target those with punch_out IS NULL on localToday.
            if (currentMinutes >= shiftMinutes && currentMinutes <= shiftMinutes + 120) {
                const { data: activePunches } = await supabase
                    .from('attendance')
                    .select('id, user_id')
                    .eq('date', localToday)
                    .is('punch_out', null);

                if (activePunches && activePunches.length > 0) {
                    for (const p of activePunches) {
                        await supabase
                            .from('attendance')
                            .update({ punch_out: nowSeconds, method: 'system_auto' })
                            .eq('id', p.id);
                        
                        await supabase
                            .from('notifications')
                            .insert({
                                user_id: p.user_id,
                                type: 'system',
                                title: 'Auto Checkout',
                                message: 'You were automatically checked out at shift end.'
                            });
                    }
                    console.log(`[CRON] Auto-checked out ${activePunches.length} users at ${localTimeStr}`);
                }
            }
        } catch (err) {
            console.error('[CRON] Error:', err.message);
        }
    }, 60000); 
}

module.exports = { initCron };
