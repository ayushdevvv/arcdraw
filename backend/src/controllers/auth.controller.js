import { env } from "../config/env.js";
import { AUTH_COOKIE_NAMES, OAUTH_COOKIE_MAX_AGE_MS } from "../constants/auth.constants.js";
import * as authService from "../services/auth.service.js";
import { createGoogleAuthorization, resolveGoogleUser } from "../services/google-oauth.service.js";
import { createGitHubAuthorization, resolveGitHubUser } from "../services/github-oauth.service.js";
import {
  clearAuthCookies,
  clearGoogleOAuthCookies,
  clearGitHubOAuthCookies,
  getGoogleOAuthCookies,
  getGitHubOAuthCookies,
  setAuthCookies,
} from "../utils/cookies.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { safeStringEqual } from "../utils/crypto.js";
import { createSocketToken } from "../services/token.service.js";
import { ApiError } from "../utils/ApiError.js";
import { sendLoginNotificationEmail } from "../services/mail.service.js";
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailOtpSchema
} from "../validators/auth.validator.js";

const sessionMetadata = (req) => ({
  userAgent: req.get("user-agent"),
  ipAddress: req.ip
});

async function sendLoginNotice(user, provider) {
  try {
    const result = await sendLoginNotificationEmail(user, { provider });
    if (!result.sent) console.warn(`[auth:email] Login notice was not sent for ${provider}; configure Brevo to enable auth emails.`);
  } catch (error) {
    // A mail provider outage must never turn a valid sign-in into a failed sign-in.
    console.error(`[auth:email] Could not send ${provider} login notice:`, error?.message || error);
  }
}

const authFailureUrl = (provider) => `${env.CLIENT_URL}/?authError=${encodeURIComponent(provider)}`;

const sendSession = (res, session, statusCode = 200) => {
  setAuthCookies(res, session);
  return res.status(statusCode).json({
    success: true,
    message: "Signed in successfully",
    user: session.user
  });
};

export const register = asyncHandler(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const result = await authService.registerWithPassword(input);
  return res.status(201).json({
    success: true,
    message: "Account created. Enter the one-time code sent to your email.",
    user: result.user,
    verificationRequired: true,
    expiresInMinutes: result.expiresInMinutes,
    ...(result.developmentOtp ? { developmentOtp: result.developmentOtp } : {})
  });
});

export const verifyEmailOtp = asyncHandler(async (req, res) => {
  const input = verifyEmailOtpSchema.parse(req.body);
  const { user, session } = await authService.verifyEmailOtp(input, sessionMetadata(req));
  if (session) {
    void sendLoginNotice(session.user, "email verification");
    setAuthCookies(res, session);
    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
      user,
      signedIn: true
    });
  }
  return res.status(200).json({
    success: true,
    message: "Email already verified. You can sign in.",
    user,
    signedIn: false
  });
});

export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = emailOnlySchema.parse(req.body);
  const result = await authService.resendVerification(email);
  return res.status(200).json({
    success: true,
    message: "If an unverified account exists for that email, a new code has been sent.",
    ...(result.expiresInMinutes ? { expiresInMinutes: result.expiresInMinutes } : {}),
    ...(result.developmentOtp ? { developmentOtp: result.developmentOtp } : {})
  });
});

export const login = asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const session = await authService.loginWithPassword(input, sessionMetadata(req));
  void sendLoginNotice(session.user, "email");
  return sendSession(res, session);
});

export const logout = asyncHandler(async (req, res) => {
  await authService.revokeRefreshSession(req.cookies?.[AUTH_COOKIE_NAMES.refresh]);
  clearAuthCookies(res);
  return res.status(200).json({ success: true, message: "Signed out successfully" });
});

export const refresh = asyncHandler(async (req, res) => {
  const session = await authService.rotateRefreshSession(req.cookies?.[AUTH_COOKIE_NAMES.refresh], sessionMetadata(req));
  return sendSession(res, session);
});

export const me = asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.auth.userId);
  return res.status(200).json({ success: true, user });
});

export const createSocketTicket = asyncHandler(async (req, res) => {
  const socketToken = createSocketToken(req.auth.userId, req.auth.sessionId);
  return res.status(200).json({ success: true, socketToken, expiresInSeconds: 86400 });
});

export const logoutAll = asyncHandler(async (req, res) => {
  await authService.revokeAllSessions(req.auth.userId);
  clearAuthCookies(res);
  return res.status(200).json({ success: true, message: "All sessions have been signed out" });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = emailOnlySchema.parse(req.body);
  const result = await authService.requestPasswordReset(email);
  return res.status(200).json({
    success: true,
    message: "If an account exists for that email, a password reset code has been sent.",
    ...(result.expiresInMinutes ? { expiresInMinutes: result.expiresInMinutes } : {}),
    ...(result.developmentOtp ? { developmentOtp: result.developmentOtp } : {})
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const input = resetPasswordSchema.parse(req.body);
  await authService.resetPasswordWithOtp(input);
  clearAuthCookies(res);
  return res.status(200).json({ success: true, message: "Password updated. Please sign in again." });
});

export const googleStart = asyncHandler(async (req, res) => {
  try {
    const authorization = await createGoogleAuthorization();
    // Store each attempt in its own short-lived HTTP-only cookie. This avoids a
    // MongoDB write/read race and allows multiple provider tabs to stay isolated.
    setGoogleOAuthCookies(res, authorization, OAUTH_COOKIE_MAX_AGE_MS);
    return res.redirect(302, authorization.url);
  } catch (error) {
    console.warn("[auth:oauth] Google authorization could not start:", error?.code || error?.message || error);
    return res.redirect(302, authFailureUrl("google"));
  }
});

export async function googleCallback(req, res) {
  const state = typeof req.query?.state === "string" ? req.query.state : "";
  const attempt = getGoogleOAuthCookies(req);
  // Consume the browser-side attempt before exchanging the code. A replay or
  // second callback cannot reuse the same state/verifier pair.
  clearGoogleOAuthCookies(res, state);

  try {
    if (req.query?.error) {
      return res.redirect(302, authFailureUrl("google"));
    }
    const code = req.query?.code;
    if (!attempt || !safeStringEqual(state, attempt.state) || !attempt.nonce || !attempt.codeVerifier || typeof code !== "string") {
      throw new ApiError(400, "Google sign-in state validation failed", "GOOGLE_STATE_INVALID");
    }

    const user = await resolveGoogleUser(code, attempt.nonce, attempt.codeVerifier);
    const session = await authService.createSessionForUser(user, sessionMetadata(req));
    void sendLoginNotice(session.user, "Google");
    setAuthCookies(res, session);
    return res.redirect(302, `${env.CLIENT_URL}/?signedIn=google`);
  } catch (error) {
    console.warn("[auth:oauth] Google callback did not complete:", error?.code || error?.message || error);
    return res.redirect(302, authFailureUrl("google"));
  }
}

export const githubStart = asyncHandler(async (req, res) => {
  try {
    const authorization = createGitHubAuthorization();
    setGitHubOAuthCookies(res, authorization, OAUTH_COOKIE_MAX_AGE_MS);
    return res.redirect(302, authorization.url);
  } catch (error) {
    console.warn("[auth:oauth] GitHub authorization could not start:", error?.code || error?.message || error);
    return res.redirect(302, authFailureUrl("github"));
  }
});

export async function githubCallback(req, res) {
  const state = typeof req.query?.state === "string" ? req.query.state : "";
  const attempt = getGitHubOAuthCookies(req);
  clearGitHubOAuthCookies(res, state);

  try {
    if (req.query?.error) {
      return res.redirect(302, authFailureUrl("github"));
    }
    const code = req.query?.code;
    if (!attempt || !safeStringEqual(state, attempt.state) || !attempt.codeVerifier || typeof code !== "string") {
      throw new ApiError(400, "GitHub sign-in state validation failed", "GITHUB_STATE_INVALID");
    }

    const user = await resolveGitHubUser(code, attempt.codeVerifier);
    const session = await authService.createSessionForUser(user, sessionMetadata(req));
    void sendLoginNotice(session.user, "GitHub");
    setAuthCookies(res, session);
    return res.redirect(302, `${env.CLIENT_URL}/?signedIn=github`);
  } catch (error) {
    console.warn("[auth:oauth] GitHub callback did not complete:", error?.code || error?.message || error);
    return res.redirect(302, authFailureUrl("github"));
  }
}
