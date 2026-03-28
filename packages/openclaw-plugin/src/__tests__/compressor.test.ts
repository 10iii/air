/**
 * Tests for AIR Compressor Routing
 */

import { describe, it, expect } from "vitest";
import {
  selectCompressor,
  shouldCompress,
  getCompressedTools,
} from "../compressor.js";

describe("Compressor Routing", () => {
  describe("selectCompressor", () => {
    it("should return a compressor for 'exec'", () => {
      const compressor = selectCompressor("exec");
      expect(compressor).not.toBeNull();
      expect(typeof compressor!.compress).toBe("function");
    });

    it("should return a compressor for 'process'", () => {
      const compressor = selectCompressor("process");
      expect(compressor).not.toBeNull();
      expect(typeof compressor!.compress).toBe("function");
    });

    it("should return a compressor for 'read'", () => {
      const compressor = selectCompressor("read");
      expect(compressor).not.toBeNull();
      expect(typeof compressor!.compress).toBe("function");
    });

    it("should return a compressor for 'browser'", () => {
      const compressor = selectCompressor("browser");
      expect(compressor).not.toBeNull();
      expect(typeof compressor!.compress).toBe("function");
    });

    it("should return a compressor for 'web_fetch'", () => {
      const compressor = selectCompressor("web_fetch");
      expect(compressor).not.toBeNull();
      expect(typeof compressor!.compress).toBe("function");
    });

    it("should return a compressor for 'web_search'", () => {
      const compressor = selectCompressor("web_search");
      expect(compressor).not.toBeNull();
      expect(typeof compressor!.compress).toBe("function");
    });

    it("should return null for 'air_on'", () => {
      expect(selectCompressor("air_on")).toBeNull();
    });

    it("should return null for 'air_off'", () => {
      expect(selectCompressor("air_off")).toBeNull();
    });

    it("should return null for unlisted tools", () => {
      expect(selectCompressor("write")).toBeNull();
      expect(selectCompressor("edit")).toBeNull();
      expect(selectCompressor("canvas")).toBeNull();
      expect(selectCompressor("sessions_history")).toBeNull();
      expect(selectCompressor("memory_add")).toBeNull();
    });

    it("should be case-insensitive", () => {
      expect(selectCompressor("EXEC")).not.toBeNull();
      expect(selectCompressor("Read")).not.toBeNull();
      expect(selectCompressor("WEB_FETCH")).not.toBeNull();
    });

    it("should actually compress content", () => {
      const compressor = selectCompressor("exec");
      expect(compressor).not.toBeNull();

      const longContent = "This is a test line\n".repeat(100);
      const result = compressor!.compress(longContent);
      expect(result.output).toBeDefined();
      expect(typeof result.output).toBe("string");
    });
  });

  describe("shouldCompress", () => {
    it("should return true when gain >= minGain", () => {
      const original = "x".repeat(500);
      const compressed = "x".repeat(200);
      expect(shouldCompress(original, compressed, 200)).toBe(true);
    });

    it("should return false when gain < minGain", () => {
      const original = "x".repeat(300);
      const compressed = "x".repeat(200);
      expect(shouldCompress(original, compressed, 200)).toBe(false);
    });

    it("should return false when compressed is larger", () => {
      const original = "x".repeat(100);
      const compressed = "x".repeat(200);
      expect(shouldCompress(original, compressed, 200)).toBe(false);
    });

    it("should use default minGain of 200", () => {
      const original = "x".repeat(400);
      const compressed = "x".repeat(200);
      expect(shouldCompress(original, compressed)).toBe(true);

      const original2 = "x".repeat(300);
      const compressed2 = "x".repeat(150);
      expect(shouldCompress(original2, compressed2)).toBe(false);
    });
  });

  describe("getCompressedTools", () => {
    it("should return list of whitelisted tools", () => {
      const tools = getCompressedTools();
      expect(tools).toContain("exec");
      expect(tools).toContain("process");
      expect(tools).toContain("read");
      expect(tools).toContain("browser");
      expect(tools).toContain("web_fetch");
      expect(tools).toContain("web_search");
    });

    it("should not include unlisted tools", () => {
      const tools = getCompressedTools();
      expect(tools).not.toContain("write");
      expect(tools).not.toContain("edit");
      expect(tools).not.toContain("air_on");
    });
  });
});
