import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Self-hosted @fontsource font files get a stable, un-hashed path
        // (assets/fonts/<name>.<ext>) instead of Vite's default content-hash
        // suffix. Font bytes rarely change build-to-build, and a deterministic
        // path lets index.html's <link rel="preload"> reference the exact
        // file the built CSS's @font-face src will request — a hashed name
        // can't be known ahead of a build, so preloading it correctly would
        // otherwise require injecting the tag post-build. Every other asset
        // (JS/CSS chunks, images) keeps Vite's normal hashed naming.
        assetFileNames: (assetInfo) => {
          const fileName = "names" in assetInfo && assetInfo.names?.length ? assetInfo.names[0] : (assetInfo.name ?? "");
          if (/\.(woff2?)$/i.test(fileName)) {
            return "assets/fonts/[name][extname]";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
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
