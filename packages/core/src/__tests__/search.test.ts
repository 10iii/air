import { describe, expect, it } from "vitest";
import { SearchCompressor } from "../compressors/search.js";

const compressor = new SearchCompressor();

const sampleResults = [
  {
    title: "Advanced TypeScript Async Patterns",
    url: "https://example.com/ts-async",
    snippet: "Comprehensive guide to async/await, Promise.all, and error handling patterns in TypeScript.",
    sources: ["bing", "duckduckgo"],
    score: 2.7,
  },
  {
    title: "TypeScript Handbook - Async",
    url: "https://www.typescriptlang.org/docs/handbook/async.html",
    snippet: "Official documentation on async functions in TypeScript.",
    sources: ["duckduckgo"],
    score: 1.0,
  },
  {
    title: "Understanding Promises in JavaScript and TypeScript",
    url: "https://dev.to/promises-guide",
    snippet: "A deep dive into Promises, async/await, and practical patterns.",
    sources: ["bing"],
    score: 0.6,
  },
];

const sampleJson = JSON.stringify(sampleResults);

const minimalResult = JSON.stringify([
  { title: "Only Result", url: "https://only.com", snippet: "The one.", sources: ["duckduckgo"], score: 1.0 },
]);

const largeResults = Array.from({ length: 30 }, (_, i) => ({
  title: `Result ${i + 1}: A Fairly Long Title About Topic Number ${i + 1}`,
  url: `https://example.com/page-${i + 1}`,
  snippet: `This is the snippet for result number ${i + 1}, containing enough text to be meaningful.`,
  sources: i % 3 === 0 ? ["bing", "duckduckgo"] : ["duckduckgo"],
  score: 3.0 - i * 0.1,
}));
const largeJson = JSON.stringify(largeResults);

describe("SearchCompressor — output format", () => {
  it("produces CompressResult with output, originalSize, compressedSize, ratio, format=air-search", () => {
    const result = compressor.compress(sampleJson, { query: "typescript async" });
    expect(result).toHaveProperty("output");
    expect(result).toHaveProperty("originalSize");
    expect(result).toHaveProperty("compressedSize");
    expect(result).toHaveProperty("ratio");
    expect(result.format).toBe("air-search");
  });

  it("includes search query string in header line", () => {
    const result = compressor.compress(sampleJson, { query: "typescript async" });
    expect(result.output).toContain('Search: "typescript async"');
  });

  it("includes result count stats in header", () => {
    const result = compressor.compress(sampleJson, { query: "test" });
    expect(result.output).toContain("3 results");
  });

  it("includes engine count in header when multiple engines present", () => {
    const result = compressor.compress(sampleJson, { query: "test" });
    expect(result.output).toContain("2 engines");
  });

  it("shows singular 'engine' when only one engine", () => {
    const singleEngine = JSON.stringify([
      { title: "T", url: "https://a.com", snippet: "S", sources: ["bing"], score: 1 },
    ]);
    const result = compressor.compress(singleEngine, { query: "test" });
    expect(result.output).toContain("1 engine");
    expect(result.output).not.toContain("1 engines");
  });

  it("formats each result as numbered list with title, URL domain, snippet, and source tags", () => {
    const result = compressor.compress(sampleJson, { query: "test" });
    expect(result.output).toContain("1. **Advanced TypeScript Async Patterns** (example.com)");
    expect(result.output).toContain("Comprehensive guide to async/await");
    expect(result.output).toContain("Sources: bing, duckduckgo");
  });

  it("appends AIR stats footer with chars-saved percentage", () => {
    const result = compressor.compress(sampleJson, { query: "test" });
    expect(result.output).toContain("--- air:");
    expect(result.output).toMatch(/\d+% saved/);
  });

  it("formats domain by stripping www. prefix", () => {
    const result = compressor.compress(sampleJson, { query: "test" });
    expect(result.output).toContain("typescriptlang.org");
    expect(result.output).not.toContain("www.typescriptlang.org");
  });

  it("displays empty query as empty quotes when not provided", () => {
    const result = compressor.compress(sampleJson);
    expect(result.output).toContain('Search: ""');
  });
});

describe("SearchCompressor — result limiting", () => {
  it("limits output to maxResults when set to 5", () => {
    const result = compressor.compress(largeJson, { maxResults: 5, query: "test" });
    expect(result.output).toContain("5 results");
    const numbered = result.output.match(/^\d+\./gm);
    expect(numbered).toHaveLength(5);
  });

  it("defaults to 10 results when maxResults is omitted", () => {
    const result = compressor.compress(largeJson, { query: "test" });
    expect(result.output).toContain("10 results");
    const numbered = result.output.match(/^\d+\./gm);
    expect(numbered).toHaveLength(10);
  });

  it("handles input with fewer results than maxResults without error", () => {
    const result = compressor.compress(minimalResult, { maxResults: 50, query: "test" });
    expect(result.output).toContain("1 results");
    const numbered = result.output.match(/^\d+\./gm);
    expect(numbered).toHaveLength(1);
  });

  it("metadata reflects actual resultCount and maxResults", () => {
    const result = compressor.compress(largeJson, { maxResults: 5, query: "test" });
    expect(result.metadata?.resultCount).toBe(5);
    expect(result.metadata?.maxResults).toBe(5);
  });
});

describe("SearchCompressor — truncation", () => {
  it("applies maxLines truncation to output", () => {
    const result = compressor.compress(largeJson, { maxLines: 5, query: "test" });
    const lineCount = result.output.split("\n").length;
    expect(lineCount).toBeLessThanOrEqual(6);
  });

  it("applies maxTokens truncation to output", () => {
    const result = compressor.compress(largeJson, { maxTokens: 50, query: "test" });
    const tokenEstimate = Math.ceil(result.output.length / 4);
    expect(tokenEstimate).toBeLessThanOrEqual(100);
  });

  it("truncation includes omission indicator", () => {
    const result = compressor.compress(largeJson, { maxLines: 5, query: "test" });
    expect(result.output).toContain("omitted");
  });
});

describe("SearchCompressor — edge cases", () => {
  it("handles empty results array and shows 0 results", () => {
    const result = compressor.compress("[]", { query: "nothing" });
    expect(result.output).toContain("0 results");
  });

  it("handles invalid JSON input without throwing", () => {
    const result = compressor.compress("not json at all", { query: "test" });
    expect(result.output).toContain("0 results");
    expect(result.format).toBe("air-search");
  });

  it("handles result objects with missing title or snippet fields", () => {
    const incomplete = JSON.stringify([
      { url: "https://example.com", sources: ["bing"], score: 1 },
    ]);
    const result = compressor.compress(incomplete, { query: "test" });
    expect(result.output).toContain("(untitled)");
  });

  it("preserves unicode content in titles and snippets", () => {
    const unicode = JSON.stringify([
      { title: "日本語タイトル", url: "https://jp.example.com", snippet: "日本語の説明テキスト", sources: ["baidu"], score: 1 },
    ]);
    const result = compressor.compress(unicode, { query: "日本語" });
    expect(result.output).toContain("日本語タイトル");
    expect(result.output).toContain("日本語の説明テキスト");
  });

  it("preserves original URLs in output (not normalized)", () => {
    const result = compressor.compress(sampleJson, { query: "test" });
    expect(result.output).toContain("example.com");
    expect(result.output).toContain("typescriptlang.org");
  });

  it("never reports negative savedPercent in metadata", () => {
    const tiny = JSON.stringify([
      { title: "X", url: "https://x.com", snippet: "", sources: ["bing"], score: 1 },
    ]);
    const result = compressor.compress(tiny, { query: "test" });
    expect((result.metadata as Record<string, unknown>).savedPercent).toBeGreaterThanOrEqual(0);
  });

  it("handles non-array JSON without throwing", () => {
    const result = compressor.compress('{"not": "array"}', { query: "test" });
    expect(result.output).toContain("0 results");
  });

  it("handles results with empty sources array", () => {
    const noSources = JSON.stringify([
      { title: "Test", url: "https://example.com", snippet: "Snip", sources: [], score: 1 },
    ]);
    const result = compressor.compress(noSources, { query: "test" });
    expect(result.output).toContain("**Test**");
    expect(result.output).toContain("0 engines");
  });
});

describe("SearchCompressor — compression stats", () => {
  it("reports originalSize equal to input line count", () => {
    const result = compressor.compress(sampleJson, { query: "test" });
    expect(result.originalSize).toBe(sampleJson.split("\n").length);
  });

  it("reports compressedSize equal to compressed content line count", () => {
    const result = compressor.compress(sampleJson, { query: "test" });
    const contentLines = result.output.split("\n").filter((l) => !l.startsWith("--- air:"));
    expect(result.compressedSize).toBe(contentLines.length);
  });

  it("calculates ratio as compressedSize divided by originalSize", () => {
    const result = compressor.compress(sampleJson, { query: "test" });
    const expectedRatio = result.compressedSize / result.originalSize;
    expect(result.ratio).toBeCloseTo(expectedRatio, 5);
  });

  it("metadata includes resultCount, engineCount, maxResults", () => {
    const result = compressor.compress(sampleJson, { query: "test" });
    const meta = result.metadata as Record<string, unknown>;
    expect(meta.resultCount).toBe(3);
    expect(meta.engineCount).toBe(2);
    expect(meta.maxResults).toBe(10);
  });

  it("has valid ratio for empty input", () => {
    const result = compressor.compress("", { query: "test" });
    expect(result.ratio).toBe(result.compressedSize / result.originalSize);
  });

  it("treats negative maxLines as no limit", () => {
    const normal = compressor.compress(largeJson, { query: "test" });
    const neg = compressor.compress(largeJson, { maxLines: -5, query: "test" });
    expect(neg.output).toBe(normal.output);
  });

  it("treats negative maxTokens as no limit", () => {
    const normal = compressor.compress(largeJson, { query: "test" });
    const neg = compressor.compress(largeJson, { maxTokens: -100, query: "test" });
    expect(neg.output).toBe(normal.output);
  });
});
