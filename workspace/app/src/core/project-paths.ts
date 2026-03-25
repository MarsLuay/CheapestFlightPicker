import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export function resolveAppPath(...segments: string[]): string {
  return path.resolve(currentDirectory, "..", "..", ...segments);
}
