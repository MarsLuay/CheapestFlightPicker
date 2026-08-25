import { afterEach, describe, expect, it } from "vitest";

import { getAdminAuthHeaders } from "./admin-auth";

describe("admin authentication headers", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow) {
      globalThis.window = originalWindow;
    } else {
      Reflect.deleteProperty(
        globalThis as typeof globalThis & { window?: Window },
        "window"
      );
    }
  });

  it("does not send a browser credential when no runtime token exists", () => {
    globalThis.window = {} as typeof globalThis & Window;

    expect(getAdminAuthHeaders()).toEqual({});
  });

  it("trims the runtime token and sends one canonical header", () => {
    globalThis.window = {
      __ADMIN_TOKEN__: "  test-token  "
    } as typeof globalThis & Window & { __ADMIN_TOKEN__: string };

    expect(getAdminAuthHeaders()).toEqual({ "x-admin-key": "test-token" });
  });
});
