import { AUTH_COOKIE_NAMES } from "../constants/auth.constants.js";
import { verifyAccessToken } from "../services/token.service.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const requireAuth = asyncHandler(async (req, res, next) => {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAMES.access];
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const token = cookieToken || bearerToken;

  if (!token) throw new ApiError(401, "Authentication required", "AUTH_REQUIRED");

  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub };
    next();
  } catch {
    throw new ApiError(401, "Access token is invalid or expired", "ACCESS_TOKEN_INVALID");
  }
});

// Use this name on account-backed routes such as cloud save, sharing and collaboration.
// Guest work remains local to the client and never receives an authenticated API session.
export const requireAccount = requireAuth;
