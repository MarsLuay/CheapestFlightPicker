import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { resolveRuntimeDataPath } from "./project-paths";

type CacheEnvelope<T> = {
  createdAt: number;
  expiresAt: number;
  value: T;
};

type JsonFileCacheOptions = {
  directoryPath?: string;
  directorySegments?: string[];
  ttlMs: number;
  maxEntries?: number;
  sweepIntervalMs?: number;
  version?: number | string;
};

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }

  if (value && typeof value === "object") {
    const normalizedObject: Record<string, unknown> = {};
    const record = value as Record<string, unknown>;

    for (const key of Object.keys(record).sort()) {
      const normalizedEntry = normalizeValue(record[key]);
      if (normalizedEntry !== undefined) {
        normalizedObject[key] = normalizedEntry;
      }
    }

    return normalizedObject;
  }

  return value;
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(normalizeValue(value)) ?? "null";
}

export class JsonFileCache<T> {
  private readonly directoryPath: string;

  private readonly ttlMs: number;

  private readonly maxEntries: number;

  private readonly sweepIntervalMs: number;

  private readonly version: number | string | undefined;

  private lastSweepAt = 0;

  private lastCreatedAt = 0;

  private readonly memoryCache = new Map<string, CacheEnvelope<T>>();

  constructor(options: JsonFileCacheOptions) {
    if (!options.directoryPath && !options.directorySegments) {
      throw new Error(
        "JsonFileCache requires either directoryPath or directorySegments"
      );
    }

    this.directoryPath =
      options.directoryPath ??
      resolveRuntimeDataPath(...(options.directorySegments ?? [".cache"]));
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries ?? 500;
    this.sweepIntervalMs = options.sweepIntervalMs ?? 1000 * 60 * 5;
    this.version = options.version;

    this.ensureDirectory();
  }

  get(keyParts: unknown): T | null {
    this.sweepIfNeeded();

    const filePath = this.getFilePath(keyParts);

    const cachedEnvelope = this.memoryCache.get(filePath);
    if (cachedEnvelope) {
      if (typeof cachedEnvelope.expiresAt !== "number" || Date.now() >= cachedEnvelope.expiresAt) {
        this.memoryCache.delete(filePath);
        fs.rmSync(filePath, { force: true });
        return null;
      }
      return cachedEnvelope.value;
    }

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const rawContents = fs.readFileSync(filePath, "utf8");
      const envelope = JSON.parse(rawContents) as CacheEnvelope<T>;

      if (typeof envelope.expiresAt !== "number" || Date.now() >= envelope.expiresAt) {
        this.memoryCache.delete(filePath);
        fs.rmSync(filePath, { force: true });
        return null;
      }

      this.memoryCache.set(filePath, envelope);
      return envelope.value;
    } catch {
      this.memoryCache.delete(filePath);
      fs.rmSync(filePath, { force: true });
      return null;
    }
  }

  set(keyParts: unknown, value: T): void {
    this.ensureDirectory();

    const now = Date.now();
    const createdAt =
      now <= this.lastCreatedAt ? this.lastCreatedAt + 1 : now;
    this.lastCreatedAt = createdAt;
    const envelope: CacheEnvelope<T> = {
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      value
    };

    const filePath = this.getFilePath(keyParts);

    this.memoryCache.set(filePath, envelope);

    fs.writeFileSync(
      filePath,
      JSON.stringify(envelope),
      "utf8"
    );

    this.sweepIfNeeded(true);
  }

  sweepExpired(): number {
    this.ensureDirectory();

    const removedEntries: string[] = [];
    const activeEntries: Array<{ createdAt: number; filePath: string }> = [];
    const now = Date.now();

    for (const entry of fs.readdirSync(this.directoryPath)) {
      if (!entry.endsWith(".json")) {
        continue;
      }

      const filePath = path.join(this.directoryPath, entry);

      try {
        let envelope = this.memoryCache.get(filePath);
        if (!envelope) {
          const rawContents = fs.readFileSync(filePath, "utf8");
          envelope = JSON.parse(rawContents) as CacheEnvelope<T>;
          this.memoryCache.set(filePath, envelope);
        }

        if (
          typeof envelope.expiresAt !== "number" ||
          typeof envelope.createdAt !== "number" ||
          now >= envelope.expiresAt
        ) {
          this.memoryCache.delete(filePath);
          fs.rmSync(filePath, { force: true });
          removedEntries.push(filePath);
          continue;
        }

        activeEntries.push({
          createdAt: envelope.createdAt,
          filePath
        });
      } catch {
        this.memoryCache.delete(filePath);
        fs.rmSync(filePath, { force: true });
        removedEntries.push(filePath);
      }
    }

    if (activeEntries.length > this.maxEntries) {
      const overflow = activeEntries.length - this.maxEntries;
      const entriesToRemove = activeEntries
        .sort((left, right) => left.createdAt - right.createdAt)
        .slice(0, overflow);

      for (const entry of entriesToRemove) {
        this.memoryCache.delete(entry.filePath);
        fs.rmSync(entry.filePath, { force: true });
        removedEntries.push(entry.filePath);
      }
    }

    for (const memPath of this.memoryCache.keys()) {
      if (!fs.existsSync(memPath)) {
        this.memoryCache.delete(memPath);
      }
    }

    this.lastSweepAt = now;
    return removedEntries.length;
  }

  private sweepIfNeeded(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastSweepAt < this.sweepIntervalMs) {
      return;
    }

    this.sweepExpired();
  }

  private ensureDirectory(): void {
    fs.mkdirSync(this.directoryPath, { recursive: true });
  }

  private getFilePath(keyParts: unknown): string {
    const digestKey =
      this.version === undefined
        ? keyParts
        : {
            keyParts,
            version: this.version
          };
    const digest = createHash("sha256")
      .update(stableSerialize(digestKey))
      .digest("hex");

    return path.join(this.directoryPath, `${digest}.json`);
  }
}
