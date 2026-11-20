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

// Sign in attempts are also counted per email address, so one account cannot be
// hammered from many addresses.
export const loginAccountRateLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip: (req) => typeof req.body?.email !== "string" || !req.body.email,
  keyGenerator: (req) => `login:${String(req.body.email).trim().toLowerCase().slice(0, 254)}`
});

// Visitors who are signed out still ask the server to refresh on every page load,
// so this needs a wide limit and ignores requests that carry no refresh cookie.
export const refreshRateLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 120,
  skip: (req) => !req.cookies?.arcdraw_refresh
});

export const sensitiveAuthRateLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 8
});

// Design-generation requests can incur external provider usage. Keep the per-IP limit
// conservative; authenticated user-level quotas can be added with billing.
export const agentRateLimiter = rateLimit({
  ...common,
  windowMs: 10 * 60 * 1000,
  limit: 8
});
