import { apiRequest, API_BASE_URL } from "./apiClient.js";

export const register = (data) => apiRequest("/auth/register", {
  method: "POST",
  body: JSON.stringify(data)
});

export const verifyEmailOtp = (data) => apiRequest("/auth/verify-email", {
  method: "POST",
  body: JSON.stringify(data)
});

export const resendVerificationOtp = (email) => apiRequest("/auth/resend-verification", {
  method: "POST",
  body: JSON.stringify({ email })
});

export const login = (data) => apiRequest("/auth/login", {
  method: "POST",
  body: JSON.stringify(data)
});

export const logout = () => apiRequest("/auth/logout", { method: "POST" });
export const refreshSession = () => apiRequest("/auth/refresh", { method: "POST" });
export const getCurrentUser = () => apiRequest("/auth/me");

export async function getSocketTicket() {
  try {
    return await apiRequest("/auth/socket-ticket");
  } catch (error) {
    if (error.status !== 401) throw error;
    // The access cookie may have expired while the refresh cookie is still valid.
    await apiRequest("/auth/refresh", { method: "POST" });
    return apiRequest("/auth/socket-ticket");
  }
}
export const logoutAllSessions = () => apiRequest("/auth/logout-all", { method: "POST" });

export const requestPasswordResetOtp = (email) => apiRequest("/auth/forgot-password", {
  method: "POST",
  body: JSON.stringify({ email })
});

export const resetPasswordWithOtp = (data) => apiRequest("/auth/reset-password", {
  method: "POST",
  body: JSON.stringify(data)
});

const OAUTH_PENDING_KEY = "arcdraw:oauth-pending";

export function markOAuthPending(provider) {
  try {
    sessionStorage.setItem(OAUTH_PENDING_KEY, JSON.stringify({ provider: provider, at: Date.now() }));
  } catch {
    // Session storage can be blocked. The sign in itself still works.
  }
}

export function readOAuthPending() {
  try {
    const raw = sessionStorage.getItem(OAUTH_PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    // A marker older than 10 minutes belongs to an abandoned attempt.
    if (!value || Date.now() - Number(value.at || 0) > 10 * 60 * 1000) return null;
    return value;
  } catch {
    return null;
  }
}

export function clearOAuthPending() {
  try {
    sessionStorage.removeItem(OAUTH_PENDING_KEY);
  } catch {
    // Nothing to clear.
  }
}

// A stale service worker can answer the provider redirect with the app shell,
// which sends the user back to the home page without ever reaching the API.
// Removing the registrations right before leaving makes the redirect go
// straight to the network. The worker registers again when the app reloads.
async function releaseServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(function (registration) { return registration.unregister(); }));
  } catch {
    // Continue to the provider even if cleanup fails.
  }
}

async function leaveForProvider(provider) {
  markOAuthPending(provider);
  await Promise.race([
    releaseServiceWorkers(),
    new Promise(function (resolve) { window.setTimeout(resolve, 1500); })
  ]);
  window.location.assign(`${API_BASE_URL}/auth/${provider}`);
}

export function startGoogleLogin() {
  return leaveForProvider("google");
}

export function startGitHubLogin() {
  return leaveForProvider("github");
}

export const getAuthProviders = () => apiRequest("/auth/providers");
