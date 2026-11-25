import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/",
  // Keep all React imports on the single client-local React installation.
  // This matters for libraries that render React elements, including Excalidraw and Lucide.
  resolve: {
    dedupe: ["react", "react-dom"]
  },
  plugins: [
    react()
  ],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    sourcemap: false
  }
});
