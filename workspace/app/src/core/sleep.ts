export function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason !== undefined ? signal.reason : new DOMException("Aborted", "AbortError"));
  }

  if (delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const schedule =
      typeof globalThis.setTimeout === "function"
        ? globalThis.setTimeout.bind(globalThis)
        : setTimeout;
    const cancel =
      typeof globalThis.clearTimeout === "function"
        ? globalThis.clearTimeout.bind(globalThis)
        : clearTimeout;

    const timeout = schedule(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);

    function handleAbort() {
      cancel(timeout);
      signal?.removeEventListener("abort", handleAbort);
      reject(new DOMException("Aborted", "AbortError"));
    }

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}
