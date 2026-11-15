import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { authRateLimiter, sensitiveAuthRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

const router = Router();

// Public capability discovery lets the client hide providers that are not configured.
// This endpoint exposes booleans only; OAuth secrets never leave the server.
router.get("/providers", (req, res) => {
  return res.status(200).json({
    success: true,
    providers: {
      password: true,
      google: env.GOOGLE_OAUTH_ENABLED,
      github: env.GITHUB_OAUTH_ENABLED
    }
  });
});

router.post("/register", authRateLimiter, authController.register);
router.post("/verify-email", sensitiveAuthRateLimiter, authController.verifyEmailOtp);
router.post("/resend-verification", sensitiveAuthRateLimiter, authController.resendVerification);
router.post("/login", authRateLimiter, authController.login);
router.post("/logout", authController.logout);
router.post("/refresh", authRateLimiter, authController.refresh);
router.get("/me", requireAuth, authController.me);
router.post("/logout-all", requireAuth, authController.logoutAll);
router.post("/forgot-password", sensitiveAuthRateLimiter, authController.forgotPassword);
router.post("/reset-password", sensitiveAuthRateLimiter, authController.resetPassword);

router.get("/google", authRateLimiter, (req, res, next) => {
  if (!env.GOOGLE_OAUTH_ENABLED) {
    return next(new ApiError(503, "Google sign-in is not configured", "GOOGLE_OAUTH_NOT_CONFIGURED"));
  }
  return authController.googleStart(req, res, next);
});
router.get("/google/callback", authController.googleCallback);

router.get("/github", authRateLimiter, (req, res, next) => {
  if (!env.GITHUB_OAUTH_ENABLED) {
    return next(new ApiError(503, "GitHub sign-in is not configured", "GITHUB_OAUTH_NOT_CONFIGURED"));
  }
  return authController.githubStart(req, res, next);
});
router.get("/github/callback", authController.githubCallback);

export default router;
