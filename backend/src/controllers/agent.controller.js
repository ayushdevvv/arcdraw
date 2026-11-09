import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { analyzeRoomGoal } from "../agent/agent.service.js";

const requestSchema = z.object({
  prompt: z.string().trim().min(8).max(2000),
  roomContext: z.object({
    title: z.string().max(120).optional(),
    kind: z.enum(["board", "notes"]).optional(),
    notes: z.array(z.object({ title: z.string().max(120).optional(), content: z.string().max(6000).optional() })).max(12).optional(),
    elements: z.array(z.object({ type: z.string().max(40).optional(), text: z.string().max(180).optional(), originalText: z.string().max(180).optional(), x: z.number().optional(), y: z.number().optional() })).max(80).optional(),
    tasks: z.array(z.object({ title: z.string().max(120), status: z.string().max(32).optional() })).max(30).optional()
  }).optional().default({})
});

export const analyzeAgentGoal = asyncHandler(async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Enter a goal of 8 to 2,000 characters.", "AGENT_PROMPT_INVALID", parsed.error.flatten());
  const result = await analyzeRoomGoal(parsed.data);
  res.json({ success: true, data: result });
});
