const router = require('express').Router();
const supabase = require('../database/supabase');
const db = require('../database/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER || 'clicktaketechnologies@gmail.com',
        pass: process.env.GMAIL_APP_PASS || 'ehrp skdc wcht scyy'
    }
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

// POST /api/registrations (Public Submission)
router.post('/', async (req, res) => {
    try {
        const { student_details, parent_details, health_details, payment_method, gdpr_consent } = req.body;
        
        if (!student_details || !student_details.full_name) {
            return res.status(400).json({ error: 'Student full name is required' });
        }

        const stmt = db.prepare(`
            INSERT INTO pending_registrations (student_details, parent_details, health_details, payment_method, gdpr_consent, status)
            VALUES (?, ?, ?, ?, ?, 'PENDING')
        `);
        const info = stmt.run(
            JSON.stringify(student_details),
            JSON.stringify(parent_details),
            JSON.stringify(health_details),
            payment_method,
            gdpr_consent ? 1 : 0
        );

        // Send confirmation email
        if (parent_details.email) {
            try {
                await transporter.sendMail({
                    from: `"ClickTake Academy" <${process.env.GMAIL_USER}>`,
                    to: parent_details.email,
                    subject: 'Application Received - ClickTake Academy',
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                            <h2 style="color: #6C63FF; text-align: center;">Application Received!</h2>
                            <p>Dear ${parent_details.full_name},</p>
                            <p>Thank you for submitting an application for <strong>${student_details.full_name}</strong>.</p>
                            <p>Your application is currently <strong style="color: #F7B731;">PENDING</strong> review by our administration team. You will receive another email with login credentials once the application is approved.</p>
                            <br>
                            <p>Best Regards,</p>
                            <p><strong>ClickTake Academy Admissions</strong></p>
                        </div>
                    `
                });
            } catch (mailErr) {
                console.error('[EMAIL ERROR]', mailErr);
            }
        }
        
        console.log(`[REGISTRATION] New application received for ${student_details.full_name}`);
        
        res.status(201).json({ success: true, message: 'Application submitted successfully', id: info.lastInsertRowid });
    } catch (err) {
        console.error('[REGISTRATION ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/registrations (Admin List)
router.get('/', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { status } = req.query;
        let queryStr = "SELECT * FROM pending_registrations";
        const params = [];
        if (status) {
            queryStr += " WHERE status = ?";
            params.push(status);
        }
        queryStr += " ORDER BY created_at DESC";

        const rows = db.prepare(queryStr).all(...params);
        
        // Parse JSON fields
        const data = rows.map(r => ({
            ...r,
            student_details: JSON.parse(r.student_details),
            parent_details: JSON.parse(r.parent_details),
            health_details: JSON.parse(r.health_details),
            gdpr_consent: r.gdpr_consent === 1
        }));

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/registrations/:id/approve (Admin Approve)
router.put('/:id/approve', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { admin_notes, class_name, section } = req.body;
        
        // 1. Fetch pending registration
        const regRow = db.prepare("SELECT * FROM pending_registrations WHERE id = ?").get(req.params.id);
            
        if (!regRow) return res.status(404).json({ error: 'Registration not found' });
        if (regRow.status !== 'PENDING') return res.status(400).json({ error: `Registration is already ${regRow.status}` });

        const reg = {
            ...regRow,
            student_details: JSON.parse(regRow.student_details),
            parent_details: JSON.parse(regRow.parent_details),
            health_details: JSON.parse(regRow.health_details)
        };

        // 2. Generate Credentials
        const login_id = await generateLoginId('student');
        const temp = generateTempPassword();
        const hash = bcrypt.hashSync(temp, 10);
        
        // 3. Create Student User
        const { data: newUser, error: createErr } = await supabase
            .from('users')
            .insert({
                login_id,
                full_name: reg.student_details.full_name,
                email: reg.parent_details.email || null,
                phone: reg.parent_details.phone || null,
                address: reg.student_details.address || null,
                emergency_contact: reg.parent_details.emergency_contact || null,
                role: 'student',
                password: hash,
                temp_password: 1,
                class_name: class_name || reg.student_details.class_name,
                section: section || '',
                parent_name: reg.parent_details.full_name,
                parent_phone: reg.parent_details.phone,
                medical_notes: reg.health_details ? JSON.stringify(reg.health_details) : null
            })
            .select()
            .single();

        if (createErr) throw createErr;

        // 4. Update Registration Status
        db.prepare("UPDATE pending_registrations SET status = 'APPROVED', admin_notes = ?, updated_at = (strftime('%s','now')) WHERE id = ?")
          .run(admin_notes || null, req.params.id);

        // 5. Audit Log (Using db if audit log is there, or supabase. Supabase is fine since audit_log might be in supabase. Let's check.)
        // wait, earlier code used supabase for audit_log.
        await supabase
            .from('audit_log')
            .insert({
                admin_id: req.user.id,
                action: 'APPROVE_REGISTRATION',
                target_table: 'pending_registrations',
                target_id: req.params.id,
                details: `Approved application for ${reg.student_details.full_name}. Generated login ID: ${login_id}`
            });

        // Send approval email with credentials
        if (reg.parent_details.email) {
            try {
                await transporter.sendMail({
                    from: `"ClickTake Academy" <${process.env.GMAIL_USER}>`,
                    to: reg.parent_details.email,
                    subject: 'Application Approved - Welcome to ClickTake Academy!',
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                            <h2 style="color: #2ED573; text-align: center;">🎉 Application Approved!</h2>
                            <p>Dear ${reg.parent_details.full_name},</p>
                            <p>We are delighted to inform you that the application for <strong>${reg.student_details.full_name}</strong> has been approved!</p>
                            
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
                                <p style="margin: 0 0 10px 0;"><strong>Student Login Credentials:</strong></p>
                                <p style="margin: 0 0 5px 0;">Login ID: <strong style="color: #6C63FF;">${login_id}</strong></p>
                                <p style="margin: 0;">Temporary Password: <strong style="font-family: monospace; background: #e9ecef; padding: 2px 6px; border-radius: 4px;">${temp}</strong></p>
                            </div>
                            
                            <p>You can now log in to the student portal at: <a href="https://academy-management-system-40i1.onrender.com/login.html?role=student">https://academy-management-system-40i1.onrender.com/login.html</a></p>
                            <p><em>Please note: You will be required to change your password upon your first login.</em></p>
                            <br>
                            <p>Welcome aboard!</p>
                            <p><strong>ClickTake Academy Team</strong></p>
                        </div>
                    `
                });
            } catch (mailErr) {
                console.error('[EMAIL ERROR]', mailErr);
            }
        }

        console.log(`[APPROVAL] Application for ${reg.student_details.full_name} approved. Login: ${login_id}, Pass: ${temp}`);

        res.json({ success: true, login_id, temp_password: temp, student_id: newUser.id });
    } catch (err) {
        console.error('[APPROVE ERROR]', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/registrations/:id/reject (Admin Reject)
router.put('/:id/reject', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { reason } = req.body;
        
        db.prepare("UPDATE pending_registrations SET status = 'REJECTED', admin_notes = ?, updated_at = (strftime('%s','now')) WHERE id = ?")
          .run(reason, req.params.id);
        
        // Audit log
        await supabase
            .from('audit_log')
            .insert({
                admin_id: req.user.id,
                action: 'REJECT_REGISTRATION',
                target_table: 'pending_registrations',
                target_id: req.params.id,
                details: `Rejected application for registration ID ${req.params.id}. Reason: ${reason}`
            });

        // Normally send rejection email here
        res.json({ success: true, message: 'Application rejected' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
