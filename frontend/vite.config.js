import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Keep all React imports on the single client-local React installation.
  // This matters for libraries that render React elements, including Excalidraw and Lucide.
  resolve: {
    dedupe: ["react", "react-dom"]
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["arcdraw.svg", "arcdraw-maskable.svg", "fonts/**/*"],
      manifest: {
        name: "Arcdraw",
        short_name: "Arcdraw",
        description: "A local-first space for visual thinking.",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/arcdraw.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/arcdraw-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff,woff2,ttf,otf,png,webp}"],
        navigateFallback: "/index.html",
        // OAuth starts and callbacks are top-level navigations to same-origin
        // API URLs. Never serve the SPA shell for these routes: Chrome's
        // installed PWA service worker otherwise intercepts them and sends the
        // user back to the home page instead of reaching the API proxy.
        navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/socket\.io(?:\/|$)/],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: true
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    sourcemap: false
  }
});
