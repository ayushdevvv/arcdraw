import { env } from "../config/env.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));

async function sendMail({ to, name, subject, text, html }) {
  if (!env.EMAIL_ENABLED || !env.BREVO_API_KEY) return false;

  let response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": env.BREVO_API_KEY,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sender: { name: env.MAIL_FROM_NAME, email: env.MAIL_FROM_EMAIL },
        to: [{ email: to, ...(name ? { name } : {}) }],
        subject,
        htmlContent: html,
        textContent: text,
        tags: ["arcdraw-auth"]
      }),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    const message = error?.name === "TimeoutError" ? "Brevo email request timed out" : "Brevo email service could not be reached";
    throw new Error(message);
  }

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("Brevo transactional email failed:", response.status, details.slice(0, 600));
    throw new Error(`Brevo rejected the email request (${response.status})`);
  }
  const result = await response.json().catch(() => ({}));
  return Boolean(result.messageId);
}

export async function sendVerificationOtpEmail(user, otp, expiresInMinutes) {
  const name = escapeHtml(user.name);
  const sent = await sendMail({
    to: user.email,
    name: user.name,
    subject: "Your ArcDraw verification code",
    text: `Hi ${user.name},\n\nYour ArcDraw verification code is ${otp}. It expires in ${expiresInMinutes} minutes. If you did not create this account, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#171717;padding:24px"><div style="font-size:12px;letter-spacing:3px;font-weight:700;color:#666">ARCDRAW</div><h2 style="font-size:22px;margin:24px 0 8px">Verify your email</h2><p>Hi ${name}, use this code to verify your ArcDraw account:</p><div style="padding:20px 22px;background:#f3f3f0;border:1px solid #e5e5e2;border-radius:14px;text-align:center;font-size:32px;font-weight:750;letter-spacing:9px">${otp}</div><p style="color:#666;font-size:13px;line-height:1.6">This code expires in ${expiresInMinutes} minutes and can only be used once.</p><p style="color:#888;font-size:12px">If you did not create this account, you can ignore this email.</p></div>`
  });
  return { sent };
}

export async function sendPasswordResetOtpEmail(user, otp, expiresInMinutes) {
  const name = escapeHtml(user.name);
  const sent = await sendMail({
    to: user.email,
    name: user.name,
    subject: "Your ArcDraw password reset code",
    text: `Hi ${user.name},\n\nYour ArcDraw password reset code is ${otp}. It expires in ${expiresInMinutes} minutes. If you did not request this, ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#171717;padding:24px"><div style="font-size:12px;letter-spacing:3px;font-weight:700;color:#666">ARCDRAW</div><h2 style="font-size:22px;margin:24px 0 8px">Reset your password</h2><p>Hi ${name}, use this one-time code to reset your ArcDraw password:</p><div style="padding:20px 22px;background:#f3f3f0;border:1px solid #e5e5e2;border-radius:14px;text-align:center;font-size:32px;font-weight:750;letter-spacing:9px">${otp}</div><p style="color:#666;font-size:13px;line-height:1.6">This code expires in ${expiresInMinutes} minutes and can only be used once.</p><p style="color:#888;font-size:12px">If you did not request this, secure your account and ignore this email.</p></div>`
  });
  return { sent };
}
