import { describe, expect, it, vi } from "vitest";

import { createRateLimitMiddleware } from "./rate-limit";

function createResponseDouble() {
  return {
    json: vi.fn(),
    set: vi.fn(),
    status: vi.fn()
  };
}

describe("createRateLimitMiddleware", () => {
  it("allows requests until the limit is reached and then returns 429", () => {
    let now = 0;
    const middleware = createRateLimitMiddleware({
      maxRequests: 2,
      now: () => now,
      windowMs: 1000
    });
    const next = vi.fn();
    const request = {
      ip: "127.0.0.1"
    } as never;

    const firstResponse = createResponseDouble();
    firstResponse.status.mockReturnValue(firstResponse);
    middleware(request, firstResponse as never, next);

    const secondResponse = createResponseDouble();
    secondResponse.status.mockReturnValue(secondResponse);
    middleware(request, secondResponse as never, next);

    const thirdResponse = createResponseDouble();
    thirdResponse.status.mockReturnValue(thirdResponse);
    middleware(request, thirdResponse as never, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(thirdResponse.set).toHaveBeenCalledWith("Retry-After", "1");
    expect(thirdResponse.status).toHaveBeenCalledWith(429);
    expect(thirdResponse.json).toHaveBeenCalledWith({
      error: "Too many requests. Please slow down and try again shortly.",
      ok: false
    });
  });

  it("resets the window after the configured interval", () => {
    let now = 0;
    const middleware = createRateLimitMiddleware({
      maxRequests: 1,
      now: () => now,
      windowMs: 1000
    });
    const next = vi.fn();
    const request = {
      ip: "127.0.0.1"
    } as never;

    const firstResponse = createResponseDouble();
    firstResponse.status.mockReturnValue(firstResponse);
    middleware(request, firstResponse as never, next);

    now = 1001;

    const secondResponse = createResponseDouble();
    secondResponse.status.mockReturnValue(secondResponse);
    middleware(request, secondResponse as never, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(secondResponse.status).not.toHaveBeenCalled();
  });
});
