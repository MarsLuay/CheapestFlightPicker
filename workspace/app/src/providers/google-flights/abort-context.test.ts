import { describe, expect, it } from "vitest";
import {
  getActiveSearchAbortSignal,
  runWithSearchAbortSignal
} from "./abort-context";

describe("abort-context", () => {
  it("returns undefined when outside of search abort context", () => {
    expect(getActiveSearchAbortSignal()).toBeUndefined();
  });

  it("returns the active search abort signal inside runWithSearchAbortSignal", () => {
    const controller = new AbortController();
    const result = runWithSearchAbortSignal(controller.signal, () => {
      const activeSignal = getActiveSearchAbortSignal();
      expect(activeSignal).toBe(controller.signal);
      return "done";
    });

    expect(result).toBe("done");
  });

  it("returns undefined when runWithSearchAbortSignal is passed undefined", () => {
    const result = runWithSearchAbortSignal(undefined, () => {
      expect(getActiveSearchAbortSignal()).toBeUndefined();
      return "done";
    });

    expect(result).toBe("done");
  });

  it("restores outer context after runWithSearchAbortSignal finishes", () => {
    const outerController = new AbortController();
    const innerController = new AbortController();

    expect(getActiveSearchAbortSignal()).toBeUndefined();

    runWithSearchAbortSignal(outerController.signal, () => {
      expect(getActiveSearchAbortSignal()).toBe(outerController.signal);

      runWithSearchAbortSignal(innerController.signal, () => {
        expect(getActiveSearchAbortSignal()).toBe(innerController.signal);
      });

      expect(getActiveSearchAbortSignal()).toBe(outerController.signal);
    });

    expect(getActiveSearchAbortSignal()).toBeUndefined();
  });

  it("preserves abort signal across asynchronous operations", async () => {
    const controller = new AbortController();

    await runWithSearchAbortSignal(controller.signal, async () => {
      expect(getActiveSearchAbortSignal()).toBe(controller.signal);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(getActiveSearchAbortSignal()).toBe(controller.signal);
    });

    expect(getActiveSearchAbortSignal()).toBeUndefined();
  });
});
