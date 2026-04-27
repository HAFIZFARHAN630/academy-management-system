const router = require('express').Router();
const supabase = require('../database/supabase');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// Real-time clients for SSE
const clients = new Set();

// GET /api/attendance/live — SSE stream
router.get('/live', requireRole('admin'), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = async () => {
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
      const data = await getLiveData(today);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      console.error('SSE send error:', err);
    }
  };

  clients.add(send);
  await send();
  const interval = setInterval(send, 10000);
  req.on('close', () => { clients.delete(send); clearInterval(interval); });
});

async function getLiveData(date) {
  // We use multiple select calls or a single RPC/Complex query. 
  // For simplicity and matching current logic, we'll do separate calls.
  
  // Teachers
  const { data: teachers } = await supabase
    .from('users')
    .select(`
      id, full_name, login_id, photo,
      attendance!left(punch_in, punch_out, status)
    `)
    .eq('role', 'teacher')
    .eq('status', 'active')
    .eq('attendance.date', date);

  // Flatten the attendance data from the join
  const processedTeachers = teachers?.map(u => ({
    ...u,
    punch_in: u.attendance?.[0]?.punch_in || null,
    punch_out: u.attendance?.[0]?.punch_out || null,
    status: u.attendance?.[0]?.status || null
  })) || [];

  // Students
  const { data: students } = await supabase
    .from('users')
    .select(`
      id, full_name, login_id, photo, class_name, section, roll_no,
      attendance!left(punch_in, punch_out, status, is_manual)
    `)
    .eq('role', 'student')
    .eq('status', 'active')
    .eq('attendance.date', date);

  const processedStudents = students?.map(u => ({
    ...u,
    punch_in: u.attendance?.[0]?.punch_in || null,
    punch_out: u.attendance?.[0]?.punch_out || null,
    status: u.attendance?.[0]?.status || null,
    is_manual: u.attendance?.[0]?.is_manual || null
  })) || [];

  // Workers
  const { data: workers } = await supabase
    .from('users')
    .select(`
      id, full_name, login_id, photo, designation,
      attendance!left(punch_in, punch_out, status)
    `)
    .eq('role', 'worker')
    .eq('status', 'active')
    .eq('attendance.date', date);

  const processedWorkers = workers?.map(u => ({
    ...u,
    punch_in: u.attendance?.[0]?.punch_in || null,
    punch_out: u.attendance?.[0]?.punch_out || null,
    status: u.attendance?.[0]?.status || null
  })) || [];

  // Visitors
  const { data: visitors } = await supabase
    .from('visitors')
    .select('*, users(full_name)')
    .eq('status', 'inside')
    .order('check_in', { ascending: false });

  const processedVisitors = visitors?.map(v => ({
    ...v,
    host_name: v.users?.full_name || null
  })) || [];

  return { teachers: processedTeachers, students: processedStudents, workers: processedWorkers, visitors: processedVisitors, timestamp: Date.now() };
}

// Helper for local date/time
const getToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
const getNowTime = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour12: false, hour: '2-digit', minute: '2-digit' });

// POST /api/attendance/punch — Punch In/Out
router.post('/punch', async (req, res) => {
  const today = getToday();
  const now = Math.floor(Date.now() / 1000);
  const { lat, lng, device, reason } = req.body;
  const location = lat && lng ? JSON.stringify({ lat, lng }) : null;

  const { data: existing } = await supabase
    .from('attendance')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('date', today)
    .maybeSingle();

  const { data: user } = await supabase
    .from('users')
    .select('shift_start, shift_end, role')
    .eq('id', req.user.id)
    .single();

  if (!existing) {
    // Punch In
    const nowTime = getNowTime();
    let status = 'present';
    if (user && user.shift_start && nowTime > user.shift_start) {
        status = 'late';
    } else if (!user || !user.shift_start) {
        if (new Date().getHours() >= 9) status = 'late';
    }

    await supabase
      .from('attendance')
      .insert({
        user_id: req.user.id,
        punch_in: now,
        date: today,
        location_in: location,
        device_in: device,
        status: status,
        location_lat: lat || null,
        location_lng: lng || null,
        method: 'manual'
      });
    
    return res.json({ action: 'punch_in', time: now, status });
  }

  if (!existing.punch_out) {
    // Punch Out
    const nowTime = getNowTime();
    let isEarly = 0;
    let isLate = 0;

    if (user && user.shift_end) {
      if (nowTime < user.shift_end) {
        isEarly = 1;
      } else {
        const [h, m] = user.shift_end.split(':').map(Number);
        const shiftEndMinutes = h * 60 + m;
        const [nowH, nowM] = nowTime.split(':').map(Number);
        const nowMinutes = nowH * 60 + nowM;
        if (nowMinutes > shiftEndMinutes + 120) isLate = 1;
      }
    }

    const duration = now - existing.punch_in;
    await supabase
      .from('attendance')
      .update({
        punch_out: now,
        location_out: location,
        device_out: device,
        early_leave: isEarly,
        early_leave_reason: isEarly ? reason : null,
        early_leave_status: isEarly ? 'pending' : 'approved',
        late_checkout: isLate,
        late_checkout_reason: isLate ? reason : null,
        late_checkout_status: isLate ? 'flagged' : 'approved'
      })
      .eq('id', existing.id);
    
    return res.json({ 
      action: 'punch_out', 
      time: now, 
      duration_seconds: duration,
      is_early: !!isEarly,
      is_late: !!isLate
    });
  }

  res.json({ action: 'already_complete', message: 'Already punched in and out today' });
});

// GET /api/attendance/my-status
router.get('/my-status', async (req, res) => {
  const today = getToday();
  const { data: record } = await supabase
    .from('attendance')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('date', today)
    .maybeSingle();
    
  res.json(record || { status: 'not_punched' });
});

// GET /api/attendance/daily-report?date=YYYY-MM-DD
router.get('/daily-report', requireRole('admin'), async (req, res) => {
  const date = req.query.date || getToday();
  
  const { data: records, error } = await supabase
    .from('users')
    .select(`
      id, full_name, login_id, role, class_name,
      attendance!left(punch_in, punch_out, status, is_manual, method)
    `)
    .neq('role', 'admin')
    .eq('status', 'active')
    .eq('attendance.date', date)
    .order('role')
    .order('full_name');

  if (error) return res.status(500).json({ error: error.message });

  const flattened = records.map(u => ({
    ...u,
    punch_in: u.attendance?.[0]?.punch_in || null,
    punch_out: u.attendance?.[0]?.punch_out || null,
    status: u.attendance?.[0]?.status || null,
    is_manual: u.attendance?.[0]?.is_manual || null,
    method: u.attendance?.[0]?.method || null
  }));

  res.json(flattened);
});

// POST /api/attendance/mark — Admin/Teacher manual mark
router.post('/mark', requireRole('admin', 'teacher'), async (req, res) => {
  const { user_id, date, status, notes } = req.body;
  const today = date || getToday();
  const now = Math.floor(Date.now() / 1000);

  const { data: existing } = await supabase
    .from('attendance')
    .select('id')
    .eq('user_id', user_id)
    .eq('date', today)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('attendance')
      .update({
        status,
        is_manual: 1,
        marked_by: req.user.id,
        notes
      })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('attendance')
      .insert({
        user_id,
        date: today,
        status,
        is_manual: 1,
        marked_by: req.user.id,
        notes,
        punch_in: now
      });
  }
  res.json({ success: true });
});

// GET /api/attendance/summary/:userId — Monthly summary
router.get('/summary/:userId', async (req, res) => {
  const { month } = req.query; // YYYY-MM
  const m = month || new Date().toISOString().slice(0, 7);
  
  const { data: records, error } = await supabase
    .from('attendance')
    .select('date, punch_in, punch_out, status, is_manual')
    .eq('user_id', req.params.userId)
    .like('date', `${m}%`)
    .order('date');

  if (error) return res.status(500).json({ error: error.message });

  const present = records.filter(r => r.status === 'present' || r.status === 'late').length;
  const absent = records.filter(r => r.status === 'absent').length;
  const late = records.filter(r => r.status === 'late').length;

  res.json({ records, summary: { present, absent, late } });
});

// GET /api/attendance/early-leaves — Admin list
router.get('/early-leaves', requireRole('admin'), async (req, res) => {
  const { data: records, error } = await supabase
    .from('attendance')
    .select('*, users(full_name, login_id, role, shift_end)')
    .eq('early_leave', 1)
    .eq('early_leave_status', 'pending')
    .order('date', { ascending: false })
    .order('punch_out', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const flattened = records.map(r => ({
    ...r,
    full_name: r.users?.full_name,
    login_id: r.users?.login_id,
    role: r.users?.role,
    shift_end: r.users?.shift_end
  }));

  res.json(flattened);
});

// POST /api/attendance/early-leaves/:id/review — Admin action
router.post('/early-leaves/:id/review', requireRole('admin'), async (req, res) => {
  const { status, comment } = req.body; // approved, flagged, rejected
  if (!['approved', 'flagged', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const { error } = await supabase
    .from('attendance')
    .update({
        early_leave_status: status,
        early_leave_reviewed_by: req.user.id,
        notes: comment // Simplification, append to notes if needed
    })
    .eq('id', req.params.id);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
