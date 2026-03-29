import { describe, expect, it, vi, beforeEach } from "vitest";
import { mergeSearchResults, isSearchTool } from "../search-merge.js";

// Mock fetch for AIR search
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, init);
}

beforeEach(() => {
  mockFetch.mockReset();
});

// Sample Exa response
const EXA_RESPONSE = JSON.stringify({
  autopromptString: "TypeScript best practices",
  results: [
    {
      title: "Exa Result 1",
      url: "https://example.com/exa1",
      snippet: "Exa snippet 1",
    },
    {
      title: "Exa Result 2",
      url: "https://example.com/exa2",
      text: "Exa text 2",
    },
  ],
});

// Sample AIR response (mocked via facts.airgo.dev)
const AIR_FACTS_RESPONSE = JSON.stringify({
  ok: true,
  results: [
    {
      url: "https://example.com/air1",
      title: "AIR Result 1",
      snippet: "AIR snippet 1",
      source: "webfetch",
      freshness: "2026-03-28",
      confidence: 0.9,
    },
    {
      // Duplicate URL with Exa
      url: "https://example.com/exa1",
      title: "Same as Exa 1",
      snippet: "Longer snippet from AIR that should be used",
      source: "webfetch",
      freshness: "2026-03-28",
      confidence: 0.8,
    },
  ],
  total: 2,
  query_time_ms: 10,
});

const BING_HTML = `<html><body>
  <div id="b_results">
    <li class="b_algo">
      <h2><a href="https://example.com/bing1">Bing Result 1</a></h2>
      <p>Bing snippet 1</p>
    </li>
  </div>
</body></html>`;

describe("isSearchTool", () => {
  it("returns true for websearch_ prefixed tools", () => {
    expect(isSearchTool("websearch_web_search_exa")).toBe(true);
    expect(isSearchTool("websearch_tavily")).toBe(true);
    expect(isSearchTool("websearch_anything")).toBe(true);
  });

  it("returns false for other tools", () => {
    expect(isSearchTool("bash")).toBe(false);
    expect(isSearchTool("read")).toBe(false);
    expect(isSearchTool("webfetch")).toBe(false);
    expect(isSearchTool("web_search")).toBe(false); // OpenClaw format
  });
});

describe("mergeSearchResults", () => {
  describe("tool name filtering", () => {
    it("returns null for non-search tools", async () => {
      const result = await mergeSearchResults("bash", "output", "query");
      expect(result).toBeNull();
    });

    it("processes websearch_ tools", async () => {
      // Mock all engines to return empty (no results)
      mockFetch.mockResolvedValue(mockResponse("[]"));

      const result = await mergeSearchResults(
        "websearch_web_search_exa",
        EXA_RESPONSE,
        "TypeScript",
      );

      // Should return something (even if just Exa results)
      expect(result).not.toBeNull();
      expect(result).toContain("Search Results");
    });
  });

  describe("result merging", () => {
    it("combines Exa and AIR results", async () => {
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();

        if (urlStr.includes("facts.airgo.dev")) {
          return Promise.resolve(mockResponse(AIR_FACTS_RESPONSE));
        }
        if (urlStr.includes("bing.com")) {
          return Promise.resolve(mockResponse(BING_HTML));
        }
        return Promise.resolve(mockResponse("[]"));
      });

      const result = await mergeSearchResults(
        "websearch_web_search_exa",
        EXA_RESPONSE,
        "TypeScript",
      );

      expect(result).not.toBeNull();
      // Should include both Exa and AIR results
      expect(result).toContain("Exa Result 1");
      expect(result).toContain("AIR Result 1");
      // Should show sources
      expect(result).toContain("Sources:");
    });

    it("deduplicates results by URL", async () => {
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();

        if (urlStr.includes("facts.airgo.dev")) {
          return Promise.resolve(mockResponse(AIR_FACTS_RESPONSE));
        }
        return Promise.resolve(mockResponse("[]"));
      });

      const result = await mergeSearchResults(
        "websearch_web_search_exa",
        EXA_RESPONSE,
        "TypeScript",
      );

      expect(result).not.toBeNull();
      // example.com/exa1 should appear only once
      const occurrences = (result!.match(/example\.com\/exa1/g) || []).length;
      expect(occurrences).toBe(1);
    });
  });

  describe("fallback behavior", () => {
    it("returns Exa results when AIR fails", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      // When AIR fails but Exa has results, we should still return Exa results
      // This ensures graceful degradation - user gets something rather than nothing
      const result = await mergeSearchResults(
        "websearch_web_search_exa",
        EXA_RESPONSE,
        "TypeScript",
      );

      // Should return Exa results even when AIR fails
      expect(result).not.toBeNull();
      expect(result).toContain("Exa Result 1");
      expect(result).toContain("Failed engines: duckduckgo, bing");
    });

    it("handles empty query gracefully", async () => {
      const result = await mergeSearchResults(
        "websearch_web_search_exa",
        "{}",
        "", // No query
      );

      expect(result).toBeNull();
    });
  });

  describe("output format", () => {
    it("includes metadata section", async () => {
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();

        if (urlStr.includes("facts.airgo.dev")) {
          return Promise.resolve(mockResponse(AIR_FACTS_RESPONSE));
        }
        return Promise.resolve(mockResponse("[]"));
      });

      const result = await mergeSearchResults(
        "websearch_web_search_exa",
        EXA_RESPONSE,
        "TypeScript",
      );

      expect(result).not.toBeNull();
      expect(result).toContain("[AIR Search Merge]");
      expect(result).toContain("Exa results:");
      expect(result).toContain("AIR engines:");
    });
  });
});
