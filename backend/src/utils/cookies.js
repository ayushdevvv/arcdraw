import { env } from "../config/env.js";
import { AUTH_COOKIE_NAMES, AUTH_PATH, ACCESS_COOKIE_MAX_AGE_MS } from "../constants/auth.constants.js";

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
  };
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  const base = baseCookieOptions();
  res.cookie(AUTH_COOKIE_NAMES.access, accessToken, {
    ...base,
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE_MS
  });
  res.cookie(AUTH_COOKIE_NAMES.refresh, refreshToken, {
    ...base,
    path: AUTH_PATH,
    maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000
  });
}

export function clearAuthCookies(res) {
  const base = baseCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAMES.access, { ...base, path: "/" });
  res.clearCookie(AUTH_COOKIE_NAMES.refresh, { ...base, path: AUTH_PATH });
}

function setProviderCookies(res, cookieEntries, callbackPath, maxAge) {
  const base = baseCookieOptions();
  for (const [name, value] of cookieEntries) {
    res.cookie(name, value, { ...base, path: callbackPath, maxAge });
  }
}

function clearProviderCookies(res, names, callbackPath) {
  const base = baseCookieOptions();
  for (const name of names) {
    res.clearCookie(name, { ...base, path: callbackPath });
  }
}

const googleCallbackPath = `${AUTH_PATH}/google/callback`;
const githubCallbackPath = `${AUTH_PATH}/github/callback`;

export function setGoogleOAuthCookies(res, { state, nonce, codeVerifier }, maxAge) {
  setProviderCookies(res, [
    [AUTH_COOKIE_NAMES.googleState, state],
    [AUTH_COOKIE_NAMES.googleNonce, nonce],
    [AUTH_COOKIE_NAMES.googleCodeVerifier, codeVerifier]
  ], googleCallbackPath, maxAge);
}

export function clearGoogleOAuthCookies(res) {
  clearProviderCookies(res, [
    AUTH_COOKIE_NAMES.googleState,
    AUTH_COOKIE_NAMES.googleNonce,
    AUTH_COOKIE_NAMES.googleCodeVerifier
  ], googleCallbackPath);
}

export function setGitHubOAuthCookies(res, { state, codeVerifier }, maxAge) {
  setProviderCookies(res, [
    [AUTH_COOKIE_NAMES.githubState, state],
    [AUTH_COOKIE_NAMES.githubCodeVerifier, codeVerifier]
  ], githubCallbackPath, maxAge);
}

export function clearGitHubOAuthCookies(res) {
  clearProviderCookies(res, [
    AUTH_COOKIE_NAMES.githubState,
    AUTH_COOKIE_NAMES.githubCodeVerifier
  ], githubCallbackPath);
}
