import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:3001",
      "/chat": "http://localhost:3001",
      "/healthz": "http://localhost:3001"
    }
  }
});
