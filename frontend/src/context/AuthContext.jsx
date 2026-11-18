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
        const canRecover = error.status === 401 || error.status >= 500 || error.code === "NETWORK" || error.code === "TIMEOUT";
        if (!canRecover) throw error;
        try {
          return await refreshAccountSession();
        } catch (refreshError) {
          if (refreshError.status === 401) return { user: null };
          throw refreshError;
        }
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

  // Used after email verification, where the server has already set the session cookies.
  const completeSignIn = useCallback((nextUser) => {
    setUser(nextUser || null);
    setStatus(nextUser ? "authenticated" : "anonymous");
    setAuthError("");
  }, []);

  // Asks the server again who the cookies belong to. Used when returning from
  // Google or GitHub, where the first check can lose a race with a cold server.
  const refreshUser = useCallback(async () => {
    try {
      const result = await bootstrapAccountSession();
      if (result && result.user) {
        setUser(result.user);
        setStatus("authenticated");
        setAuthError("");
        return result.user;
      }
    } catch {
      // The caller decides whether to try again.
    }
    return null;
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
    completeSignIn,
    refreshUser,
    signOut,
    setAuthError
  }), [user, status, authError, signIn, completeSignIn, refreshUser, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
