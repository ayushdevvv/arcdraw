import { randomBytes } from "node:crypto";
import { googleOAuthClient } from "../config/google.js";
import { env } from "../config/env.js";
import User from "../models/User.model.js";
import { ApiError } from "../utils/ApiError.js";

export async function createGoogleAuthorization() {
  if (!googleOAuthClient) {
    throw new ApiError(503, "Google sign-in is not configured", "GOOGLE_OAUTH_NOT_CONFIGURED");
  }

  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const { codeVerifier, codeChallenge } = await googleOAuthClient.generateCodeVerifierAsync();
  const url = googleOAuthClient.generateAuthUrl({
    access_type: "online",
    include_granted_scopes: true,
    prompt: "select_account",
    response_type: "code",
    scope: ["openid", "email", "profile"],
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });

  return { url, state, nonce, codeVerifier };
}

export async function resolveGoogleUser(code, expectedNonce, codeVerifier) {
  if (!googleOAuthClient) {
    throw new ApiError(503, "Google sign-in is not configured", "GOOGLE_OAUTH_NOT_CONFIGURED");
  }

  const { tokens } = await googleOAuthClient.getToken({ code, codeVerifier });
  if (!tokens.id_token) {
    throw new ApiError(401, "Google did not return an identity token", "GOOGLE_TOKEN_MISSING");
  }

  const ticket = await googleOAuthClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID
  });

  const profile = ticket.getPayload();
  if (!profile?.sub || !profile.email || profile.email_verified !== true) {
    throw new ApiError(401, "Google account email could not be verified", "GOOGLE_EMAIL_UNVERIFIED");
  }
  if (!profile.nonce || profile.nonce !== expectedNonce) {
    throw new ApiError(401, "Google sign-in nonce validation failed", "GOOGLE_NONCE_INVALID");
  }

  const email = profile.email.toLowerCase();
  let user = await User.findOne({ googleId: profile.sub });

  if (!user) {
    user = await User.findOne({ email });
    if (user) {
      if (user.googleId && user.googleId !== profile.sub) {
        throw new ApiError(409, "This email is linked to another Google account", "GOOGLE_ACCOUNT_CONFLICT");
      }
      user.googleId = profile.sub;
      user.isEmailVerified = true;
      if (!user.avatarUrl && profile.picture) user.avatarUrl = profile.picture;
      if (!user.name && profile.name) user.name = profile.name;
      await user.save();
    } else {
      user = await User.create({
        name: profile.name || email.split("@")[0],
        email,
        googleId: profile.sub,
        avatarUrl: profile.picture || null,
        isEmailVerified: true,
        lastLoginAt: new Date()
      });
    }
  }

  user.lastLoginAt = new Date();
  await user.save();
  return user;
}
