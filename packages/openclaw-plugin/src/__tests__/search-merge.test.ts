/**
 * Tests for OpenClaw Search Merge functionality
 * 
 * Note: Tests that require mocking @10iii/air-core are marked for integration testing.
 * This is because dynamic imports with vi.doMock don't fully isolate the real module
 * when it's loaded via createRequire.
 */

import { describe, it, expect } from "vitest";
import { isSearchTool, mergeSearchResults } from "../search-merge.js";

// =============================================================================
// Test fixtures
// =============================================================================

const LLM_RESPONSE = JSON.stringify({
  query: "TypeScript best practices",
  results: [
    {
      title: "LLM Result 1",
      url: "https://example.com/llm1",
      snippet: "LLM snippet 1",
    },
    {
      title: "LLM Result 2",
      url: "https://example.com/llm2",
      description: "LLM description 2",
    },
  ],
});

// =============================================================================
// Tests
// =============================================================================

describe("isSearchTool", () => {
  it("returns true for web_search", () => {
    expect(isSearchTool("web_search")).toBe(true);
  });

  it("returns false for other tools", () => {
    expect(isSearchTool("websearch_exa")).toBe(false);
    expect(isSearchTool("bash")).toBe(false);
    expect(isSearchTool("read")).toBe(false);
    expect(isSearchTool("search")).toBe(false);
  });
});

describe("mergeSearchResults", () => {
  describe("tool name filtering", () => {
    it("returns null for non-search tools", async () => {
      const result = await mergeSearchResults(
        "bash",
        LLM_RESPONSE,
        "TypeScript",
      );
      expect(result).toBeNull();
    });

    it("processes web_search tool", async () => {
      // This will actually call AIR search, but that's ok for integration testing
      const result = await mergeSearchResults(
        "web_search",
        LLM_RESPONSE,
        "TypeScript",
      );
      expect(result).not.toBeNull();
      expect(result).toContain("Search Results");
    });
  });

  describe("result merging (integration)", () => {
    it("combines LLM and AIR results", async () => {
      const result = await mergeSearchResults(
        "web_search",
        LLM_RESPONSE,
        "TypeScript",
      );

      expect(result).not.toBeNull();
      // LLM results should be included
      expect(result).toContain("LLM Result 1");
      expect(result).toContain("LLM Result 2");
      // Should have AIR metadata
      expect(result).toContain("[AIR Search Merge]");
      expect(result).toContain("LLM results: 2");
    });
  });

  describe("edge cases", () => {
    it("handles empty query gracefully", async () => {
      const result = await mergeSearchResults(
        "web_search",
        "{}",
        "", // No query
      );

      expect(result).toBeNull();
    });

    it("handles malformed JSON gracefully", async () => {
      const result = await mergeSearchResults(
        "web_search",
        "not valid json",
        "TypeScript",
      );

      // Should still work with just the query
      expect(result).not.toBeNull();
    });

    it("handles empty results array", async () => {
      const emptyResponse = JSON.stringify({
        query: "obscure query",
        results: [],
      });

      const result = await mergeSearchResults(
        "web_search",
        emptyResponse,
        "obscure query",
      );

      // Should still return something from AIR
      expect(result).not.toBeNull();
    });
  });

  describe("output format", () => {
    it("includes metadata section", async () => {
      const result = await mergeSearchResults(
        "web_search",
        LLM_RESPONSE,
        "TypeScript",
      );

      expect(result).toContain("[AIR Search Merge]");
      expect(result).toContain("LLM results:");
      expect(result).toContain("AIR engines:");
    });

    it("formats results with title, URL, and snippet", async () => {
      const result = await mergeSearchResults(
        "web_search",
        LLM_RESPONSE,
        "TypeScript",
      );

      expect(result).toContain("## 1.");
      expect(result).toContain("URL:");
      expect(result).toContain("Sources:");
    });
  });
});
