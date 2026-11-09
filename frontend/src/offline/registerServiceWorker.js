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
    }
  });
}
