import { registerSW } from "virtual:pwa-register";

export function registerArcdrawServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  registerSW({
    immediate: true,
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent("arcdraw:offline-ready"));
    },
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent("arcdraw:update-ready"));
      // Keep production tabs on the current route bundle; room data is saved locally.
      window.location.reload();
    },
    onRegisteredSW(_swUrl, registration) {
      // Check for a fresh app shell whenever the app starts, not only on install.
      registration?.update?.().catch(() => {});
    }
  });
}
