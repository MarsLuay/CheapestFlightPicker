import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export function resolveAppPath(...segments: string[]): string {
  return path.resolve(currentDirectory, "..", "..", ...segments);
}

export function resolveRuntimeDataPath(...segments: string[]): string {
  const runtimeBasePath = process.env.CHEAPEST_FLIGHT_PICKER_RUNTIME_DIR
    ? path.resolve(process.env.CHEAPEST_FLIGHT_PICKER_RUNTIME_DIR)
    : process.env.VERCEL
      ? path.join(os.tmpdir(), "cheapest-flight-picker")
      : resolveAppPath();

  return path.resolve(runtimeBasePath, ...segments);
}
