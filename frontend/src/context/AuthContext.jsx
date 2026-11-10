import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getCurrentUser,
  refreshSession as refreshAccountSession,
  login as loginRequest,
  logout as logoutRequest
} from "../services/authService.js";

const AuthContext = createContext(null);
let authBootstrapPromise = null;

function bootstrapAccountSession() {
  if (!authBootstrapPromise) {
    authBootstrapPromise = (async () => {
      try {
        return await getCurrentUser();
      } catch (error) {
        if (error.status === 401) {
          try { return await refreshAccountSession(); }
          catch (refreshError) {
            if (refreshError.status === 401) return { user: null };
            throw refreshError;
          }
        }
        throw error;
      }
    })().finally(() => {
      authBootstrapPromise = null;
    });
  }
  return authBootstrapPromise;
}

/**
 * Account state is backed by HTTP-only cookies. Tokens never enter localStorage.
 * Guest drafts remain in the separate guest/IndexedDB system until migration is built.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let active = true;

    bootstrapAccountSession()
      .then((result) => {
        if (!active) return;
        setUser(result.user || null);
        setStatus(result.user ? "authenticated" : "anonymous");
      })
      .catch(() => {
        // The app remains usable as a guest when the API is unavailable.
        if (!active) return;
        setUser(null);
        setStatus("anonymous");
      });

    return () => { active = false; };
  }, []);

  const signIn = useCallback(async (credentials) => {
    const result = await loginRequest(credentials);
    setUser(result.user || null);
    setStatus(result.user ? "authenticated" : "anonymous");
    setAuthError("");
    return result;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Local guest work is retained even when the API is unavailable.
    } finally {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo(() => ({
    user,
    status,
    isAuthenticated: Boolean(user),
    isLoading: status === "loading",
    authError,
    signIn,
    signOut,
    setAuthError
  }), [user, status, authError, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
