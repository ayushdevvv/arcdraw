const isProductionBuild = Boolean(import.meta.env.PROD);
const configuredApiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";
// In production the frontend proxies /api/v1 to Render. This keeps auth cookies
// first-party on mobile browsers that block cross-site cookies (notably Chrome).
const API_BASE_URL = (isProductionBuild
  ? `${window.location.origin}/api/v1`
  : configuredApiBase
).replace(/\/$/, "");
function resolveSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  // Reuse the previously configured API host for realtime when one exists.
  // The REST API itself still goes through the same-origin Vercel proxy.
  if (isProductionBuild && import.meta.env.VITE_API_BASE_URL) {
    try { return new URL(import.meta.env.VITE_API_BASE_URL, window.location.origin).origin; } catch { /* use default below */ }
  }
  return isProductionBuild ? "https://arcdraw.onrender.com" : new URL(API_BASE_URL).origin;
}
const SOCKET_URL = resolveSocketUrl().replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 45000;

function makeError(message, extra) {
  const error = new Error(message);
  Object.assign(error, extra);
  return error;
}

async function send(path, options, headers) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
      ...options,
      headers,
      credentials: "include",
      signal: controller.signal
    });
  } catch (cause) {
    // Browsers report every network failure as a vague TypeError. Give callers a
    // stable code so the UI can show a clear message.
    if (cause?.name === "AbortError") {
      throw makeError("The server took too long to answer. Please try again.", { code: "TIMEOUT" });
    }
    throw makeError("Can't reach the server. Check your connection and try again.", { code: "NETWORK" });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await send(path, options, headers);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw makeError(payload.error?.message || payload.message || "Request failed", {
      status: response.status,
      code: payload.error?.code,
      details: payload.error?.details
    });
  }

  return payload;
}

export { API_BASE_URL, SOCKET_URL };
