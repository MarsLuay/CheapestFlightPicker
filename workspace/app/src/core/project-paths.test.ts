import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { resolveAppPath, resolveRuntimeDataPath } from "./project-paths.js";

describe("project-paths", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("resolveAppPath", () => {
    it("should resolve paths relative to the app root", () => {
      const rootPath = resolveAppPath();
      expect(rootPath.endsWith("app")).toBe(true);

      const nestedPath = resolveAppPath("src", "core");
      expect(nestedPath).toBe(path.resolve(rootPath, "src", "core"));
    });
  });

  describe("resolveRuntimeDataPath", () => {
    it("should use CHEAPEST_FLIGHT_PICKER_RUNTIME_DIR if set", () => {
      process.env.CHEAPEST_FLIGHT_PICKER_RUNTIME_DIR = "/custom/runtime/dir";
      delete process.env.VERCEL;

      const runtimePath = resolveRuntimeDataPath("data", "file.json");
      expect(runtimePath).toBe(path.resolve("/custom/runtime/dir", "data", "file.json"));
    });

    it("should use os.tmpdir()/cheapest-flight-picker if VERCEL is set and runtime dir is not", () => {
      delete process.env.CHEAPEST_FLIGHT_PICKER_RUNTIME_DIR;
      process.env.VERCEL = "1";

      const runtimePath = resolveRuntimeDataPath("data", "file.json");
      const expectedBasePath = path.join(os.tmpdir(), "cheapest-flight-picker");
      expect(runtimePath).toBe(path.resolve(expectedBasePath, "data", "file.json"));
    });

    it("should fallback to resolveAppPath if no env vars are set", () => {
      delete process.env.CHEAPEST_FLIGHT_PICKER_RUNTIME_DIR;
      delete process.env.VERCEL;

      const runtimePath = resolveRuntimeDataPath("data", "file.json");
      const expectedBasePath = resolveAppPath();
      expect(runtimePath).toBe(path.resolve(expectedBasePath, "data", "file.json"));
    });
  });
});
