import type { Request, RequestHandler } from "express";

type RateLimitOptions = {
  keyFn?: (request: Request) => string;
  maxRequests: number;
  message?: string;
  now?: () => number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  windowStartedAt: number;
};

function getDefaultKey(request: Request): string {
  return request.ip || "unknown";
}

export function createRateLimitMiddleware({
  keyFn = getDefaultKey,
  maxRequests,
  message = "Too many requests. Please slow down and try again shortly.",
  now = Date.now,
  windowMs
}: RateLimitOptions): RequestHandler {
  const entries = new Map<string, RateLimitEntry>();

  return (request, response, next) => {
    const currentTime = now();

    for (const [key, entry] of entries) {
      if (currentTime - entry.windowStartedAt >= windowMs) {
        entries.delete(key);
      }
    }

    const clientKey = keyFn(request);
    const currentEntry = entries.get(clientKey);

    if (!currentEntry || currentTime - currentEntry.windowStartedAt >= windowMs) {
      entries.set(clientKey, {
        count: 1,
        windowStartedAt: currentTime
      });
      next();
      return;
    }

    if (currentEntry.count >= maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowMs - (currentTime - currentEntry.windowStartedAt)) / 1000)
      );

      response.set("Retry-After", String(retryAfterSeconds));
      response.status(429).json({
        error: message,
        ok: false
      });
      return;
    }

    currentEntry.count += 1;
    next();
  };
}
