import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  BaiduEngine,
  BingEngine,
  DuckDuckGoEngine,
  SogouEngine,
  decodeBingUrl,
  getEnginesForRegion,
} from "../search/engines.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, init);
}

function mockRedirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Sample responses
// ---------------------------------------------------------------------------

const BAIDU_JSON = JSON.stringify({
  feed: {
    entry: [
      { title: "Result One", url: "https://example.com/1", abs: "First snippet" },
      { title: "Result Two", url: "https://example.com/2", abs: "Second snippet" },
      { title: "<b>HTML</b> &amp; Entities", url: "https://example.com/3", abs: "Has &lt;tags&gt;" },
    ],
  },
});

const BAIDU_HTML = `<html><body>
  <div id="content_left">
    <div class="result"><h3><a href="https://baidu.com/link?url=abc">Baidu HTML Result</a></h3>
      <div class="c-abstract">HTML fallback snippet</div>
    </div>
  </div>
</body></html>`;

const BING_HTML = `<html><body>
  <ol id="b_results">
    <li class="b_algo">
      <h2><a href="https://example.com/bing1">Bing Result 1</a></h2>
      <p>Bing snippet one</p>
    </li>
    <li class="b_algo">
      <h2><a href="https://www.bing.com/ck/a?u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS9iaW5nMg">Bing Result 2</a></h2>
      <p>Bing snippet two</p>
    </li>
    <li class="b_algo">
      <h2><a href="https://example.com/bing3">Bing Result 3</a></h2>
      <div class="b_caption"><p>Caption snippet</p></div>
    </li>
  </ol>
</body></html>`;

const SOGOU_HTML = `<html><body>
  <div class="rb">
    <h3 class="pt"><a href="/link?url=abc" data-url="https://example.com/sogou1">Sogou Standard</a></h3>
    <div class="str_info">Sogou snippet standard</div>
  </div>
  <div class="vrwrap">
    <h3 class="vr-title"><a href="https://example.com/sogou2">Sogou VRWrap</a></h3>
    <div class="space-txt">Sogou snippet vrwrap</div>
  </div>
  <div class="rb">
    <h3 class="pt"><a href="/link?url=def">Sogou Redirect Only</a></h3>
    <div class="str_info">No data-url attribute</div>
  </div>
</body></html>`;

// ---------------------------------------------------------------------------
// BaiduEngine
// ---------------------------------------------------------------------------

describe("BaiduEngine", () => {
  const engine = new BaiduEngine();

  it("has name 'baidu' and available() true", () => {
    expect(engine.name).toBe("baidu");
    expect(engine.available()).toBe(true);
  });

  it("parses JSON API response", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(BAIDU_JSON));

    const results = await engine.search("test");
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      title: "Result One",
      url: "https://example.com/1",
      snippet: "First snippet",
      position: 1,
    });
    expect(results[1].position).toBe(2);
    expect(results[2].position).toBe(3);
  });

  it("strips HTML entities from JSON results", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(BAIDU_JSON));

    const results = await engine.search("test");
    expect(results[2].title).toBe("HTML & Entities");
    expect(results[2].snippet).toBe("Has <tags>");
  });

  it("falls back to HTML parsing on invalid JSON", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(BAIDU_HTML));

    const results = await engine.search("test");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Baidu HTML Result");
    expect(results[0].snippet).toBe("HTML fallback snippet");
  });

  it("respects maxResults option", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(BAIDU_JSON));

    const results = await engine.search("test", { maxResults: 2 });
    expect(results).toHaveLength(2);
  });

  it("skips entries without title or url", async () => {
    const json = JSON.stringify({
      feed: {
        entry: [
          { title: "", url: "https://x.com", abs: "no title" },
          { title: "Good", url: "", abs: "no url" },
          { title: "Valid", url: "https://y.com", abs: "ok" },
        ],
      },
    });
    mockFetch.mockResolvedValueOnce(mockResponse(json));

    const results = await engine.search("test");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Valid");
  });

  it("uses title as snippet when abs is empty", async () => {
    const json = JSON.stringify({
      feed: { entry: [{ title: "Title Only", url: "https://x.com" }] },
    });
    mockFetch.mockResolvedValueOnce(mockResponse(json));

    const results = await engine.search("test");
    expect(results[0].snippet).toBe("Title Only");
  });

  it("throws on CAPTCHA redirect", async () => {
    mockFetch.mockResolvedValueOnce(
      mockRedirect("https://wappass.baidu.com/static/captcha/"),
    );

    await expect(engine.search("test")).rejects.toThrow("Baidu CAPTCHA");
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse("", { status: 500, statusText: "Internal Server Error" }),
    );

    await expect(engine.search("test")).rejects.toThrow("HTTP 500");
  });

  it("returns empty array for empty JSON feed", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(JSON.stringify({ feed: { entry: [] } })),
    );

    const results = await engine.search("test");
    expect(results).toEqual([]);
  });

  it("encodes query in URL", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(JSON.stringify({ feed: { entry: [] } })),
    );

    await engine.search("hello world");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("wd=hello%20world"),
      expect.any(Object),
    );
  });

  it("passes AbortSignal.timeout for request timeout", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse(JSON.stringify({ feed: { entry: [] } })),
    );

    await engine.search("test");
    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.signal).toBeDefined();
  });

  it("throws on unexpected (non-CAPTCHA) 302 redirect", async () => {
    mockFetch.mockResolvedValueOnce(
      mockRedirect("https://www.baidu.com/other-redirect"),
    );

    await expect(engine.search("test")).rejects.toThrow("unexpected redirect");
  });

  it("throws on fetch network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(engine.search("test")).rejects.toThrow("ECONNREFUSED");
  });

  it("decodes numeric HTML entities in JSON results", async () => {
    const json = JSON.stringify({
      feed: {
        entry: [
          {
            title: "Em&#x2014;dash &#8212; test",
            url: "https://example.com/entities",
            abs: "Chinese &#x4e2d;&#25991; test",
          },
        ],
      },
    });
    mockFetch.mockResolvedValueOnce(mockResponse(json));

    const results = await engine.search("test");
    expect(results[0].title).toBe("Em—dash — test");
    expect(results[0].snippet).toBe("Chinese 中文 test");
  });

  it("handles malformed numeric entities without crashing", async () => {
    const json = JSON.stringify({
      feed: {
        entry: [
          {
            title: "Malformed &#x; and &#xZZZZ; and &#; test",
            url: "https://example.com/malformed",
            abs: "ok",
          },
        ],
      },
    });
    mockFetch.mockResolvedValueOnce(mockResponse(json));

    const results = await engine.search("test");
    // &#x; and &#xZZZZ; don't match the [0-9a-fA-F]+ pattern, so they pass through
    // &#; doesn't match the &#(\d+); pattern either
    expect(results[0].title).toBe("Malformed &#x; and &#xZZZZ; and &#; test");
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// BingEngine
// ---------------------------------------------------------------------------

describe("BingEngine", () => {
  const engine = new BingEngine();

  it("has name 'bing' and available() true", () => {
    expect(engine.name).toBe("bing");
    expect(engine.available()).toBe(true);
  });

  it("parses HTML results", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(BING_HTML));

    const results = await engine.search("test");
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      title: "Bing Result 1",
      url: "https://example.com/bing1",
      snippet: "Bing snippet one",
      position: 1,
    });
  });

  it("decodes Bing tracking URLs in results", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(BING_HTML));

    const results = await engine.search("test");
    expect(results[1].url).toBe("https://example.com/bing2");
  });

  it("falls back to b_caption p for snippet", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(BING_HTML));

    const results = await engine.search("test");
    expect(results[2].snippet).toBe("Caption snippet");
  });

  it("respects maxResults", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(BING_HTML));

    const results = await engine.search("test", { maxResults: 1 });
    expect(results).toHaveLength(1);
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse("", { status: 403, statusText: "Forbidden" }),
    );

    await expect(engine.search("test")).rejects.toThrow("HTTP 403");
  });

  it("returns empty array when no .b_algo elements", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse("<html><body><ol id='b_results'></ol></body></html>"),
    );

    const results = await engine.search("test");
    expect(results).toEqual([]);
  });

  it("throws on fetch network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(engine.search("test")).rejects.toThrow("ECONNREFUSED");
  });
});

// ---------------------------------------------------------------------------
// decodeBingUrl
// ---------------------------------------------------------------------------

describe("decodeBingUrl", () => {
  it("decodes valid Bing tracking URL", () => {
    // "https://example.com/bing2" → base64url = "aHR0cHM6Ly9leGFtcGxlLmNvbS9iaW5nMg"
    const encoded = "https://www.bing.com/ck/a?u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS9iaW5nMg";
    expect(decodeBingUrl(encoded)).toBe("https://example.com/bing2");
  });

  it("returns original URL when no /ck/a pattern", () => {
    expect(decodeBingUrl("https://example.com/page")).toBe("https://example.com/page");
  });

  it("returns original when u param missing", () => {
    expect(decodeBingUrl("https://www.bing.com/ck/a?q=test")).toBe(
      "https://www.bing.com/ck/a?q=test",
    );
  });

  it("returns original when u param doesn't start with a1", () => {
    expect(decodeBingUrl("https://www.bing.com/ck/a?u=b2test")).toBe(
      "https://www.bing.com/ck/a?u=b2test",
    );
  });

  it("returns original on decode failure (non-URL result)", () => {
    // "bm90YXVybA" → base64 = "notaurl"
    expect(decodeBingUrl("https://www.bing.com/ck/a?u=a1bm90YXVybA")).toBe(
      "https://www.bing.com/ck/a?u=a1bm90YXVybA",
    );
  });

  it("handles URL with padding needed", () => {
    // "https://example.com" → base64url = "aHR0cHM6Ly9leGFtcGxlLmNvbQ" (needs == padding)
    const encoded = "https://www.bing.com/ck/a?u=a1aHR0cHM6Ly9leGFtcGxlLmNvbQ";
    expect(decodeBingUrl(encoded)).toBe("https://example.com");
  });
});

// ---------------------------------------------------------------------------
// SogouEngine
// ---------------------------------------------------------------------------

describe("SogouEngine", () => {
  const engine = new SogouEngine();

  it("has name 'sogou' and available() true", () => {
    expect(engine.name).toBe("sogou");
    expect(engine.available()).toBe(true);
  });

  it("parses standard .rb results with data-url", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SOGOU_HTML));

    const results = await engine.search("test");
    expect(results[0]).toEqual({
      title: "Sogou Standard",
      url: "https://example.com/sogou1",
      snippet: "Sogou snippet standard",
      position: 1,
    });
  });

  it("parses .vrwrap results with vr-title", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SOGOU_HTML));

    const results = await engine.search("test");
    expect(results[1]).toEqual({
      title: "Sogou VRWrap",
      url: "https://example.com/sogou2",
      snippet: "Sogou snippet vrwrap",
      position: 2,
    });
  });

  it("resolves /link?url= redirect URLs when no data-url", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SOGOU_HTML));

    const results = await engine.search("test");
    expect(results[2].url).toBe("https://www.sogou.com/link?url=def");
  });

  it("throws on CAPTCHA redirect", async () => {
    mockFetch.mockResolvedValueOnce(
      mockRedirect("https://www.sogou.com/antispider/verify"),
    );

    await expect(engine.search("test")).rejects.toThrow("Sogou CAPTCHA");
  });

  it("throws on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse("", { status: 503, statusText: "Service Unavailable" }),
    );

    await expect(engine.search("test")).rejects.toThrow("HTTP 503");
  });

  it("returns empty array when no matching elements", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse("<html><body></body></html>"),
    );

    const results = await engine.search("test");
    expect(results).toEqual([]);
  });

  it("respects maxResults", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(SOGOU_HTML));

    const results = await engine.search("test", { maxResults: 1 });
    expect(results).toHaveLength(1);
  });

  it("throws on unexpected (non-CAPTCHA) 302 redirect", async () => {
    mockFetch.mockResolvedValueOnce(
      mockRedirect("https://www.sogou.com/other-redirect"),
    );

    await expect(engine.search("test")).rejects.toThrow("unexpected redirect");
  });

  it("throws on fetch network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(engine.search("test")).rejects.toThrow("ECONNREFUSED");
  });
});

// ---------------------------------------------------------------------------
// DuckDuckGoEngine
// ---------------------------------------------------------------------------

describe("DuckDuckGoEngine", () => {
  const engine = new DuckDuckGoEngine();

  it("has name 'duckduckgo' and available() true", () => {
    expect(engine.name).toBe("duckduckgo");
    expect(engine.available()).toBe(true);
  });

  it("returns results from duck-duck-scrape", async () => {
    vi.doMock("duck-duck-scrape", () => ({
      SafeSearchType: { OFF: 0, MODERATE: 1, STRICT: 2 },
      search: vi.fn().mockResolvedValue({
        results: [
          { title: "DDG One", url: "https://ddg.com/1", description: "First DDG" },
          { title: "DDG Two", url: "https://ddg.com/2", description: "Second DDG" },
        ],
      }),
    }));

    const { DuckDuckGoEngine: DDG } = await import("../search/engines.js");
    const ddgEngine = new DDG();
    const results = await ddgEngine.search("test");

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "DDG One",
      url: "https://ddg.com/1",
      snippet: "First DDG",
      position: 1,
    });

    vi.doUnmock("duck-duck-scrape");
  });

  it("uses title as snippet when description is empty", async () => {
    vi.doMock("duck-duck-scrape", () => ({
      SafeSearchType: { OFF: 0, MODERATE: 1, STRICT: 2 },
      search: vi.fn().mockResolvedValue({
        results: [
          { title: "No Desc", url: "https://ddg.com/x", description: "" },
        ],
      }),
    }));

    const { DuckDuckGoEngine: DDG } = await import("../search/engines.js");
    const ddgEngine = new DDG();
    const results = await ddgEngine.search("test");
    expect(results[0].snippet).toBe("No Desc");

    vi.doUnmock("duck-duck-scrape");
  });

  it("respects maxResults", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      title: `R${i}`,
      url: `https://ddg.com/${i}`,
      description: `D${i}`,
    }));

    vi.doMock("duck-duck-scrape", () => ({
      SafeSearchType: { OFF: 0, MODERATE: 1, STRICT: 2 },
      search: vi.fn().mockResolvedValue({ results: many }),
    }));

    const { DuckDuckGoEngine: DDG } = await import("../search/engines.js");
    const ddgEngine = new DDG();
    const results = await ddgEngine.search("test", { maxResults: 5 });
    expect(results).toHaveLength(5);

    vi.doUnmock("duck-duck-scrape");
  });

  it("throws and sets _moduleAvailable=false when duck-duck-scrape import fails", async () => {
    vi.doMock("duck-duck-scrape", () => {
      throw new Error("Cannot find module 'duck-duck-scrape'");
    });

    const { DuckDuckGoEngine: DDG } = await import("../search/engines.js");
    const ddgEngine = new DDG();

    await expect(ddgEngine.search("test")).rejects.toThrow(
      "duck-duck-scrape not installed",
    );
    expect(ddgEngine.available()).toBe(false);

    vi.doUnmock("duck-duck-scrape");
    // Reset _moduleAvailable for other tests (static field)
    (DDG as any)._moduleAvailable = true;
  });

  it("maps safeSearch=off to SafeSearchType.OFF", async () => {
    const mockSearch = vi.fn().mockResolvedValue({ results: [] });
    vi.doMock("duck-duck-scrape", () => ({
      SafeSearchType: { OFF: -2, MODERATE: -1, STRICT: 1 },
      search: mockSearch,
    }));

    const { DuckDuckGoEngine: DDG } = await import("../search/engines.js");
    const ddgEngine = new DDG();
    await ddgEngine.search("test", { safeSearch: "off" });
    expect(mockSearch).toHaveBeenCalledWith("test", { safeSearch: -2 });

    vi.doUnmock("duck-duck-scrape");
  });

  it("maps safeSearch=strict to SafeSearchType.STRICT", async () => {
    const mockSearch = vi.fn().mockResolvedValue({ results: [] });
    vi.doMock("duck-duck-scrape", () => ({
      SafeSearchType: { OFF: -2, MODERATE: -1, STRICT: 1 },
      search: mockSearch,
    }));

    const { DuckDuckGoEngine: DDG } = await import("../search/engines.js");
    const ddgEngine = new DDG();
    await ddgEngine.search("test", { safeSearch: "strict" });
    expect(mockSearch).toHaveBeenCalledWith("test", { safeSearch: 1 });

    vi.doUnmock("duck-duck-scrape");
  });

  it("defaults safeSearch to MODERATE", async () => {
    const mockSearch = vi.fn().mockResolvedValue({ results: [] });
    vi.doMock("duck-duck-scrape", () => ({
      SafeSearchType: { OFF: -2, MODERATE: -1, STRICT: 1 },
      search: mockSearch,
    }));

    const { DuckDuckGoEngine: DDG } = await import("../search/engines.js");
    const ddgEngine = new DDG();
    await ddgEngine.search("test");
    expect(mockSearch).toHaveBeenCalledWith("test", { safeSearch: -1 });

    vi.doUnmock("duck-duck-scrape");
  });

  it("rejects with timeout error when duck-duck-scrape hangs", async () => {
    vi.doMock("duck-duck-scrape", () => ({
      SafeSearchType: { OFF: 0, MODERATE: 1, STRICT: 2 },
      search: vi.fn().mockReturnValue(new Promise(() => {})),
    }));

    const { DuckDuckGoEngine: DDG } = await import("../search/engines.js");
    const ddgEngine = new DDG();

    const searchPromise = ddgEngine.search("test");
    await expect(searchPromise).rejects.toThrow("timed out");

    vi.doUnmock("duck-duck-scrape");
  }, 15_000);
});

// ---------------------------------------------------------------------------
// getEnginesForRegion
// ---------------------------------------------------------------------------

describe("getEnginesForRegion — china", () => {
  it("returns 3 engines for china: baidu, bing, sogou", () => {
    const engines = getEnginesForRegion("china");
    expect(engines).toHaveLength(3);
    expect(engines.map((e) => e.name)).toEqual(["baidu", "bing", "sogou"]);
  });

  it("does not include duckduckgo for china", () => {
    const engines = getEnginesForRegion("china");
    expect(engines.some((e) => e.name === "duckduckgo")).toBe(false);
  });
});

describe("getEnginesForRegion — global", () => {
  it("returns 2 engines for global: duckduckgo, bing", () => {
    const engines = getEnginesForRegion("global");
    expect(engines).toHaveLength(2);
    expect(engines.map((e) => e.name)).toEqual(["duckduckgo", "bing"]);
  });

  it("does not include baidu or sogou for global", () => {
    const engines = getEnginesForRegion("global");
    expect(engines.some((e) => e.name === "baidu")).toBe(false);
    expect(engines.some((e) => e.name === "sogou")).toBe(false);
  });
});

describe("SearchEngine interface compliance", () => {
  it("all engines implement name, available, and search", () => {
    const engines = [
      new BaiduEngine(),
      new BingEngine(),
      new DuckDuckGoEngine(),
      new SogouEngine(),
    ];
    for (const engine of engines) {
      expect(typeof engine.name).toBe("string");
      expect(typeof engine.available).toBe("function");
      expect(typeof engine.search).toBe("function");
    }
  });

  it("all engines report available as true", () => {
    const engines = [
      new BaiduEngine(),
      new BingEngine(),
      new DuckDuckGoEngine(),
      new SogouEngine(),
    ];
    for (const engine of engines) {
      expect(engine.available()).toBe(true);
    }
  });
});
