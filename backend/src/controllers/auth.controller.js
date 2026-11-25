import { env } from "../config/env.js";
import { randomBytes } from "node:crypto";
import User from "../models/User.model.js";
import DesktopAuthCode from "../models/DesktopAuthCode.model.js";
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
  setGoogleOAuthCookies,
  setGitHubOAuthCookies
} from "../utils/cookies.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { safeStringEqual, hashToken } from "../utils/crypto.js";
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
const DESKTOP_AUTH_CODE_TTL_MS = 90 * 1000;
const DESKTOP_REDIRECT_PATH = "/oauth/callback";

function isDesktopClient(req) {
  return req.get("x-arcdraw-client") === "desktop";
}

function parseDesktopRedirect(value) {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port !== "43127" || url.pathname !== DESKTOP_REDIRECT_PATH) return null;
    if (url.username || url.password || url.hash) return null;
    const state = url.searchParams.get("state") || "";
    if (!/^[A-Za-z0-9_-]{32,100}$/.test(state)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function desktopCallback(redirectUri, values = {}) {
  const safeRedirect = parseDesktopRedirect(redirectUri);
  if (!safeRedirect) return null;
  const url = new URL(safeRedirect);
  if (values.code) url.searchParams.set("code", values.code);
  if (values.error) url.searchParams.set("error", values.error);
  return url.toString();
}

async function createDesktopHandoffCode(userId) {
  const code = randomBytes(32).toString("base64url");
  await DesktopAuthCode.create({
    user: userId,
    tokenHash: hashToken(code),
    expiresAt: new Date(Date.now() + DESKTOP_AUTH_CODE_TTL_MS)
  });
  return code;
}

const sendSession = (req, res, session, statusCode = 200) => {
  setAuthCookies(res, session);
  return res.status(statusCode).json({
    success: true,
    message: "Signed in successfully",
    user: session.user,
    ...(isDesktopClient(req) ? { desktopSession: { accessToken: session.accessToken, refreshToken: session.refreshToken } } : {})
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
      signedIn: true,
      ...(isDesktopClient(req) ? { desktopSession: { accessToken: session.accessToken, refreshToken: session.refreshToken } } : {})
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
    ...(result.expiresInMinutes ? { expiresInMinutes: result.expiresInMinutes } : {})
  });
});

export const login = asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const session = await authService.loginWithPassword(input, sessionMetadata(req));
  void sendLoginNotice(session.user, "email");
  return sendSession(req, res, session);
});

export const logout = asyncHandler(async (req, res) => {
  await authService.revokeRefreshSession(req.body?.refreshToken || req.cookies?.[AUTH_COOKIE_NAMES.refresh]);
  clearAuthCookies(res);
  return res.status(200).json({ success: true, message: "Signed out successfully" });
});

export const refresh = asyncHandler(async (req, res) => {
  const session = await authService.rotateRefreshSession(req.cookies?.[AUTH_COOKIE_NAMES.refresh], sessionMetadata(req));
  return sendSession(req, res, session);
});

export const desktopRefresh = asyncHandler(async (req, res) => {
  if (!isDesktopClient(req)) throw new ApiError(400, "Desktop session refresh is only available to the desktop client.", "DESKTOP_CLIENT_REQUIRED");
  const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
  const session = await authService.rotateRefreshSession(refreshToken, sessionMetadata(req));
  res.set("Cache-Control", "no-store");
  return res.status(200).json({
    success: true,
    user: session.user,
    desktopSession: { accessToken: session.accessToken, refreshToken: session.refreshToken }
  });
});

export const desktopExchange = asyncHandler(async (req, res) => {
  if (!isDesktopClient(req)) throw new ApiError(400, "Desktop client header is required.", "DESKTOP_CLIENT_REQUIRED");
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(code)) throw new ApiError(400, "Desktop sign-in code is invalid.", "DESKTOP_CODE_INVALID");
  const handoff = await DesktopAuthCode.findOneAndDelete({ tokenHash: hashToken(code), expiresAt: { $gt: new Date() } });
  if (!handoff) throw new ApiError(401, "Desktop sign-in code expired or was already used. Start again.", "DESKTOP_CODE_EXPIRED");
  const user = await User.findById(handoff.user);
  if (!user) throw new ApiError(401, "Account not found.", "USER_NOT_FOUND");
  const session = await authService.createSessionForUser(user, sessionMetadata(req));
  void sendLoginNotice(session.user, "desktop OAuth");
  res.set("Cache-Control", "no-store");
  return res.status(200).json({
    success: true,
    user: session.user,
    desktopSession: { accessToken: session.accessToken, refreshToken: session.refreshToken }
  });
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
    ...(result.expiresInMinutes ? { expiresInMinutes: result.expiresInMinutes } : {})
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const input = resetPasswordSchema.parse(req.body);
  await authService.resetPasswordWithOtp(input);
  clearAuthCookies(res);
  return res.status(200).json({ success: true, message: "Password updated. Please sign in again." });
});

export const googleStart = asyncHandler(async (req, res) => {
  const requestedDesktopRedirect = req.query?.desktop_redirect;
  const desktopRedirectUri = requestedDesktopRedirect ? parseDesktopRedirect(requestedDesktopRedirect) : null;
  if (requestedDesktopRedirect && !desktopRedirectUri) return res.redirect(302, authFailureUrl("google"));
  try {
    const authorization = await createGoogleAuthorization();
    setGoogleOAuthCookies(res, { ...authorization, desktopRedirectUri }, OAUTH_COOKIE_MAX_AGE_MS);
    return res.redirect(302, authorization.url);
  } catch (error) {
    console.warn("[auth:oauth] Google authorization could not start:", error?.code || error?.message || error);
    const target = desktopCallback(desktopRedirectUri, { error: "oauth_unavailable" });
    return res.redirect(302, target || authFailureUrl("google"));
  }
});

export async function googleCallback(req, res) {
  const state = typeof req.query?.state === "string" ? req.query.state : "";
  const attempt = getGoogleOAuthCookies(req);
  clearGoogleOAuthCookies(res, state);
  const desktopRedirectUri = attempt?.desktopRedirectUri || null;
  try {
    if (req.query?.error) {
      const target = desktopCallback(desktopRedirectUri, { error: String(req.query.error).slice(0, 80) });
      return res.redirect(302, target || authFailureUrl("google"));
    }
    const code = req.query?.code;
    if (!attempt || !safeStringEqual(state, attempt.state) || !attempt.nonce || !attempt.codeVerifier || typeof code !== "string") {
      throw new ApiError(400, "Google sign-in state validation failed", "GOOGLE_STATE_INVALID");
    }
    const user = await resolveGoogleUser(code, attempt.nonce, attempt.codeVerifier);
    if (desktopRedirectUri) {
      const handoffCode = await createDesktopHandoffCode(user._id);
      return res.redirect(302, desktopCallback(desktopRedirectUri, { code: handoffCode }));
    }
    void sendLoginNotice(user, "Google");
    const session = await authService.createSessionForUser(user, sessionMetadata(req));
    setAuthCookies(res, session);
    return res.redirect(302, `${env.CLIENT_URL}/?signedIn=google`);
  } catch (error) {
    console.warn("[auth:oauth] Google callback did not complete:", error?.code || error?.message || error);
    const target = desktopCallback(desktopRedirectUri, { error: "oauth_failed" });
    return res.redirect(302, target || authFailureUrl("google"));
  }
}

export const githubStart = asyncHandler(async (req, res) => {
  const requestedDesktopRedirect = req.query?.desktop_redirect;
  const desktopRedirectUri = requestedDesktopRedirect ? parseDesktopRedirect(requestedDesktopRedirect) : null;
  if (requestedDesktopRedirect && !desktopRedirectUri) return res.redirect(302, authFailureUrl("github"));
  try {
    const authorization = createGitHubAuthorization();
    setGitHubOAuthCookies(res, { ...authorization, desktopRedirectUri }, OAUTH_COOKIE_MAX_AGE_MS);
    return res.redirect(302, authorization.url);
  } catch (error) {
    console.warn("[auth:oauth] GitHub authorization could not start:", error?.code || error?.message || error);
    const target = desktopCallback(desktopRedirectUri, { error: "oauth_unavailable" });
    return res.redirect(302, target || authFailureUrl("github"));
  }
});

export async function githubCallback(req, res) {
  const state = typeof req.query?.state === "string" ? req.query.state : "";
  const attempt = getGitHubOAuthCookies(req);
  clearGitHubOAuthCookies(res, state);
  const desktopRedirectUri = attempt?.desktopRedirectUri || null;
  try {
    if (req.query?.error) {
      const target = desktopCallback(desktopRedirectUri, { error: String(req.query.error).slice(0, 80) });
      return res.redirect(302, target || authFailureUrl("github"));
    }
    const code = req.query?.code;
    if (!attempt || !safeStringEqual(state, attempt.state) || !attempt.codeVerifier || typeof code !== "string") {
      throw new ApiError(400, "GitHub sign-in state validation failed", "GITHUB_STATE_INVALID");
    }
    const user = await resolveGitHubUser(code, attempt.codeVerifier);
    if (desktopRedirectUri) {
      const handoffCode = await createDesktopHandoffCode(user._id);
      return res.redirect(302, desktopCallback(desktopRedirectUri, { code: handoffCode }));
    }
    void sendLoginNotice(user, "GitHub");
    const session = await authService.createSessionForUser(user, sessionMetadata(req));
    setAuthCookies(res, session);
    return res.redirect(302, `${env.CLIENT_URL}/?signedIn=github`);
  } catch (error) {
    console.warn("[auth:oauth] GitHub callback did not complete:", error?.code || error?.message || error);
    const target = desktopCallback(desktopRedirectUri, { error: "oauth_failed" });
    return res.redirect(302, target || authFailureUrl("github"));
  }
}
