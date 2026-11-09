import { env } from "../config/env.js";
import { getMailer } from "../config/mailer.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));

async function sendMail({ to, subject, text, html }) {
  const mailer = getMailer();
  if (!mailer) return false;

  await mailer.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
  return true;
}

export async function sendVerificationOtpEmail(user, otp, expiresInMinutes) {
  const name = escapeHtml(user.name);
  const sent = await sendMail({
    to: user.email,
    subject: "Your Arcdraw verification code",
    text: `Hi ${user.name},\n\nYour Arcdraw verification code is ${otp}. It expires in ${expiresInMinutes} minutes. If you did not create this account, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#171717"><p>Hi ${name},</p><p>Use this code to verify your Arcdraw account:</p><div style="padding:18px 22px;background:#f3f3f0;border-radius:12px;text-align:center;font-size:30px;font-weight:700;letter-spacing:8px">${otp}</div><p>This code expires in ${expiresInMinutes} minutes and can only be used once.</p><p>If you did not create this account, you can ignore this email.</p></div>`
  });
  return { sent };
}

export async function sendPasswordResetOtpEmail(user, otp, expiresInMinutes) {
  const name = escapeHtml(user.name);
  const sent = await sendMail({
    to: user.email,
    subject: "Your Arcdraw password reset code",
    text: `Hi ${user.name},\n\nYour Arcdraw password reset code is ${otp}. It expires in ${expiresInMinutes} minutes. If you did not request this, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#171717"><p>Hi ${name},</p><p>Use this one-time code to reset your Arcdraw password:</p><div style="padding:18px 22px;background:#f3f3f0;border-radius:12px;text-align:center;font-size:30px;font-weight:700;letter-spacing:8px">${otp}</div><p>This code expires in ${expiresInMinutes} minutes and can only be used once.</p><p>If you did not request this, secure your account and ignore this email.</p></div>`
  });
  return { sent };
}
