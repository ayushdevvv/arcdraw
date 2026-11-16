import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { authRateLimiter, sensitiveAuthRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { env } from "../config/env.js";

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
router.get("/socket-ticket", requireAuth, authController.createSocketTicket);
router.post("/logout-all", requireAuth, authController.logoutAll);
router.post("/forgot-password", sensitiveAuthRateLimiter, authController.forgotPassword);
router.post("/reset-password", sensitiveAuthRateLimiter, authController.resetPassword);

// OAuth start handlers redirect both configured and unavailable providers back
// through the app, so a provider issue never strands the user on an API error page.
router.get("/google", authController.googleStart);
router.get("/google/callback", authController.googleCallback);
router.get("/github", authController.githubStart);
router.get("/github/callback", authController.githubCallback);

export default router;
