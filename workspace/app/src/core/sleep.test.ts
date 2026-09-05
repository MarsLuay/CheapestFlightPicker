import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sleep } from "./sleep";

describe("sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves immediately when delayMs is 0 or negative", async () => {
    const resolvedSpy = vi.fn();

    const p1 = sleep(0).then(resolvedSpy);
    const p2 = sleep(-100).then(resolvedSpy);

    await Promise.all([p1, p2]);

    expect(resolvedSpy).toHaveBeenCalledTimes(2);
  });

  it("resolves after the specified delayMs", async () => {
    let resolved = false;
    const promise = sleep(1000).then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);

    vi.advanceTimersByTime(999);
    await Promise.resolve(); // allow microtasks to flush
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(1);
    await promise;
    expect(resolved).toBe(true);
  });

  it("rejects immediately with AbortError if signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(sleep(1000, controller.signal)).rejects.toThrow(
      /aborted/i
    );
  });

  it("rejects immediately with AbortError if signal is already aborted, even when delayMs is 0 or negative", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(sleep(0, controller.signal)).rejects.toThrow(/aborted/i);
    await expect(sleep(-100, controller.signal)).rejects.toThrow(/aborted/i);
  });

  it("rejects with AbortError when signal is aborted mid-sleep", async () => {
    const controller = new AbortController();
    const sleepPromise = sleep(1000, controller.signal);

    vi.advanceTimersByTime(500);
    controller.abort();

    await expect(sleepPromise).rejects.toThrow(/aborted/i);
  });

  it("removes abort event listener upon completion", async () => {
    const controller = new AbortController();
    const removeEventListenerSpy = vi.spyOn(
      controller.signal,
      "removeEventListener"
    );

    const sleepPromise = sleep(500, controller.signal);
    vi.advanceTimersByTime(500);
    await sleepPromise;

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "abort",
      expect.any(Function)
    );
  });

  it("removes abort event listener upon aborting", async () => {
    const controller = new AbortController();
    const removeEventListenerSpy = vi.spyOn(
      controller.signal,
      "removeEventListener"
    );

    const sleepPromise = sleep(1000, controller.signal);
    controller.abort();

    await expect(sleepPromise).rejects.toThrow();
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "abort",
      expect.any(Function)
    );
  });
});
