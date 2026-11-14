import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getCurrentUser,
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
        if (error.status === 401) return { user: null };
        throw error;
      }
    })().finally(() => {
      authBootstrapPromise = null;
    });
  }
  return authBootstrapPromise;
}

/**
 * Account state uses a revocable HTTP-only cookie. There is no timed access
 * token, refresh cycle, or inactivity logout; sessions end only on sign-out.
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

  const completeSignIn = useCallback((nextUser) => {
    setUser(nextUser || null);
    setStatus(nextUser ? "authenticated" : "anonymous");
    setAuthError("");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Keep the UI responsive even when the API is unavailable.
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
    signOut,
    setAuthError
  }), [user, status, authError, signIn, completeSignIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
