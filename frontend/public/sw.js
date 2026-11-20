// Arcdraw no longer uses a service worker. Browsers that installed one earlier
// check this file for updates, so it removes itself and clears old caches.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(function (key) { return caches.delete(key); }));
    } catch (error) { /* nothing to clear */ }
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach(function (client) { client.navigate(client.url); });
  })());
});
