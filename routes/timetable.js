const router = require('express').Router();
const supabase = require('../database/supabase');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/timetable — List all entries (Admin/Staff)
router.get('/', requireRole('admin', 'teacher'), async (req, res) => {
  const { class_name, teacher_id } = req.query;
  
  let query = supabase
    .from('timetable')
    .select('*, users!teacher_id(full_name)');
  
  if (class_name) query = query.eq('class_name', class_name);
  if (teacher_id) query = query.eq('teacher_id', teacher_id);
  
  const { data: entries, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Custom sort for days of the week
  const dayOrder = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6, 'Sun': 7 };
  const sorted = (entries || []).map(e => ({
    ...e,
    teacher_name: e.users?.full_name || null
  })).sort((a, b) => {
    if (dayOrder[a.day_of_week] !== dayOrder[b.day_of_week]) {
      return dayOrder[a.day_of_week] - dayOrder[b.day_of_week];
    }
    return a.start_time.localeCompare(b.start_time);
  });

  res.json(sorted);
});

// POST /api/timetable — Create entry
router.post('/', requireRole('admin'), async (req, res) => {
  const { class_name, teacher_id, subject, room, day_of_week, start_time, end_time, recurrence } = req.body;
  if (!class_name || !day_of_week || !start_time || !end_time) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { data: result, error } = await supabase
    .from('timetable')
    .insert({
        class_name,
        teacher_id: teacher_id || null,
        subject: subject || null,
        room: room || null,
        day_of_week,
        start_time,
        end_time,
        recurrence: recurrence || 'weekly'
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, id: result.id });
});

// DELETE /api/timetable/:id
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabase.from('timetable').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// GET /api/timetable/today — Today's schedule for logged in user
router.get('/today', async (req, res) => {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = days[new Date().getDay()];
  
  let query = supabase.from('timetable').select('*').eq('day_of_week', today);

  if (req.user.role === 'student') {
    const { data: student } = await supabase.from('users').select('class_name').eq('id', req.user.id).single();
    if (!student || !student.class_name) return res.json([]);
    query = query.eq('class_name', student.class_name);
  } else if (req.user.role === 'teacher') {
    query = query.eq('teacher_id', req.user.id);
  } else {
    return res.json([]);
  }

  const { data: schedule, error } = await query.order('start_time');
  if (error) return res.status(500).json({ error: error.message });
  res.json(schedule);
});

module.exports = router;
