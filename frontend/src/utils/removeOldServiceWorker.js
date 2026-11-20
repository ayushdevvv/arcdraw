// Earlier versions installed a service worker and an offline cache. Remove both
// so every visit loads the current app straight from the network.
export function removeOldServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function (registrations) {
    registrations.forEach(function (registration) { registration.unregister(); });
  }).catch(function () { /* ignore */ });
  if (window.caches) {
    window.caches.keys().then(function (keys) {
      keys.forEach(function (key) { window.caches.delete(key); });
    }).catch(function () { /* ignore */ });
  }
}
