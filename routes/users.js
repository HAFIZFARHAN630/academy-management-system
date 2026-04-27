const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateLoginId(role, name) {
    const prefix = { teacher: 'TCH', student: 'STU', worker: 'WRK', admin: 'ADM' }[role] || 'USR';
    const count = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = ?").get(role).c + 1;
    return `${prefix}-${String(count).padStart(3, '0')}`;
}

function generateTempPassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── SELF PROFILE (All Users) ───────────────────────────────────────────────

router.get('/profile', (req, res) => {
    const u = db.prepare("SELECT id, login_id, full_name, phone, role, photo, address, emergency_contact, preferred_language, is_face_enrolled FROM users WHERE id=?").get(req.user.id);
    res.json(u);
});

router.patch('/profile', (req, res) => {
    const { full_name, phone, address, emergency_contact, preferred_language, photo } = req.body;
    db.prepare(`UPDATE users SET 
        full_name=COALESCE(?,full_name), 
        phone=COALESCE(?,phone), 
        address=COALESCE(?,address), 
        emergency_contact=COALESCE(?,emergency_contact), 
        preferred_language=COALESCE(?,preferred_language),
        photo=COALESCE(?,photo)
        WHERE id=?`)
        .run(full_name, phone, address, emergency_contact, preferred_language, photo, req.user.id);
    res.json({ success: true });
});

router.post('/face-enroll', (req, res) => {
    const { embedding } = req.body;
    if (!embedding || !Array.isArray(embedding)) return res.status(400).json({ error: 'Valid face embedding Array required' });

    db.prepare(`UPDATE users SET face_embedding=?, is_face_enrolled=1 WHERE id=?`)
        .run(JSON.stringify(embedding), req.user.id);
    res.json({ success: true });
});

router.post('/face-enroll/:id', requireRole('admin'), (req, res) => {
    const { embedding } = req.body;
    if (!embedding || !Array.isArray(embedding)) return res.status(400).json({ error: 'Valid face embedding Array required' });

    db.prepare(`UPDATE users SET face_embedding=?, is_face_enrolled=1 WHERE id=?`)
        .run(JSON.stringify(embedding), req.params.id);
    res.json({ success: true });
});

router.post('/reset-face/:id', requireRole('admin'), (req, res) => {
    db.prepare(`UPDATE users SET face_embedding=NULL, is_face_enrolled=0 WHERE id=?`).run(req.params.id);
    res.json({ success: true });
});

// Generic Reset Password for any user (Admin only)
router.post('/:id/reset-password', requireRole('admin'), (req, res) => {
    const temp = generateTempPassword();
    const hash = bcrypt.hashSync(temp, 10);
    const user = db.prepare("SELECT login_id, full_name FROM users WHERE id=?").get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    db.prepare("UPDATE users SET password=?, temp_password=1 WHERE id=?").run(hash, req.params.id);
    db.prepare("INSERT INTO audit_log (admin_id, action, target_table, target_id, details) VALUES (?,?,?,?,?)")
        .run(req.user.id, 'RESET_PWD', 'users', req.params.id, `Reset password for ${user.full_name} (${user.login_id})`);
        
    res.json({ success: true, temp_password: temp, login_id: user.login_id });
});

// Generic Deactivate
router.delete('/:id', requireRole('admin'), (req, res) => {
    db.prepare("UPDATE users SET status='inactive' WHERE id=?").run(req.params.id);
    res.json({ success: true });
});

// ─── TEACHERS ────────────────────────────────────────────────────────────────

router.get('/teachers', requireRole('admin'), (req, res) => {
    const teachers = db.prepare("SELECT id,login_id,full_name,phone,cnic,subject,qualification,joining_date,base_salary,salary_type,status,last_login,photo,is_face_enrolled FROM users WHERE role='teacher' ORDER BY full_name").all();
    res.json(teachers);
});

router.post('/teachers', requireRole('admin'), (req, res) => {
    const { full_name, cnic, phone, subject, qualification, joining_date, salary_type, base_salary, hourly_rate } = req.body;
    if (!full_name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    const login_id = generateLoginId('teacher');
    const temp = generateTempPassword();
    const hash = bcrypt.hashSync(temp, 10);
    const result = db.prepare(`
    INSERT INTO users (login_id,full_name,cnic,phone,role,password,temp_password,subject,qualification,joining_date,salary_type,base_salary,hourly_rate)
    VALUES (?,?,?,?,'teacher',?,1,?,?,?,?,?,?)
  `).run(login_id, full_name, cnic, phone, hash, subject, qualification, joining_date, salary_type, base_salary, hourly_rate);

    db.prepare("INSERT INTO audit_log (admin_id, action, target_table, target_id, details) VALUES (?,?,?,?,?)").run(req.user.id, 'CREATE', 'users', result.lastInsertRowid, `Created teacher: ${full_name}`);
    res.json({ id: result.lastInsertRowid, login_id, temp_password: temp, full_name });
});

router.put('/teachers/:id', requireRole('admin'), (req, res) => {
    const { full_name, cnic, phone, subject, qualification, joining_date, salary_type, base_salary, hourly_rate, status } = req.body;
    db.prepare(`UPDATE users SET full_name=?,cnic=?,phone=?,subject=?,qualification=?,joining_date=?,salary_type=?,base_salary=?,hourly_rate=?,status=? WHERE id=? AND role='teacher'`)
        .run(full_name, cnic, phone, subject, qualification, joining_date, salary_type, base_salary, hourly_rate, status, req.params.id);
    res.json({ success: true });
});

router.delete('/teachers/:id', requireRole('admin'), (req, res) => {
    db.prepare("UPDATE users SET status='inactive' WHERE id=? AND role='teacher'").run(req.params.id);
    res.json({ success: true });
});

// ─── STUDENTS ────────────────────────────────────────────────────────────────

router.get('/students', requireRole('admin', 'teacher'), (req, res) => {
    const { class_name, section } = req.query;
    let q = "SELECT id,login_id,full_name,phone,roll_no,class_name,section,parent_name,parent_phone,status,photo,is_face_enrolled FROM users WHERE role='student'";
    const params = [];
    if (class_name) { q += ' AND class_name=?'; params.push(class_name); }
    if (section) { q += ' AND section=?'; params.push(section); }
    q += ' ORDER BY class_name, roll_no';
    res.json(db.prepare(q).all(...params));
});

router.post('/students', requireRole('admin'), (req, res) => {
    const { full_name, cnic, phone, roll_no, class_name, section, parent_name, parent_phone, medical_notes } = req.body;
    if (!full_name || !class_name) return res.status(400).json({ error: 'Name and class required' });
    const login_id = generateLoginId('student');
    const temp = generateTempPassword();
    const hash = bcrypt.hashSync(temp, 10);
    const result = db.prepare(`
    INSERT INTO users (login_id,full_name,cnic,phone,role,password,temp_password,roll_no,class_name,section,parent_name,parent_phone,medical_notes)
    VALUES (?,?,?,?,'student',?,1,?,?,?,?,?,?)
  `).run(login_id, full_name, cnic, phone, hash, roll_no, class_name, section, parent_name, parent_phone, medical_notes);
    res.json({ id: result.lastInsertRowid, login_id, temp_password: temp, full_name });
});

router.put('/students/:id', requireRole('admin'), (req, res) => {
    const { full_name, cnic, phone, roll_no, class_name, section, parent_name, parent_phone, medical_notes, status } = req.body;
    db.prepare("UPDATE users SET full_name=?,cnic=?,phone=?,roll_no=?,class_name=?,section=?,parent_name=?,parent_phone=?,medical_notes=?,status=? WHERE id=? AND role='student'")
        .run(full_name, cnic, phone, roll_no, class_name, section, parent_name, parent_phone, medical_notes, status, req.params.id);
    res.json({ success: true });
});

// ─── WORKERS ────────────────────────────────────────────────────────────────

router.get('/workers', requireRole('admin'), (req, res) => {
    res.json(db.prepare("SELECT id,login_id,full_name,phone,cnic,designation,shift_start,shift_end,hourly_rate,status,photo,is_face_enrolled FROM users WHERE role='worker' ORDER BY full_name").all());
});

router.post('/workers', requireRole('admin'), (req, res) => {
    const { full_name, cnic, phone, designation, shift_start, shift_end, hourly_rate } = req.body;
    if (!full_name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    const login_id = generateLoginId('worker');
    const temp = generateTempPassword();
    const hash = bcrypt.hashSync(temp, 10);
    const result = db.prepare(`
    INSERT INTO users (login_id,full_name,cnic,phone,role,password,temp_password,designation,shift_start,shift_end,hourly_rate,salary_type)
    VALUES (?,?,?,?,'worker',?,1,?,?,?,?,'hourly')
  `).run(login_id, full_name, cnic, phone, hash, designation, shift_start, shift_end, hourly_rate);
    res.json({ id: result.lastInsertRowid, login_id, temp_password: temp, full_name });
});

router.put('/workers/:id', requireRole('admin'), (req, res) => {
    const { full_name, cnic, phone, designation, shift_start, shift_end, hourly_rate, status } = req.body;
    db.prepare("UPDATE users SET full_name=?,cnic=?,phone=?,designation=?,shift_start=?,shift_end=?,hourly_rate=?,status=? WHERE id=? AND role='worker'")
        .run(full_name, cnic, phone, designation, shift_start, shift_end, hourly_rate, status, req.params.id);
    res.json({ success: true });
});

module.exports = router;
