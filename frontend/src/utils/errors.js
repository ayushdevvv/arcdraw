// Turns any error into one short sentence a person can act on.
// Technical details stay in the console. People see plain language.

const TECHNICAL = /(typeerror|referenceerror|syntaxerror|cannot read|undefined|is not a function|is not defined|unexpected token|failed to fetch|networkerror|load failed|aborterror|indexeddb|dexie|\bat\s+\S+:\d+)/i;

export function friendlyError(error, fallback) {
  const base = fallback || "Something went wrong. Please try again.";
  if (!error) return base;

  const name = error.name || "";
  const status = Number(error.status) || 0;
  const code = error.code || "";

  if (code === "NETWORK") return "Can't reach the server. Check your connection and try again.";
  if (code === "TIMEOUT") return "The server took too long to answer. Please try again.";
  if (name === "QuotaExceededError" || /quota/i.test(error.message || "")) {
    return "Your device is out of storage space. Free some space and try again.";
  }
  if (name === "DatabaseClosedError" || name === "InvalidStateError" || name === "UnknownError") {
    return "Local storage is not available right now. Reload the page and try again.";
  }
  if (status === 401) return "Your session expired. Sign in again to continue.";
  if (status === 403) return error.message && !TECHNICAL.test(error.message) ? error.message : "You do not have permission to do that.";
  if (status === 404) return error.message && !TECHNICAL.test(error.message) ? error.message : "We could not find that. It may have been removed.";
  if (status === 413) return "That is too large to sync. Remove large images and try again.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status >= 500) return "Something went wrong on our side. Please try again in a moment.";

  const message = String(error.message || "").trim();
  if (!message || message.length > 180 || TECHNICAL.test(message)) return base;
  return message;
}
