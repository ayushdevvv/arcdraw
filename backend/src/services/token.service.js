import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { createOpaqueToken, hashToken } from "../utils/crypto.js";

export function createAccessToken(userId, sessionId) {
  return jwt.sign(
    { sub: userId.toString(), sid: sessionId ? sessionId.toString() : undefined },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: "15m",
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE
  });
}

export function createRefreshToken() {
  const token = createOpaqueToken(48);
  return { token, tokenHash: hashToken(token) };
}
