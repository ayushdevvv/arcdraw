import express from "express";
import { requireAccount } from "../middlewares/auth.middleware.js";
import { agentRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { analyzeAgentGoal } from "../controllers/agent.controller.js";

const router = express.Router();
router.use(requireAccount);
router.post("/analyze", agentRateLimiter, analyzeAgentGoal);
export default router;
