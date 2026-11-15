export const AUTH_COOKIE_NAMES = Object.freeze({
  access: "arcdraw_access",
  refresh: "arcdraw_refresh",
  googleState: "arcdraw_google_state",
  googleNonce: "arcdraw_google_nonce",
  googleCodeVerifier: "arcdraw_google_code_verifier",
  githubState: "arcdraw_github_state",
  githubCodeVerifier: "arcdraw_github_code_verifier"
});

export const AUTH_PATH = "/api/v1/auth";
export const OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;
export const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;
