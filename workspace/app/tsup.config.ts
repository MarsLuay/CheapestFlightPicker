import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: false,
  entry: {
    "server/index": "src/server/index.ts",
    "cli/index": "src/cli/index.ts"
  },
  format: ["esm"],
  outDir: "dist",
  shims: false,
  sourcemap: true,
  splitting: false,
  target: "node20"
});
