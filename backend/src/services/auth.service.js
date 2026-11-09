import bcrypt from "bcryptjs";
import User from "../models/User.model.js";
import RefreshSession from "../models/RefreshSession.model.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { hashToken } from "../utils/crypto.js";
import { createOtp, hashOtp, verifyOtpHash, OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_SECONDS } from "../utils/otp.js";
import { toPublicUser } from "../utils/user.dto.js";
import { createAccessToken, createRefreshToken } from "./token.service.js";
import { sendPasswordResetOtpEmail, sendVerificationOtpEmail } from "./mail.service.js";

const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = OTP_RESEND_COOLDOWN_SECONDS * 1000;

function getSessionMetadata(metadata = {}) {
  return {
    userAgent: metadata.userAgent?.slice(0, 500) || null,
    ipAddress: metadata.ipAddress?.slice(0, 100) || null
  };
}

async function createSession(user, metadata) {
  const { token: refreshToken, tokenHash } = createRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

  await RefreshSession.create({
    user: user._id,
    tokenHash,
    expiresAt,
    ...getSessionMetadata(metadata)
  });

  return {
    user: toPublicUser(user),
    accessToken: createAccessToken(user._id),
    refreshToken
  };
}

function developmentOtp(otp) {
  return env.NODE_ENV === "development" ? otp : undefined;
}

function assertEmailDeliveryConfigured() {
  if (env.NODE_ENV === "production" && !env.EMAIL_ENABLED) {
    throw new ApiError(503, "Email delivery is not configured", "EMAIL_DELIVERY_NOT_CONFIGURED");
  }
}

function getResendWait(sentAt) {
  if (!sentAt) return 0;
  return Math.max(0, OTP_RESEND_COOLDOWN_MS - (Date.now() - sentAt.getTime()));
}

async function deliverVerificationOtp(user, { allowResend = false } = {}) {
  assertEmailDeliveryConfigured();
  const waitMs = getResendWait(user.emailVerificationOtpSentAt);
  if (allowResend && waitMs > 0) {
    // Keep the response indistinguishable from an unknown/already-verified email.
    return { throttled: true };
  }

  const otp = createOtp();
  user.emailVerificationOtpHash = hashOtp(user.email, "email-verification", otp);
  user.emailVerificationOtpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  user.emailVerificationOtpSentAt = new Date();
  user.emailVerificationOtpAttempts = 0;
  await user.save();

  try {
    const delivery = await sendVerificationOtpEmail(user, otp, OTP_TTL_MINUTES);
    return {
      verificationRequired: true,
      expiresInMinutes: OTP_TTL_MINUTES,
      ...(delivery.sent ? {} : { developmentOtp: developmentOtp(otp) })
    };
  } catch {
    user.emailVerificationOtpHash = undefined;
    user.emailVerificationOtpExpiresAt = undefined;
    user.emailVerificationOtpSentAt = undefined;
    user.emailVerificationOtpAttempts = 0;
    await user.save();
    throw new ApiError(502, "Could not send verification code. Please try again.", "VERIFICATION_EMAIL_FAILED");
  }
}

function assertOtpCanBeUsed(user, { hashField, expiresField, attemptsField, email, purpose, otp, label }) {
  const expiresAt = user[expiresField];
  if (!user[hashField] || !expiresAt || expiresAt <= new Date()) {
    throw new ApiError(400, `The ${label} code is invalid or expired`, "OTP_INVALID_OR_EXPIRED");
  }

  if ((user[attemptsField] || 0) >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(429, `Too many incorrect ${label} codes. Request a new code.`, "OTP_ATTEMPTS_EXCEEDED");
  }

  return verifyOtpHash(user[hashField], hashOtp(email, purpose, otp));
}

export async function registerWithPassword({ name, email, password }) {
  assertEmailDeliveryConfigured();

  const normalizedEmail = email.toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new ApiError(409, "An account with this email already exists", "EMAIL_ALREADY_REGISTERED");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email: normalizedEmail,
    passwordHash,
    passwordEnabled: true,
    isEmailVerified: false
  });

  try {
    const verification = await deliverVerificationOtp(user);
    return { user: toPublicUser(user), ...verification };
  } catch (error) {
    await User.deleteOne({ _id: user._id });
    throw error;
  }
}

export async function verifyEmailOtp({ email, otp }) {
  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+emailVerificationOtpHash +emailVerificationOtpExpiresAt +emailVerificationOtpAttempts"
  );

  if (!user) throw new ApiError(400, "The verification code is invalid or expired", "OTP_INVALID_OR_EXPIRED");
  if (user.isEmailVerified) return toPublicUser(user);

  const valid = assertOtpCanBeUsed(user, {
    hashField: "emailVerificationOtpHash",
    expiresField: "emailVerificationOtpExpiresAt",
    attemptsField: "emailVerificationOtpAttempts",
    email: normalizedEmail,
    purpose: "email-verification",
    otp,
    label: "verification"
  });

  if (!valid) {
    user.emailVerificationOtpAttempts = (user.emailVerificationOtpAttempts || 0) + 1;
    await user.save();
    throw new ApiError(400, "The verification code is incorrect", "OTP_INCORRECT");
  }

  user.isEmailVerified = true;
  user.emailVerificationOtpHash = undefined;
  user.emailVerificationOtpExpiresAt = undefined;
  user.emailVerificationOtpSentAt = undefined;
  user.emailVerificationOtpAttempts = 0;
  await user.save();
  return toPublicUser(user);
}

export async function resendVerification(email) {
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+emailVerificationOtpHash +emailVerificationOtpExpiresAt +emailVerificationOtpSentAt +emailVerificationOtpAttempts"
  );
  if (!user || user.isEmailVerified || !user.passwordEnabled) return {};

  const result = await deliverVerificationOtp(user, { allowResend: true });
  return {
    ...result,
    developmentOtp: developmentOtp(result.developmentOtp)
  };
}

export async function loginWithPassword({ email, password }, metadata) {
  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  if (!user || !user.passwordHash) {
    throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new ApiError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  if (!user.isEmailVerified) {
    throw new ApiError(403, "Verify your email with the OTP sent to your inbox before signing in", "EMAIL_NOT_VERIFIED");
  }

  user.lastLoginAt = new Date();
  await user.save();
  return createSession(user, metadata);
}

export async function createSessionForUser(user, metadata) {
  return createSession(user, metadata);
}

export async function rotateRefreshSession(rawRefreshToken, metadata) {
  if (!rawRefreshToken) {
    throw new ApiError(401, "Refresh session is missing", "REFRESH_TOKEN_MISSING");
  }

  const tokenHash = hashToken(rawRefreshToken);
  const oldSession = await RefreshSession.findOne({ tokenHash }).select("+tokenHash");
  if (!oldSession) {
    throw new ApiError(401, "Refresh session is invalid or expired", "REFRESH_TOKEN_INVALID");
  }

  if (oldSession.revokedAt) {
    await RefreshSession.updateMany(
      { user: oldSession.user, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    throw new ApiError(401, "Refresh token reuse detected. Please sign in again.", "REFRESH_TOKEN_REUSE");
  }

  if (oldSession.expiresAt <= new Date()) {
    oldSession.revokedAt = new Date();
    await oldSession.save();
    throw new ApiError(401, "Refresh session has expired", "REFRESH_TOKEN_EXPIRED");
  }

  const user = await User.findById(oldSession.user);
  if (!user) {
    oldSession.revokedAt = new Date();
    await oldSession.save();
    throw new ApiError(401, "Account no longer exists", "USER_NOT_FOUND");
  }

  const next = createRefreshToken();
  const now = new Date();
  const claimed = await RefreshSession.findOneAndUpdate(
    { _id: oldSession._id, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now, replacedByTokenHash: next.tokenHash } },
    { new: true }
  );

  if (!claimed) {
    await RefreshSession.updateMany(
      { user: user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    throw new ApiError(401, "Refresh session was already used. Please sign in again.", "REFRESH_TOKEN_REUSE");
  }

  await RefreshSession.create({
    user: user._id,
    tokenHash: next.tokenHash,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    ...getSessionMetadata(metadata)
  });

  return {
    user: toPublicUser(user),
    accessToken: createAccessToken(user._id),
    refreshToken: next.token
  };
}

export async function revokeRefreshSession(rawRefreshToken) {
  if (!rawRefreshToken) return;
  await RefreshSession.updateOne(
    { tokenHash: hashToken(rawRefreshToken), revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

export async function revokeAllSessions(userId) {
  await RefreshSession.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

export async function getUserById(userId) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "Account not found", "USER_NOT_FOUND");
  return toPublicUser(user);
}

export async function requestPasswordReset(email) {
  assertEmailDeliveryConfigured();
  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+passwordHash +passwordResetOtpHash +passwordResetOtpExpiresAt +passwordResetOtpSentAt +passwordResetOtpAttempts"
  );
  if (!user || !user.passwordEnabled || !user.passwordHash) return {};

  const waitMs = getResendWait(user.passwordResetOtpSentAt);
  if (waitMs > 0) {
    // Keep the public response generic while preventing repeated email delivery.
    return { throttled: true };
  }

  const otp = createOtp();
  user.passwordResetOtpHash = hashOtp(normalizedEmail, "password-reset", otp);
  user.passwordResetOtpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  user.passwordResetOtpSentAt = new Date();
  user.passwordResetOtpAttempts = 0;
  await user.save();

  try {
    const delivery = await sendPasswordResetOtpEmail(user, otp, OTP_TTL_MINUTES);
    return {
      expiresInMinutes: OTP_TTL_MINUTES,
      ...(delivery.sent ? {} : { developmentOtp: developmentOtp(otp) })
    };
  } catch {
    user.passwordResetOtpHash = undefined;
    user.passwordResetOtpExpiresAt = undefined;
    user.passwordResetOtpSentAt = undefined;
    user.passwordResetOtpAttempts = 0;
    await user.save();
    throw new ApiError(502, "Could not send password reset code. Please try again.", "PASSWORD_RESET_EMAIL_FAILED");
  }
}

export async function resetPasswordWithOtp({ email, otp, password }) {
  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+passwordHash +passwordResetOtpHash +passwordResetOtpExpiresAt +passwordResetOtpAttempts"
  );

  if (!user || !user.passwordEnabled || !user.passwordResetOtpHash) {
    throw new ApiError(400, "The password reset code is invalid or expired", "OTP_INVALID_OR_EXPIRED");
  }

  const valid = assertOtpCanBeUsed(user, {
    hashField: "passwordResetOtpHash",
    expiresField: "passwordResetOtpExpiresAt",
    attemptsField: "passwordResetOtpAttempts",
    email: normalizedEmail,
    purpose: "password-reset",
    otp,
    label: "password reset"
  });

  if (!valid) {
    user.passwordResetOtpAttempts = (user.passwordResetOtpAttempts || 0) + 1;
    await user.save();
    throw new ApiError(400, "The password reset code is incorrect", "OTP_INCORRECT");
  }

  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordEnabled = true;
  user.passwordResetOtpHash = undefined;
  user.passwordResetOtpExpiresAt = undefined;
  user.passwordResetOtpSentAt = undefined;
  user.passwordResetOtpAttempts = 0;
  await user.save();
  await revokeAllSessions(user._id);
}
