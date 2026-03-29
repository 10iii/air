import { describe, expect, it, vi, beforeEach } from "vitest";
import { airSearch } from "../search/search.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, init);
}

beforeEach(() => {
  mockFetch.mockReset();
});

// Sample responses for mocking
const BING_HTML = `<html><body>
  <div id="b_results">
    <li class="b_algo">
      <h2><a href="https://example.com/bing1">Bing Result 1</a></h2>
      <p>Bing snippet 1</p>
    </li>
    <li class="b_algo">
      <h2><a href="https://example.com/bing2">Bing Result 2</a></h2>
      <p>Bing snippet 2</p>
    </li>
  </div>
</body></html>`;

const AIR_FACTS_RESPONSE = JSON.stringify({
  ok: true,
  results: [
    {
      url: "https://facts.example.com/1",
      title: "Facts Result 1",
      snippet: "Facts snippet 1",
      source: "webfetch",
      freshness: "2026-03-28",
      confidence: 0.9,
    },
  ],
  total: 1,
  query_time_ms: 10,
});

describe("airSearch", () => {
  describe("basic functionality", () => {
    it("returns results from multiple engines", async () => {
      // Mock AIR Facts
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();

        if (urlStr.includes("facts.airgo.dev")) {
          return Promise.resolve(mockResponse(AIR_FACTS_RESPONSE));
        }
        if (urlStr.includes("bing.com")) {
          return Promise.resolve(mockResponse(BING_HTML));
        }
        // DDG - return empty
        return Promise.resolve(mockResponse("[]"));
      });

      const result = await airSearch("test query", { maxResults: 5 });

      expect(result.results).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.successfulEngines.length).toBeGreaterThan(0);
      expect(result.totalTimeMs).toBeGreaterThan(0);
    });

    it("handles all engines failing gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await airSearch("test query");

      expect(result.results).toEqual([]);
      expect(result.failedEngines.length).toBeGreaterThan(0);
      expect(result.successfulEngines).toEqual([]);
    });

    it("respects maxResults option", async () => {
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

      const result = await airSearch("test", { maxResults: 2 });

      expect(result.results.length).toBeLessThanOrEqual(2);
    });

    it("respects timeout option", async () => {
      mockFetch.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(mockResponse(AIR_FACTS_RESPONSE));
          }, 5000); // 5 second delay
        });
      });

      const result = await airSearch("test", { timeout: 100 }); // 100ms timeout

      // Should timeout and return empty results
      expect(result.failedEngines.length).toBeGreaterThan(0);
    });
  });

  describe("result aggregation", () => {
    it("deduplicates results from multiple engines", async () => {
      // Both engines return the same URL
      const factsWithDupe = JSON.stringify({
        ok: true,
        results: [
          {
            url: "https://example.com/same",
            title: "Same Result",
            snippet: "Same snippet",
            source: "webfetch",
            freshness: "2026-03-28",
            confidence: 0.9,
          },
        ],
        total: 1,
        query_time_ms: 10,
      });

      const bingWithDupe = `<html><body>
        <div id="b_results">
          <li class="b_algo">
            <h2><a href="https://example.com/same">Same Result From Bing</a></h2>
            <p>Same snippet from Bing</p>
          </li>
        </div>
      </body></html>`;

      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();

        if (urlStr.includes("facts.airgo.dev")) {
          return Promise.resolve(mockResponse(factsWithDupe));
        }
        if (urlStr.includes("bing.com")) {
          return Promise.resolve(mockResponse(bingWithDupe));
        }
        return Promise.resolve(mockResponse("[]"));
      });

      const result = await airSearch("test", { maxResults: 10 });

      // Should have only 1 result (deduplicated)
      expect(result.results.length).toBe(1);
      // Sources should include both engines
      expect(result.results[0].sources).toContain("air-facts");
      expect(result.results[0].sources).toContain("bing");
    });
  });

  describe("metadata", () => {
    it("returns successful and failed engines", async () => {
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();

        if (urlStr.includes("facts.airgo.dev")) {
          return Promise.resolve(mockResponse(AIR_FACTS_RESPONSE));
        }
        // All other engines fail
        return Promise.reject(new Error("Engine failed"));
      });

      const result = await airSearch("test");

      expect(result.successfulEngines).toContain("air-facts");
      expect(result.failedEngines.length).toBeGreaterThan(0);
    });

    it("returns totalTimeMs", async () => {
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url.toString();

        if (urlStr.includes("facts.airgo.dev")) {
          return Promise.resolve(mockResponse(AIR_FACTS_RESPONSE));
        }
        return Promise.resolve(mockResponse("[]"));
      });

      const result = await airSearch("test");

      expect(typeof result.totalTimeMs).toBe("number");
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
