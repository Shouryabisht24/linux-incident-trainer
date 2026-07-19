import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
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
