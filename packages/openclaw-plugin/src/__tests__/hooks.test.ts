/**
 * Tests for AIR Hook Handler
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleToolResultPersist } from "../hooks.js";
import { reset, disable } from "../state.js";

// Mock compressor module
vi.mock("../compressor.js", () => ({
  selectCompressor: vi.fn((toolName: string) => {
    const whitelist = ["exec", "process", "read", "browser", "web_fetch", "web_search"];
    if (whitelist.includes(toolName.toLowerCase())) {
      return {
        compress: (content: string) => ({
          // Simulate 50% compression
          output: content.slice(0, Math.floor(content.length / 2)),
        }),
      };
    }
    return null;
  }),
  shouldCompress: vi.fn((original: string, compressed: string, minGain = 200) => {
    return original.length - compressed.length >= minGain;
  }),
}));

describe("Hook Handler", () => {
  beforeEach(() => {
    reset();
    vi.clearAllMocks();
  });

  describe("handleToolResultPersist", () => {
    it("should skip air_on tool", () => {
      const result = handleToolResultPersist({
        toolName: "air_on",
        message: { role: "tool", content: "test" },
      });
      expect(result).toEqual({});
    });

    it("should skip air_off tool", () => {
      const result = handleToolResultPersist({
        toolName: "air_off",
        message: { role: "tool", content: "test" },
      });
      expect(result).toEqual({});
    });

    it("should skip when compression is disabled", () => {
      disable(5);
      const result = handleToolResultPersist({
        toolName: "exec",
        message: { role: "tool", content: "x".repeat(1000) },
      });
      expect(result).toEqual({});
    });

    it("should decrement counter when disabled", () => {
      disable(2);
      handleToolResultPersist({
        toolName: "exec",
        message: { role: "tool", content: "x".repeat(1000) },
      });
      // After decrement, should still be disabled (1 remaining)
      const result2 = handleToolResultPersist({
        toolName: "exec",
        message: { role: "tool", content: "x".repeat(1000) },
      });
      // After second decrement, should auto-enable (0 remaining)
      // But this call was made while still disabled
      expect(result2).toEqual({});
    });

    it("should skip unlisted tools", () => {
      const result = handleToolResultPersist({
        toolName: "write",
        message: { role: "tool", content: "x".repeat(1000) },
      });
      expect(result).toEqual({});
    });

    it("should skip empty content", () => {
      const result = handleToolResultPersist({
        toolName: "exec",
        message: { role: "tool", content: "" },
      });
      expect(result).toEqual({});
    });

    it("should skip non-string content", () => {
      const result = handleToolResultPersist({
        toolName: "exec",
        message: { role: "tool", content: { data: "test" } },
      });
      expect(result).toEqual({});
    });

    it("should compress whitelisted tools", () => {
      const content = "x".repeat(1000);
      const result = handleToolResultPersist({
        toolName: "exec",
        message: { role: "tool", content },
      });

      expect(result.message).toBeDefined();
      expect(result.message!.content).toContain("[AIR: compressed");
      expect(result.message!.content).toContain("air_off() for raw");
    });

    it("should preserve other message properties", () => {
      const content = "x".repeat(1000);
      const result = handleToolResultPersist({
        toolName: "exec",
        message: { role: "tool", content, customProp: "value" },
      });

      expect(result.message).toBeDefined();
      expect(result.message!.role).toBe("tool");
      expect(result.message!.customProp).toBe("value");
    });

    it("should skip when gain is below threshold", () => {
      // Content too small for meaningful compression
      const content = "x".repeat(100);
      const result = handleToolResultPersist({
        toolName: "exec",
        message: { role: "tool", content },
      });
      expect(result).toEqual({});
    });

    it("should handle all whitelisted tools", () => {
      const tools = ["exec", "process", "read", "browser", "web_fetch", "web_search"];
      const content = "x".repeat(1000);

      for (const tool of tools) {
        reset();
        const result = handleToolResultPersist({
          toolName: tool,
          message: { role: "tool", content },
        });
        expect(result.message).toBeDefined();
        expect(result.message!.content).toContain("[AIR:");
      }
    });
  });
});
