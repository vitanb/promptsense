const nodemailer = require('nodemailer');
const logger = require('./logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const FROM = process.env.EMAIL_FROM || 'noreply@promptsense.io';
const BASE = process.env.FRONTEND_URL || 'http://localhost:3000';

async function sendEmail({ to, subject, html }) {
  // Skip sending if SMTP is not configured (logs a warning instead of crashing)
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn('📧 Email not sent — SMTP not configured', { to, subject });
    return;
  }
  if (process.env.NODE_ENV === 'development') {
    logger.info('📧 Email (dev mode — not sent)', { to, subject });
    return;
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
  } catch (err) {
    // Log but never crash the caller — email failure shouldn't block registration/login
    logger.error('📧 Email send failed', { to, subject, error: err.message });
  }
}

async function sendVerificationEmail(user, token) {
  const url = `${BASE}/auth/verify-email?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Verify your PromptSense email',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
        <h2 style="margin-bottom:8px">Welcome to PromptSense</h2>
        <p style="color:#666">Verify your email address to get started.</p>
        <a href="${url}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#7F77DD;color:#fff;border-radius:8px;text-decoration:none;font-weight:500">Verify email</a>
        <p style="margin-top:24px;font-size:12px;color:#999">Or copy this link: ${url}</p>
        <p style="font-size:12px;color:#999">This link expires in 24 hours.</p>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(user, token) {
  const url = `${BASE}/auth/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your PromptSense password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
        <h2 style="margin-bottom:8px">Reset your password</h2>
        <p style="color:#666">Click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${url}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#7F77DD;color:#fff;border-radius:8px;text-decoration:none;font-weight:500">Reset password</a>
        <p style="margin-top:24px;font-size:12px;color:#999">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

async function sendInviteEmail(invitee, org, inviter, token) {
  const url = `${BASE}/auth/accept-invite?token=${token}`;
  await sendEmail({
    to: invitee.email,
    subject: `You've been invited to ${org.name} on PromptSense`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
        <h2>${inviter.full_name} invited you to ${org.name}</h2>
        <p style="color:#666">Join your team on PromptSense to manage LLM guardrails and analytics.</p>
        <a href="${url}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#7F77DD;color:#fff;border-radius:8px;text-decoration:none;font-weight:500">Accept invitation</a>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendInviteEmail };
