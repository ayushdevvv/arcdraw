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
export const getCurrentUser = () => apiRequest("/auth/me");
export const logoutAllSessions = () => apiRequest("/auth/logout-all", { method: "POST" });

export const requestPasswordResetOtp = (email) => apiRequest("/auth/forgot-password", {
  method: "POST",
  body: JSON.stringify({ email })
});

export const resetPasswordWithOtp = (data) => apiRequest("/auth/reset-password", {
  method: "POST",
  body: JSON.stringify(data)
});

export function startGoogleLogin() {
  window.location.assign(`${API_BASE_URL}/auth/google`);
}

export function startGitHubLogin() {
  window.location.assign(`${API_BASE_URL}/auth/github`);
}

export const getAuthProviders = () => apiRequest("/auth/providers");
