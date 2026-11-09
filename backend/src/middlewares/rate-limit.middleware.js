import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

const common = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." }
  })
};

export const authRateLimiter = rateLimit({
  ...common,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX
});

export const sensitiveAuthRateLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 8
});

// Research requests can incur external provider usage. Keep the per-IP limit
// conservative; authenticated user-level quotas can be added with billing.
export const agentRateLimiter = rateLimit({
  ...common,
  windowMs: 10 * 60 * 1000,
  limit: 8
});
