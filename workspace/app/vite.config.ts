import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number.parseInt(process.env.PORT ?? "8787", 10);

export default defineConfig({
  base: "/",
  plugins: [react()],
  root: "web",
  build: {
    outDir: "../public",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${Number.isFinite(apiPort) ? apiPort : 8787}`,
        changeOrigin: true
      }
    }
  }
});
