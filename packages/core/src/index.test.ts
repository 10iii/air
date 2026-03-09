import { describe, it, expect } from "vitest";

describe("@10iii/air-core", () => {
  it("should export types successfully", async () => {
    const core = await import("./index.js");
    expect(core).toBeDefined();
  });
});
