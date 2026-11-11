import { API_BASE_URL } from "./apiClient.js";

function createStreamError(message, extra = {}) {
  const error = new Error(message || "The Design Agent could not complete this request.");
  Object.assign(error, extra);
  return error;
}

export async function generateRoomDesign(prompt, roomContext, { onProgress, signal } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 180000);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const response = await fetch(`${API_BASE_URL}/agent/design`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ prompt, roomContext }),
      signal: controller.signal
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw createStreamError(payload.error?.message || "The Design Agent request failed.", {
        status: response.status,
        code: payload.error?.code || "AGENT_REQUEST_FAILED"
      });
    }
    if (!response.body?.getReader) throw createStreamError("Your browser could not open the live design stream.", { code: "STREAM_UNAVAILABLE" });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = null;
    let streamError = null;

    const consume = (block) => {
      const lines = block.split(/\r?\n/);
      let eventName = "message";
      const data = [];
      for (const line of lines) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trim());
      }
      if (!data.length) return;
      let payload;
      try { payload = JSON.parse(data.join("\n")); } catch { return; }
      if (eventName === "progress") onProgress?.(payload);
      if (eventName === "result") result = payload;
      if (eventName === "error") streamError = createStreamError(payload.message, { code: payload.code, status: payload.status });
    };

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || "";
      blocks.forEach(consume);
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (streamError) throw streamError;
    if (!result) throw createStreamError("The Design Agent stream ended before a design was returned.", { code: "AGENT_STREAM_INCOMPLETE" });
    return result;
  } catch (error) {
    if (error?.name === "AbortError") {
      const cancelled = signal?.aborted && !timedOut;
      throw createStreamError(cancelled ? "Design generation was cancelled." : "The Design Agent took too long. Try a shorter brief.", { code: cancelled ? "AGENT_CANCELLED" : "AGENT_TIMEOUT" });
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
