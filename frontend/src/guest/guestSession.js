const GUEST_SESSION_KEY = "arcdraw:guest-session:v1";

function createGuestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getGuestSession() {
  try {
    const raw = localStorage.getItem(GUEST_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.guestId || !session?.createdAt) return null;
    return session;
  } catch {
    return null;
  }
}

export function startGuestSession() {
  const existing = getGuestSession();
  if (existing) return existing;

  const session = {
    guestId: createGuestId(),
    createdAt: new Date().toISOString(),
    mode: "guest"
  };

  localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearGuestSession() {
  localStorage.removeItem(GUEST_SESSION_KEY);
}
