import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const basePath =
  process.env.GITHUB_ACTIONS && repositoryName
    ? `/${repositoryName}/`
    : "/";

export default defineConfig({
  base: basePath,
  plugins: [react()],
  root: "web",
  build: {
    outDir: "../dist/web",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true
      }
    }
  }
});
