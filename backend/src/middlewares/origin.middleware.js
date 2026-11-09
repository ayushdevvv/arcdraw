import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

export function enforceAllowedOrigin(req, res, next) {
  const origin = req.get("origin");
  if (origin && !env.CORS_ORIGINS.includes(origin)) {
    return next(new ApiError(403, "Request origin is not allowed", "ORIGIN_NOT_ALLOWED"));
  }
  return next();
}
