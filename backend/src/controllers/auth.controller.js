import { env } from "../config/env.js";
import { AUTH_COOKIE_NAMES, OAUTH_COOKIE_MAX_AGE_MS } from "../constants/auth.constants.js";
import * as authService from "../services/auth.service.js";
import { createGoogleAuthorization, resolveGoogleUser } from "../services/google-oauth.service.js";
import { createGitHubAuthorization, resolveGitHubUser } from "../services/github-oauth.service.js";
import {
  clearAuthCookies,
  clearGoogleOAuthCookies,
  clearGitHubOAuthCookies,
  setAuthCookies,
  setGoogleOAuthCookies,
  setGitHubOAuthCookies
} from "../utils/cookies.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { safeStringEqual } from "../utils/crypto.js";
import { ApiError } from "../utils/ApiError.js";
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
  const user = await authService.verifyEmailOtp(input);
  return res.status(200).json({
    success: true,
    message: "Email verified successfully. You can now sign in.",
    user
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
  const authorization = await createGoogleAuthorization();
  setGoogleOAuthCookies(res, authorization, OAUTH_COOKIE_MAX_AGE_MS);
  return res.redirect(302, authorization.url);
});

export const googleCallback = asyncHandler(async (req, res) => {
  const storedState = req.cookies?.[AUTH_COOKIE_NAMES.googleState];
  const storedNonce = req.cookies?.[AUTH_COOKIE_NAMES.googleNonce];
  const storedCodeVerifier = req.cookies?.[AUTH_COOKIE_NAMES.googleCodeVerifier];
  const { state, code, error } = req.query;

  clearGoogleOAuthCookies(res);
  if (error) return res.redirect(302, `${env.CLIENT_URL}/?authError=google`);

  if (!safeStringEqual(String(state || ""), storedState || "") || !storedNonce || !storedCodeVerifier || typeof code !== "string") {
    throw new ApiError(400, "Google sign-in could not be validated. Please try again.", "GOOGLE_STATE_INVALID");
  }

  const user = await resolveGoogleUser(code, storedNonce, storedCodeVerifier);
  const session = await authService.createSessionForUser(user, sessionMetadata(req));
  setAuthCookies(res, session);
  return res.redirect(302, `${env.CLIENT_URL}/?signedIn=google`);
});

export const githubStart = asyncHandler(async (req, res) => {
  const authorization = createGitHubAuthorization();
  setGitHubOAuthCookies(res, authorization, OAUTH_COOKIE_MAX_AGE_MS);
  return res.redirect(302, authorization.url);
});

export const githubCallback = asyncHandler(async (req, res) => {
  const storedState = req.cookies?.[AUTH_COOKIE_NAMES.githubState];
  const storedCodeVerifier = req.cookies?.[AUTH_COOKIE_NAMES.githubCodeVerifier];
  const { state, code, error } = req.query;

  clearGitHubOAuthCookies(res);
  if (error) return res.redirect(302, `${env.CLIENT_URL}/?authError=github`);

  if (!safeStringEqual(String(state || ""), storedState || "") || !storedCodeVerifier || typeof code !== "string") {
    throw new ApiError(400, "GitHub sign-in could not be validated. Please try again.", "GITHUB_STATE_INVALID");
  }

  const user = await resolveGitHubUser(code, storedCodeVerifier);
  const session = await authService.createSessionForUser(user, sessionMetadata(req));
  setAuthCookies(res, session);
  return res.redirect(302, `${env.CLIENT_URL}/?signedIn=github`);
});
