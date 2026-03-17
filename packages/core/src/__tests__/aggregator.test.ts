import { describe, expect, it } from "vitest";
import {
  SearchAggregator,
  normalizeUrl,
} from "../search/aggregator.js";
import type { SearchResult } from "../search/aggregator.js";

const aggregator = new SearchAggregator();

function makeResult(overrides: Partial<SearchResult> & { url: string }): SearchResult {
  return {
    title: "Test Result",
    snippet: "Test snippet",
    position: 1,
    ...overrides,
  };
}

function makeMap(entries: [string, SearchResult[]][]): Map<string, SearchResult[]> {
  return new Map(entries);
}

describe("SearchAggregator — URL normalization", () => {
  it("strips www. prefix from hostname", () => {
    expect(normalizeUrl("https://www.example.com/page")).toBe(
      "https://example.com/page",
    );
  });

  it("removes trailing slash from path", () => {
    expect(normalizeUrl("https://example.com/page/")).toBe(
      "https://example.com/page",
    );
  });

  it("removes utm_source tracking parameter", () => {
    const result = normalizeUrl("https://example.com/page?utm_source=google");
    expect(result).not.toContain("utm_source");
  });

  it("removes utm_medium tracking parameter", () => {
    const result = normalizeUrl("https://example.com/page?utm_medium=cpc");
    expect(result).not.toContain("utm_medium");
  });

  it("removes utm_campaign tracking parameter", () => {
    const result = normalizeUrl("https://example.com/page?utm_campaign=spring");
    expect(result).not.toContain("utm_campaign");
  });

  it("removes utm_content tracking parameter", () => {
    const result = normalizeUrl("https://example.com/page?utm_content=banner");
    expect(result).not.toContain("utm_content");
  });

  it("removes ref tracking parameter", () => {
    const result = normalizeUrl("https://example.com/page?ref=twitter");
    expect(result).not.toContain("ref=");
  });

  it("removes fbclid tracking parameter", () => {
    const result = normalizeUrl("https://example.com/page?fbclid=abc123");
    expect(result).not.toContain("fbclid");
  });

  it("removes gclid tracking parameter", () => {
    const result = normalizeUrl("https://example.com/page?gclid=xyz789");
    expect(result).not.toContain("gclid");
  });

  it("preserves non-tracking query parameters", () => {
    const result = normalizeUrl("https://example.com/search?q=test&page=2");
    expect(result).toContain("q=test");
    expect(result).toContain("page=2");
  });

  it("returns original string for invalid URLs", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url");
  });

  it("preserves hash fragments", () => {
    const result = normalizeUrl("https://example.com/page#section1");
    expect(result).toContain("#section1");
  });

  it("handles URLs with port numbers", () => {
    const result = normalizeUrl("https://example.com:8080/api");
    expect(result).toContain(":8080");
    expect(result).toContain("/api");
  });

  it("removes multiple tracking params at once while preserving others", () => {
    const result = normalizeUrl(
      "https://example.com/page?q=test&utm_source=google&utm_medium=cpc&page=2",
    );
    expect(result).toContain("q=test");
    expect(result).toContain("page=2");
    expect(result).not.toContain("utm_source");
    expect(result).not.toContain("utm_medium");
  });

  it("preserves root trailing slash", () => {
    const result = normalizeUrl("https://example.com/");
    expect(result).toBe("https://example.com/");
  });

  it("strips www. and trailing slash together", () => {
    const result = normalizeUrl("https://www.example.com/path/");
    expect(result).toBe("https://example.com/path");
  });
});

describe("SearchAggregator — deduplication", () => {
  it("merges results with identical normalized URLs from different engines", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["bing", [makeResult({ url: "https://www.example.com/page", position: 1 })]],
        ["duckduckgo", [makeResult({ url: "https://example.com/page", position: 2 })]],
      ]),
    );
    expect(results).toHaveLength(1);
    expect(results[0].sources).toContain("bing");
    expect(results[0].sources).toContain("duckduckgo");
  });

  it("keeps longer snippet when merging duplicates", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["bing", [makeResult({ url: "https://example.com/page", snippet: "Short", position: 1 })]],
        ["duckduckgo", [makeResult({ url: "https://example.com/page", snippet: "A much longer snippet with more detail", position: 2 })]],
      ]),
    );
    expect(results[0].snippet).toBe("A much longer snippet with more detail");
  });

  it("accumulates sources list when merging duplicates", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["bing", [makeResult({ url: "https://example.com/page", position: 1 })]],
        ["duckduckgo", [makeResult({ url: "https://example.com/page", position: 2 })]],
        ["baidu", [makeResult({ url: "https://example.com/page", position: 3 })]],
      ]),
    );
    expect(results[0].sources).toHaveLength(3);
    expect(results[0].sources).toEqual(expect.arrayContaining(["bing", "duckduckgo", "baidu"]));
  });

  it("does not merge results with different normalized URLs", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["bing", [
          makeResult({ url: "https://example.com/page1", position: 1 }),
          makeResult({ url: "https://example.com/page2", position: 2 }),
        ]],
      ]),
    );
    expect(results).toHaveLength(2);
  });

  it("treats http and https versions of same URL as different", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["bing", [makeResult({ url: "http://example.com/page", position: 1 })]],
        ["duckduckgo", [makeResult({ url: "https://example.com/page", position: 1 })]],
      ]),
    );
    expect(results).toHaveLength(2);
  });

  it("merges URLs that differ only by tracking params", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["bing", [makeResult({ url: "https://example.com/page?utm_source=bing", position: 1 })]],
        ["duckduckgo", [makeResult({ url: "https://example.com/page?utm_source=ddg", position: 2 })]],
      ]),
    );
    expect(results).toHaveLength(1);
  });
});

describe("SearchAggregator — scoring", () => {
  it("assigns higher score to position-1 result than position-10", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["duckduckgo", [
          makeResult({ url: "https://first.com", position: 1 }),
          makeResult({ url: "https://tenth.com", position: 10 }),
        ]],
      ]),
    );
    const first = results.find((r) => r.url === "https://first.com");
    const tenth = results.find((r) => r.url === "https://tenth.com");
    expect(first!.score).toBeGreaterThan(tenth!.score);
  });

  it("applies bing engine weight of 1.1", () => {
    const bingResults = aggregator.aggregate(
      makeMap([["bing", [makeResult({ url: "https://a.com", position: 1 })]]]),
    );
    const ddgResults = aggregator.aggregate(
      makeMap([["duckduckgo", [makeResult({ url: "https://a.com", position: 1 })]]]),
    );
    expect(bingResults[0].score).toBeGreaterThan(ddgResults[0].score);
  });

  it("applies duckduckgo engine weight of 1.0", () => {
    const results = aggregator.aggregate(
      makeMap([["duckduckgo", [makeResult({ url: "https://a.com", position: 1 })]]]),
    );
    expect(results[0].score).toBe(1.0);
  });

  it("applies baidu engine weight of 1.0", () => {
    const results = aggregator.aggregate(
      makeMap([["baidu", [makeResult({ url: "https://a.com", position: 1 })]]]),
    );
    expect(results[0].score).toBe(1.0);
  });

  it("applies sogou engine weight of 0.9", () => {
    const results = aggregator.aggregate(
      makeMap([["sogou", [makeResult({ url: "https://a.com", position: 1 })]]]),
    );
    expect(results[0].score).toBe(0.9);
  });

  it("applies 1.5x bonus for results appearing in multiple engines", () => {
    const singleEngine = aggregator.aggregate(
      makeMap([["duckduckgo", [makeResult({ url: "https://a.com", position: 1 })]]]),
    );
    const multiEngine = aggregator.aggregate(
      makeMap([
        ["duckduckgo", [makeResult({ url: "https://a.com", position: 1 })]],
        ["bing", [makeResult({ url: "https://a.com", position: 1 })]],
      ]),
    );
    const singleScore = singleEngine[0].score;
    const expectedMultiScore = (1.0 + 1.1) * 1.5;
    expect(multiEngine[0].score).toBe(Math.round(expectedMultiScore * 1000) / 1000);
    expect(multiEngine[0].score).toBeGreaterThan(singleScore);
  });

  it("sorts results by descending score", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["duckduckgo", [
          makeResult({ url: "https://low.com", position: 10 }),
          makeResult({ url: "https://high.com", position: 1 }),
          makeResult({ url: "https://mid.com", position: 5 }),
        ]],
      ]),
    );
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("applies default weight 1.0 for unknown engine names", () => {
    const results = aggregator.aggregate(
      makeMap([["yandex", [makeResult({ url: "https://a.com", position: 1 })]]]),
    );
    expect(results[0].score).toBe(1.0);
  });

  it("score formula: (1/position) * weight * multi-engine-bonus", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["bing", [makeResult({ url: "https://a.com", position: 2 })]],
        ["duckduckgo", [makeResult({ url: "https://a.com", position: 3 })]],
      ]),
    );
    const expected = ((1 / 2) * 1.1 + (1 / 3) * 1.0) * 1.5;
    expect(results[0].score).toBe(Math.round(expected * 1000) / 1000);
  });
});

describe("SearchAggregator — result limiting", () => {
  it("limits output to maxResults parameter", () => {
    const manyResults: SearchResult[] = Array.from({ length: 20 }, (_, i) =>
      makeResult({ url: `https://example.com/page-${i}`, position: i + 1 }),
    );
    const results = aggregator.aggregate(
      makeMap([["duckduckgo", manyResults]]),
      { maxResults: 5 },
    );
    expect(results).toHaveLength(5);
  });

  it("defaults to 10 results when maxResults is omitted", () => {
    const manyResults: SearchResult[] = Array.from({ length: 20 }, (_, i) =>
      makeResult({ url: `https://example.com/page-${i}`, position: i + 1 }),
    );
    const results = aggregator.aggregate(makeMap([["duckduckgo", manyResults]]));
    expect(results).toHaveLength(10);
  });

  it("returns all results when fewer than maxResults available", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["duckduckgo", [
          makeResult({ url: "https://a.com", position: 1 }),
          makeResult({ url: "https://b.com", position: 2 }),
        ]],
      ]),
      { maxResults: 50 },
    );
    expect(results).toHaveLength(2);
  });
});

describe("SearchAggregator — edge cases", () => {
  it("handles empty engine results map", () => {
    const results = aggregator.aggregate(new Map());
    expect(results).toEqual([]);
  });

  it("handles single engine with no results", () => {
    const results = aggregator.aggregate(makeMap([["duckduckgo", []]]));
    expect(results).toEqual([]);
  });

  it("handles results with empty titles and snippets", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["duckduckgo", [
          makeResult({ url: "https://example.com", title: "", snippet: "", position: 1 }),
        ]],
      ]),
    );
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("");
    expect(results[0].snippet).toBe("");
  });

  it("handles extremely long URLs", () => {
    const longPath = "a".repeat(2000);
    const results = aggregator.aggregate(
      makeMap([
        ["duckduckgo", [
          makeResult({ url: `https://example.com/${longPath}`, position: 1 }),
        ]],
      ]),
    );
    expect(results).toHaveLength(1);
    expect(results[0].url).toContain(longPath);
  });

  it("handles unicode URLs", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["baidu", [
          makeResult({ url: "https://example.com/日本語パス", position: 1 }),
        ]],
      ]),
    );
    expect(results).toHaveLength(1);
  });

  it("handles multiple engines with overlapping and unique results", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["bing", [
          makeResult({ url: "https://shared.com", position: 1 }),
          makeResult({ url: "https://bing-only.com", position: 2 }),
        ]],
        ["duckduckgo", [
          makeResult({ url: "https://shared.com", position: 1 }),
          makeResult({ url: "https://ddg-only.com", position: 2 }),
        ]],
      ]),
    );
    expect(results).toHaveLength(3);
    const shared = results.find((r) => r.url === "https://shared.com");
    expect(shared!.sources).toHaveLength(2);
  });

  it("does not duplicate sources when same engine appears twice", () => {
    const map = new Map<string, SearchResult[]>();
    map.set("bing", [
      makeResult({ url: "https://example.com", position: 1 }),
      makeResult({ url: "https://example.com", position: 3 }),
    ]);
    const results = aggregator.aggregate(map);
    expect(results[0].sources).toEqual(["bing"]);
  });

  it("handles position=0 without division by zero", () => {
    const results = aggregator.aggregate(
      makeMap([
        ["duckduckgo", [makeResult({ url: "https://zero.com", position: 0 })]],
      ]),
    );
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(Number.isFinite(results[0].score)).toBe(true);
  });
});
