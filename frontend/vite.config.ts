import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Docker Desktop's gRPC-FUSE bind mounts don't reliably deliver inotify
    // events (confirmed for tsx's watcher on the backend; applying the same
    // fix here defensively — see docker-compose.override.yml).
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      "/health": "http://backend:4000",
      "/api": "http://backend:4000",
      "/ws": {
        target: "ws://backend:4000",
        ws: true,
      },
    },
  },
});
