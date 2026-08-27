import reactPackage from "react/package.json";
import reactDomPackage from "react-dom/package.json";
import { describe, expect, it } from "vitest";

describe("React runtime dependencies", () => {
  it("keeps React and React DOM on the same version", () => {
    expect(reactDomPackage.version).toBe(reactPackage.version);
  });
});
