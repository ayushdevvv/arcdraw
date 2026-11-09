export const ACCOUNT_REQUIRED_ACTIONS = Object.freeze({
  CLOUD_SAVE: "cloud-save",
  SHARE: "share",
  COLLABORATE: "collaborate",
  INVITE: "invite",
  AGENT: "agent"
});

/**
 * Call before account-backed actions. Guest editing and local drafts remain available;
 * cloud save, sharing and collaboration require an authenticated account.
 * The app shell can listen for the event and open its sign-in dialog.
 */
export function requireAccountForAction(isAuthenticated, action) {
  if (isAuthenticated) return true;

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("arcdraw:account-required", {
      detail: { action }
    }));
  }

  return false;
}


/** Open the feature-availability notice for an already authenticated account. */
export function showAccountFeatureNotice(action) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("arcdraw:account-required", {
    detail: { action }
  }));
}
