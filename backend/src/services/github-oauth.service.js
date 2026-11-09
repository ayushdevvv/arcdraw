import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import User from "../models/User.model.js";
import { ApiError } from "../utils/ApiError.js";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

function createPkcePair() {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

function githubHeaders(accessToken) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "Arcdraw"
  };
}

async function githubJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new ApiError(502, "Could not reach GitHub. Please try again.", "GITHUB_PROVIDER_UNAVAILABLE");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(502, "GitHub sign-in could not be completed. Please try again.", "GITHUB_PROVIDER_ERROR");
  }
  return body;
}

export function createGitHubAuthorization() {
  if (!env.GITHUB_OAUTH_ENABLED) {
    throw new ApiError(503, "GitHub sign-in is not configured", "GITHUB_OAUTH_NOT_CONFIGURED");
  }

  const state = randomBytes(32).toString("base64url");
  const { codeVerifier, codeChallenge } = createPkcePair();
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: env.GITHUB_CALLBACK_URL,
    scope: "read:user user:email",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    allow_signup: "true"
  }).toString();

  return { url: url.toString(), state, codeVerifier };
}

export async function resolveGitHubUser(code, codeVerifier) {
  if (!env.GITHUB_OAUTH_ENABLED) {
    throw new ApiError(503, "GitHub sign-in is not configured", "GITHUB_OAUTH_NOT_CONFIGURED");
  }

  const tokenBody = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    code,
    redirect_uri: env.GITHUB_CALLBACK_URL,
    code_verifier: codeVerifier
  });

  const tokenResponse = await githubJson(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Arcdraw"
    },
    body: tokenBody
  });

  if (!tokenResponse.access_token) {
    throw new ApiError(401, "GitHub authorization was not granted", "GITHUB_ACCESS_TOKEN_MISSING");
  }

  const accessToken = tokenResponse.access_token;
  const [profile, emailRecords] = await Promise.all([
    githubJson(`${GITHUB_API_URL}/user`, { headers: githubHeaders(accessToken) }),
    githubJson(`${GITHUB_API_URL}/user/emails`, { headers: githubHeaders(accessToken) })
  ]);

  const primaryEmail = Array.isArray(emailRecords)
    ? emailRecords.find((entry) => entry.primary && entry.verified)
    : null;

  if (!profile?.id || !primaryEmail?.email) {
    throw new ApiError(403, "Your GitHub account needs a verified primary email to sign in to Arcdraw", "GITHUB_VERIFIED_EMAIL_REQUIRED");
  }

  const githubId = String(profile.id);
  const email = primaryEmail.email.toLowerCase();
  let user = await User.findOne({ githubId });

  if (!user) {
    user = await User.findOne({ email });
    if (user) {
      if (user.githubId && user.githubId !== githubId) {
        throw new ApiError(409, "This email is linked to another GitHub account", "GITHUB_ACCOUNT_CONFLICT");
      }
      user.githubId = githubId;
      user.githubUsername = profile.login || null;
      user.isEmailVerified = true;
      if (!user.avatarUrl && profile.avatar_url) user.avatarUrl = profile.avatar_url;
      if ((!user.name || user.name === email.split("@")[0]) && profile.name) user.name = profile.name;
      await user.save();
    } else {
      user = await User.create({
        name: profile.name || profile.login || email.split("@")[0],
        email,
        githubId,
        githubUsername: profile.login || null,
        avatarUrl: profile.avatar_url || null,
        isEmailVerified: true,
        lastLoginAt: new Date()
      });
    }
  }

  user.lastLoginAt = new Date();
  await user.save();
  return user;
}
