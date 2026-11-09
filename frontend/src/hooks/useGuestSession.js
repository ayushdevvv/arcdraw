import { useCallback, useEffect, useState } from "react";
import { getGuestSession, startGuestSession, clearGuestSession } from "../guest/guestSession.js";

export function useGuestSession() {
  const [session, setSession] = useState(() => getGuestSession());

  useEffect(() => {
    const sync = () => setSession(getGuestSession());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const start = useCallback(() => {
    const next = startGuestSession();
    setSession(next);
    return next;
  }, []);

  const clear = useCallback(() => {
    clearGuestSession();
    setSession(null);
  }, []);

  return { session, isGuest: Boolean(session), start, clear };
}
