import { z } from "zod";
import { ApiError } from "../utils/ApiError.js";
import { generateRoomDesign } from "../agent/agent.service.js";

const requestSchema = z.object({
  prompt: z.string().trim().min(8).max(2000),
  roomContext: z.object({
    title: z.string().max(120).optional(),
    kind: z.enum(["board", "notes"]).optional(),
    elementCount: z.number().int().min(0).max(500).optional(),
    selected: z.array(z.object({
      id: z.string().max(100),
      type: z.string().max(30).optional(),
      text: z.string().max(140).optional(),
      backgroundColor: z.string().max(20).optional(),
      strokeColor: z.string().max(20).optional(),
      fontSize: z.number().optional(),
      opacity: z.number().optional(),
      x: z.number().optional(), y: z.number().optional(),
      width: z.number().optional(), height: z.number().optional()
    })).max(12).optional()
  }).optional().default({})
});

function writeEvent(res, event, data) {
  if (res.destroyed || res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function generateAgentDesign(req, res) {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    const error = new ApiError(400, "Describe the design in 8 to 2,000 characters.", "AGENT_PROMPT_INVALID", parsed.error.flatten());
    return res.status(error.statusCode || 400).json({ success: false, error: { code: error.code, message: error.message, details: error.details } });
  }

  const generationAbort = new AbortController();
  const abortGeneration = () => {
    if (!res.writableEnded && !generationAbort.signal.aborted) generationAbort.abort();
  };
  req.once("aborted", abortGeneration);
  res.once("close", abortGeneration);
  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) res.write(": keep-alive\n\n");
  }, 15000);
  heartbeat.unref?.();

  res.status(200);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders?.();
  writeEvent(res, "progress", { stage: "queued", title: "Warming up the design studio", detail: "Preparing your room context.", progress: 4 });

  try {
    const result = await generateRoomDesign({
      ...parsed.data,
      signal: generationAbort.signal,
      onProgress: (progress) => writeEvent(res, "progress", progress)
    });
    writeEvent(res, "result", result);
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    writeEvent(res, "error", {
      code: error?.code || "AGENT_FAILED",
      message: error?.message || "The Design Agent could not complete this request.",
      status: statusCode
    });
  } finally {
    clearInterval(heartbeat);
    req.removeListener("aborted", abortGeneration);
    res.removeListener("close", abortGeneration);
    if (!res.writableEnded && !res.destroyed) res.end();
  }
}
