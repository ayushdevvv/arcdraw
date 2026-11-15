import { AUTH_COOKIE_NAMES } from "../constants/auth.constants.js";
import { verifyAccessToken } from "../services/token.service.js";
import { ApiError } from "../utils/ApiError.js";
import RefreshSession from "../models/RefreshSession.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const requireAuth = asyncHandler(async (req, res, next) => {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAMES.access];
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) throw new ApiError(401, "Authentication required", "AUTH_REQUIRED");

  try {
    const payload = verifyAccessToken(token);
    if (payload.scope === "socket") throw new Error("Socket credential cannot access HTTP routes");
    if (!payload.sid) throw new Error("Session reference missing");
    const session = await RefreshSession.findOne({ _id: payload.sid, user: payload.sub, revokedAt: null, expiresAt: { $gt: new Date() } }).select("_id").lean();
    if (!session) throw new Error("Session revoked");
    req.auth = { userId: payload.sub, sessionId: payload.sid };
    next();
  } catch {
    throw new ApiError(401, "Access token is invalid or expired", "ACCESS_TOKEN_INVALID");
  }
});

// Use this name on account-backed routes such as cloud save, sharing and collaboration.
// Guest work remains local to the client and never receives an authenticated API session.
export const requireAccount = requireAuth;


// Public room previews may be opened without a session. A valid account cookie
// is attached when present, but an absent/expired cookie never blocks viewing.
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAMES.access];
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const token = cookieToken || bearerToken;
  req.auth = null;
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    if (payload.scope === "socket") return next();
    if (!payload.sid) return next();
    const session = await RefreshSession.findOne({ _id: payload.sid, user: payload.sub, revokedAt: null, expiresAt: { $gt: new Date() } }).select("_id").lean();
    if (session) req.auth = { userId: payload.sub, sessionId: payload.sid };
  } catch {
    // A stale account cookie is treated as a guest preview, not an access error.
  }
  return next();
});
