const router = require('express').Router();
const bcrypt = require('bcryptjs');
const supabase = require('../database/supabase');
const { authMiddleware, requireRole } = require('../middleware/auth');

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: process.env.CLOUDINARY_FOLDER || 'academy',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }]
    }
});

const upload = multer({ storage: storage });

router.use(authMiddleware);

router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: req.file.path });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function generateLoginId(role) {
    const prefix = { teacher: 'TCH', student: 'STU', worker: 'WRK', admin: 'ADM' }[role] || 'USR';
    const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', role);
    
    const nextNum = (count || 0) + 1;
    return `${prefix}-${String(nextNum).padStart(3, '0')}`;
}

function generateTempPassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── SELF PROFILE (All Users) ───────────────────────────────────────────────

router.get('/profile', async (req, res) => {
    const { data: user, error } = await supabase
        .from('users')
        .select('id, login_id, full_name, phone, role, photo, address, emergency_contact, preferred_language, is_face_enrolled')
        .eq('id', req.user.id)
        .single();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(user);
});

router.patch('/profile', async (req, res) => {
    const { full_name, phone, address, emergency_contact, preferred_language, photo, parent_name, parent_phone } = req.body;
    const { error } = await supabase
        .from('users')
        .update({
            full_name,
            phone,
            address,
            emergency_contact,
            preferred_language,
            photo,
            parent_name,
            parent_phone
        })
        .eq('id', req.user.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

router.post('/face-enroll', async (req, res) => {
    const { embedding } = req.body;
    if (!embedding || !Array.isArray(embedding)) return res.status(400).json({ error: 'Valid face embedding Array required' });

    const { error } = await supabase
        .from('users')
        .update({
            face_embedding: JSON.stringify(embedding),
            is_face_enrolled: 1
        })
        .eq('id', req.user.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

router.post('/face-enroll/:id', requireRole('admin'), async (req, res) => {
    const { embedding } = req.body;
    if (!embedding || !Array.isArray(embedding)) return res.status(400).json({ error: 'Valid face embedding Array required' });

    const { error } = await supabase
        .from('users')
        .update({
            face_embedding: JSON.stringify(embedding),
            is_face_enrolled: 1
        })
        .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

router.post('/reset-face/:id', requireRole('admin'), async (req, res) => {
    const { error } = await supabase
        .from('users')
        .update({
            face_embedding: null,
            is_face_enrolled: 0
        })
        .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// Generic Reset Password for any user (Admin only)
router.post('/:id/reset-password', requireRole('admin'), async (req, res) => {
    const temp = generateTempPassword();
    const hash = bcrypt.hashSync(temp, 10);
    
    const { data: user, error: userErr } = await supabase
        .from('users')
        .select('login_id, full_name')
        .eq('id', req.params.id)
        .single();
    
    if (userErr || !user) return res.status(404).json({ error: 'User not found' });
    
    await supabase
        .from('users')
        .update({ password: hash, temp_password: 1 })
        .eq('id', req.params.id);
    
    await supabase
        .from('audit_log')
        .insert({
            admin_id: req.user.id,
            action: 'RESET_PWD',
            target_table: 'users',
            target_id: req.params.id,
            details: `Reset password for ${user.full_name} (${user.login_id})`
        });
        
    res.json({ success: true, temp_password: temp, login_id: user.login_id });
});

// Generic Deactivate
router.delete('/:id', requireRole('admin'), async (req, res) => {
    const { error } = await supabase
        .from('users')
        .update({ status: 'inactive' })
        .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ─── TEACHERS ────────────────────────────────────────────────────────────────

router.get('/teachers', requireRole('admin'), async (req, res) => {
    const { data: teachers, error } = await supabase
        .from('users')
        .select('id,login_id,full_name,email,phone,cnic,address,emergency_contact,subject,qualification,joining_date,base_salary,salary_type,status,last_login,photo,is_face_enrolled')
        .eq('role', 'teacher')
        .order('full_name');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(teachers);
});

router.post('/teachers', requireRole('admin'), async (req, res) => {
    const { full_name, email, cnic, phone, address, emergency_contact, subject, qualification, joining_date, salary_type, base_salary, hourly_rate, photo } = req.body;
    if (!full_name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    
    const login_id = await generateLoginId('teacher');
    const temp = generateTempPassword();
    const hash = bcrypt.hashSync(temp, 10);
    
    const { data: newUser, error } = await supabase
        .from('users')
        .insert({
            login_id,
            full_name,
            email,
            cnic,
            phone,
            address,
            emergency_contact,
            role: 'teacher',
            password: hash,
            temp_password: 1,
            subject,
            qualification,
            joining_date,
            salary_type,
            base_salary,
            hourly_rate,
            photo
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });

    await supabase
        .from('audit_log')
        .insert({
            admin_id: req.user.id,
            action: 'CREATE',
            target_table: 'users',
            target_id: newUser.id,
            details: `Created teacher: ${full_name}`
        });

    res.json({ id: newUser.id, login_id, temp_password: temp, full_name });
});

router.put('/teachers/:id', requireRole('admin'), async (req, res) => {
    const { full_name, email, cnic, phone, address, emergency_contact, subject, qualification, joining_date, salary_type, base_salary, hourly_rate, status, photo } = req.body;
    const { error } = await supabase
        .from('users')
        .update({
            full_name,
            email,
            cnic,
            phone,
            address,
            emergency_contact,
            subject,
            qualification,
            joining_date,
            salary_type,
            base_salary,
            hourly_rate,
            status,
            photo
        })
        .eq('id', req.params.id)
        .eq('role', 'teacher');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

router.delete('/teachers/:id', requireRole('admin'), async (req, res) => {
    const { error } = await supabase
        .from('users')
        .update({ status: 'inactive' })
        .eq('id', req.params.id)
        .eq('role', 'teacher');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ─── STUDENTS ────────────────────────────────────────────────────────────────

router.get('/students', requireRole('admin', 'teacher'), async (req, res) => {
    const { class_name, section } = req.query;
    let query = supabase
        .from('users')
        .select('id,login_id,full_name,email,phone,address,emergency_contact,roll_no,class_name,section,parent_name,parent_phone,status,photo,is_face_enrolled')
        .eq('role', 'student');
    
    if (class_name) query = query.eq('class_name', class_name);
    if (section) query = query.eq('section', section);
    
    const { data: students, error } = await query.order('class_name').order('roll_no');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(students);
});

router.post('/students', requireRole('admin'), async (req, res) => {
    const { full_name, email, cnic, phone, address, emergency_contact, roll_no, class_name, section, parent_name, parent_phone, medical_notes, photo } = req.body;
    if (!full_name || !class_name) return res.status(400).json({ error: 'Name and class required' });
    
    const login_id = await generateLoginId('student');
    const temp = generateTempPassword();
    const hash = bcrypt.hashSync(temp, 10);
    
    const { data: newUser, error } = await supabase
        .from('users')
        .insert({
            login_id,
            full_name,
            email,
            cnic,
            phone,
            address,
            emergency_contact,
            role: 'student',
            password: hash,
            temp_password: 1,
            roll_no,
            class_name,
            section,
            parent_name,
            parent_phone,
            medical_notes,
            photo
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: newUser.id, login_id, temp_password: temp, full_name });
});

router.put('/students/:id', requireRole('admin'), async (req, res) => {
    const { full_name, email, cnic, phone, address, emergency_contact, roll_no, class_name, section, parent_name, parent_phone, medical_notes, status, photo } = req.body;
    const { error } = await supabase
        .from('users')
        .update({
            full_name,
            email,
            cnic,
            phone,
            address,
            emergency_contact,
            roll_no,
            class_name,
            section,
            parent_name,
            parent_phone,
            medical_notes,
            status,
            photo
        })
        .eq('id', req.params.id)
        .eq('role', 'student');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ─── WORKERS ────────────────────────────────────────────────────────────────

router.get('/workers', requireRole('admin'), async (req, res) => {
    const { data: workers, error } = await supabase
        .from('users')
        .select('id,login_id,full_name,email,phone,cnic,address,emergency_contact,designation,shift_start,shift_end,hourly_rate,status,photo,is_face_enrolled')
        .eq('role', 'worker')
        .order('full_name');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(workers);
});

router.post('/workers', requireRole('admin'), async (req, res) => {
    const { full_name, email, cnic, phone, address, emergency_contact, designation, shift_start, shift_end, hourly_rate, photo } = req.body;
    if (!full_name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    
    const login_id = await generateLoginId('worker');
    const temp = generateTempPassword();
    const hash = bcrypt.hashSync(temp, 10);
    
    const { data: newUser, error } = await supabase
        .from('users')
        .insert({
            login_id,
            full_name,
            email,
            cnic,
            phone,
            address,
            emergency_contact,
            role: 'worker',
            password: hash,
            temp_password: 1,
            designation,
            shift_start,
            shift_end,
            hourly_rate,
            salary_type: 'hourly',
            photo
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: newUser.id, login_id, temp_password: temp, full_name });
});

router.put('/workers/:id', requireRole('admin'), async (req, res) => {
    const { full_name, email, cnic, phone, address, emergency_contact, designation, shift_start, shift_end, hourly_rate, status, photo } = req.body;
    const { error } = await supabase
        .from('users')
        .update({
            full_name,
            email,
            cnic,
            phone,
            address,
            emergency_contact,
            designation,
            shift_start,
            shift_end,
            hourly_rate,
            status,
            photo
        })
        .eq('id', req.params.id)
        .eq('role', 'worker');
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

module.exports = router;
