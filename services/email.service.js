/**
 * ─────────────────────────────────────────────────────────
 *  Academy Management System — Email Service
 *  Primary  : Nodemailer + Gmail
 *  Fallback : Resend  (switch EMAIL_PROVIDER=resend in .env)
 * ─────────────────────────────────────────────────────────
 */

const nodemailer = require('nodemailer');

// ─── Determine active provider ────────────────────────────────────────────────
const PROVIDER = (process.env.EMAIL_PROVIDER || 'gmail').toLowerCase();

// ─── Gmail Transporter (Nodemailer) ──────────────────────────────────────────
let gmailTransporter = null;
function getGmailTransporter() {
  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,      // e.g. academy@gmail.com
        pass: process.env.GMAIL_APP_PASS,  // Gmail App Password (not your login password)
      },
    });
  }
  return gmailTransporter;
}

// ─── Resend Client ────────────────────────────────────────────────────────────
let resendClient = null;
function getResendClient() {
  if (!resendClient) {
    const { Resend } = require('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// ─── Core Send Function ───────────────────────────────────────────────────────
/**
 * Send an email using the configured provider.
 * @param {Object} options
 * @param {string|string[]} options.to       - Recipient(s)
 * @param {string}          options.subject  - Email subject
 * @param {string}          options.html     - HTML body
 * @param {string}          [options.text]   - Plain text fallback
 * @param {string}          [options.from]   - Override sender (optional)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail({ to, subject, html, text, from }) {
  const fromAddress = from
    || process.env.EMAIL_FROM
    || `${process.env.ACADEMY_NAME || 'Academy'} <noreply@academy.com>`;

  try {
    if (PROVIDER === 'resend') {
      return await sendViaResend({ to, subject, html, text, from: fromAddress });
    } else {
      return await sendViaGmail({ to, subject, html, text, from: fromAddress });
    }
  } catch (err) {
    console.error(`[EmailService] Primary provider (${PROVIDER}) failed:`, err.message);

    // ── Auto-fallback ─────────────────────────────────────────────────────────
    try {
      console.log('[EmailService] Attempting fallback provider...');
      if (PROVIDER === 'resend') {
        return await sendViaGmail({ to, subject, html, text, from: fromAddress });
      } else {
        return await sendViaResend({ to, subject, html, text, from: fromAddress });
      }
    } catch (fallbackErr) {
      console.error('[EmailService] Fallback also failed:', fallbackErr.message);
      return { success: false, error: fallbackErr.message };
    }
  }
}

// ─── Gmail Implementation ─────────────────────────────────────────────────────
async function sendViaGmail({ to, subject, html, text, from }) {
  const transporter = getGmailTransporter();
  const info = await transporter.sendMail({
    from,
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
    text: text || stripHtml(html),
  });
  console.log(`[EmailService] Gmail sent: ${info.messageId}`);
  return { success: true, messageId: info.messageId, provider: 'gmail' };
}

// ─── Resend Implementation ────────────────────────────────────────────────────
async function sendViaResend({ to, subject, html, text, from }) {
  const resend = getResendClient();
  const { data, error } = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text: text || stripHtml(html),
  });
  if (error) throw new Error(error.message);
  console.log(`[EmailService] Resend sent: ${data.id}`);
  return { success: true, messageId: data.id, provider: 'resend' };
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ─── Pre-built Email Templates ────────────────────────────────────────────────

/**
 * Send a welcome / account creation email
 */
async function sendWelcomeEmail({ to, name, loginId, tempPassword }) {
  const academyName = process.env.ACADEMY_NAME || 'Academy';
  return sendEmail({
    to,
    subject: `Welcome to ${academyName} — Your Account Details`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
        <h2 style="color:#4f46e5;">Welcome to ${academyName}! 🎓</h2>
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your account has been created. Here are your login details:</p>
        <div style="background:#f5f5f5;padding:16px;border-radius:6px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Login ID:</strong> ${loginId}</p>
          <p style="margin:4px 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>
        </div>
        <p style="color:#e53e3e;"><strong>⚠ Please change your password on first login.</strong></p>
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;" />
        <p style="color:#888;font-size:12px;">${academyName} — Powered by ClickTake Technologies</p>
      </div>
    `,
  });
}

/**
 * Send a password reset email with OTP
 */
async function sendPasswordResetEmail({ to, name, otp }) {
  const academyName = process.env.ACADEMY_NAME || 'Academy';
  return sendEmail({
    to,
    subject: `${academyName} — Password Reset OTP`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
        <h2 style="color:#4f46e5;">Password Reset Request 🔐</h2>
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your OTP for password reset is:</p>
        <div style="background:#4f46e5;color:#fff;padding:20px;border-radius:8px;text-align:center;font-size:32px;letter-spacing:8px;margin:16px 0;">
          <strong>${otp}</strong>
        </div>
        <p>This OTP expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;" />
        <p style="color:#888;font-size:12px;">${academyName} — Powered by ClickTake Technologies</p>
      </div>
    `,
  });
}

/**
 * Send monthly salary slip email
 */
async function sendSalarySlipEmail({ to, name, month, salaryData }) {
  const academyName = process.env.ACADEMY_NAME || 'Academy';
  const { base_salary, days_present, days_absent, late_deduction = 0,
          leave_deduction = 0, advance_deduction = 0, overtime_bonus = 0, net_salary } = salaryData;

  return sendEmail({
    to,
    subject: `${academyName} — Salary Slip for ${month}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
        <h2 style="color:#4f46e5;">${academyName} — Salary Slip 💰</h2>
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your salary details for <strong>${month}</strong>:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr style="background:#f5f5f5;"><th style="padding:8px;text-align:left;border:1px solid #ddd;">Description</th><th style="padding:8px;text-align:right;border:1px solid #ddd;">Amount</th></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;">Base Salary</td><td style="padding:8px;text-align:right;border:1px solid #ddd;">PKR ${base_salary?.toLocaleString()}</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;">Days Present</td><td style="padding:8px;text-align:right;border:1px solid #ddd;">${days_present} days</td></tr>
          <tr><td style="padding:8px;border:1px solid #ddd;">Days Absent</td><td style="padding:8px;text-align:right;border:1px solid #ddd;">${days_absent} days</td></tr>
          <tr style="color:#e53e3e;"><td style="padding:8px;border:1px solid #ddd;">Late Deduction</td><td style="padding:8px;text-align:right;border:1px solid #ddd;">- PKR ${late_deduction?.toLocaleString()}</td></tr>
          <tr style="color:#e53e3e;"><td style="padding:8px;border:1px solid #ddd;">Leave Deduction</td><td style="padding:8px;text-align:right;border:1px solid #ddd;">- PKR ${leave_deduction?.toLocaleString()}</td></tr>
          <tr style="color:#e53e3e;"><td style="padding:8px;border:1px solid #ddd;">Advance Deduction</td><td style="padding:8px;text-align:right;border:1px solid #ddd;">- PKR ${advance_deduction?.toLocaleString()}</td></tr>
          <tr style="color:#22c55e;"><td style="padding:8px;border:1px solid #ddd;">Overtime Bonus</td><td style="padding:8px;text-align:right;border:1px solid #ddd;">+ PKR ${overtime_bonus?.toLocaleString()}</td></tr>
          <tr style="background:#4f46e5;color:#fff;font-weight:bold;"><td style="padding:10px;border:1px solid #4f46e5;">Net Salary</td><td style="padding:10px;text-align:right;border:1px solid #4f46e5;">PKR ${net_salary?.toLocaleString()}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;" />
        <p style="color:#888;font-size:12px;">${academyName} — Powered by ClickTake Technologies</p>
      </div>
    `,
  });
}

/**
 * Send leave request status email (approved/rejected)
 */
async function sendLeaveStatusEmail({ to, name, leaveType, startDate, endDate, status, adminComment }) {
  const academyName = process.env.ACADEMY_NAME || 'Academy';
  const isApproved = status === 'approved';
  const color = isApproved ? '#22c55e' : '#e53e3e';
  const emoji = isApproved ? '✅' : '❌';

  return sendEmail({
    to,
    subject: `${academyName} — Leave Request ${isApproved ? 'Approved' : 'Rejected'}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #e0e0e0;border-radius:8px;">
        <h2 style="color:${color};">${emoji} Leave Request ${status.charAt(0).toUpperCase() + status.slice(1)}</h2>
        <p>Hello <strong>${name}</strong>,</p>
        <p>Your <strong>${leaveType}</strong> leave request from <strong>${startDate}</strong> to <strong>${endDate}</strong> has been <strong style="color:${color};">${status}</strong>.</p>
        ${adminComment ? `<div style="background:#f5f5f5;padding:12px;border-radius:6px;margin:12px 0;"><strong>Admin Note:</strong> ${adminComment}</div>` : ''}
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0;" />
        <p style="color:#888;font-size:12px;">${academyName} — Powered by ClickTake Technologies</p>
      </div>
    `,
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendSalarySlipEmail,
  sendLeaveStatusEmail,
};
