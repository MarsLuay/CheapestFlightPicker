import { AsyncLocalStorage } from "node:async_hooks";

const searchAbortStorage = new AsyncLocalStorage<AbortSignal | undefined>();

export function getActiveSearchAbortSignal(): AbortSignal | undefined {
  return searchAbortStorage.getStore();
}

export function runWithSearchAbortSignal<T>(
  signal: AbortSignal | undefined,
  work: () => T
): T {
  return searchAbortStorage.run(signal, work);
}
