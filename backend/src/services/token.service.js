import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Access tokens intentionally have no time-based expiry. Their session id is
// checked against MongoDB on every request, so logout and logout-all still
// revoke them immediately.
export function createAccessToken(userId, sessionId) {
  return jwt.sign(
    { sub: userId.toString(), sid: sessionId ? sessionId.toString() : undefined },
    env.JWT_ACCESS_SECRET,
    { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE
  });
}
