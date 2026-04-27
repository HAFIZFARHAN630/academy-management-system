const router = require('express').Router();
const supabase = require('../database/supabase');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/data', async (req, res) => {
    try {
        const userId = req.user.id;
        const today = new Date().toLocaleDateString('en-CA', { timeZone: process.env.TIMEZONE || 'Asia/Karachi' });

        const [
            { data: userProfile },
            { data: todayAttendance },
            { data: todaySchedule },
            { data: settings }
        ] = await Promise.all([
            supabase.from('users').select('*').eq('id', userId).single(),
            supabase.from('attendance').select('*').eq('user_id', userId).eq('date', today).maybeSingle(),
            supabase.from('timetable').select('*').or(`class_name.eq.${req.user.class_name || 'NONE'},teacher_id.eq.${userId}`).eq('day', new Date().toLocaleDateString('en-US', { weekday: 'Long' })),
            supabase.from('settings').select('*').single()
        ]);

        res.json({
            profile: userProfile,
            attendance: todayAttendance,
            schedule: todaySchedule || [],
            settings: settings || { modules: {} }
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
