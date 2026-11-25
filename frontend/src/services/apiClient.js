const desktopRuntime = typeof window !== "undefined" && window.arcDesktop?.isDesktop === true;
const isProductionBuild = Boolean(import.meta.env.PROD);
const configuredApiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";
// Desktop runs the bundled frontend on a stable loopback origin. Electron's
// local main-process server proxies /api/v1 and /socket.io, preserving local
// IndexedDB while keeping API credentials out of the renderer.
const API_BASE_URL = (desktopRuntime
  ? `${window.location.origin}/api/v1`
  : isProductionBuild
    ? `${window.location.origin}/api/v1`
    : configuredApiBase
).replace(/\/$/, "");
function resolveSocketUrl() {
  if (desktopRuntime) return window.location.origin;
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
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

export function apiFetch(input, options = {}) {
  // In desktop mode this remains a same-origin request to the loopback bridge.
  // The main process adds a short-lived bearer credential to the upstream API
  // request; renderer JavaScript never receives the refresh token.
  return fetch(input, { ...options, credentials: options.credentials || "include" });
}

async function send(path, options, headers) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await apiFetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
      ...options,
      headers,
      signal: controller.signal
    });
  } catch (cause) {
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
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
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

export { API_BASE_URL, SOCKET_URL, desktopRuntime };
