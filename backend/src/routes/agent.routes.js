import express from "express";
import { requireAccount } from "../middlewares/auth.middleware.js";
import { agentRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { generateAgentDesign } from "../controllers/agent.controller.js";

const router = express.Router();
router.use(requireAccount);
router.post("/design", agentRateLimiter, generateAgentDesign);
export default router;
