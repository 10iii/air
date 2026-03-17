import { describe, expect, it } from "vitest";
import {
  BaiduEngine,
  BingEngine,
  DuckDuckGoEngine,
  SogouEngine,
  getEnginesForRegion,
} from "../search/engines.js";

describe("BaiduEngine", () => {
  it("has name 'baidu'", () => {
    const engine = new BaiduEngine();
    expect(engine.name).toBe("baidu");
  });

  it("available() returns true", () => {
    const engine = new BaiduEngine();
    expect(engine.available()).toBe(true);
  });

  it("search() throws 'Not implemented - requires network'", async () => {
    const engine = new BaiduEngine();
    await expect(engine.search("test")).rejects.toThrow(
      "Not implemented - requires network",
    );
  });

  it("search() throws even with options provided", async () => {
    const engine = new BaiduEngine();
    await expect(
      engine.search("test", { maxResults: 5, safeSearch: "moderate" }),
    ).rejects.toThrow("Not implemented");
  });
});

describe("BingEngine", () => {
  it("has name 'bing'", () => {
    const engine = new BingEngine();
    expect(engine.name).toBe("bing");
  });

  it("available() returns true", () => {
    const engine = new BingEngine();
    expect(engine.available()).toBe(true);
  });

  it("search() throws 'Not implemented - requires network'", async () => {
    const engine = new BingEngine();
    await expect(engine.search("typescript")).rejects.toThrow(
      "Not implemented - requires network",
    );
  });

  it("search() returns a rejected promise, not a synchronous throw", async () => {
    const engine = new BingEngine();
    const promise = engine.search("test");
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toThrow();
  });
});

describe("DuckDuckGoEngine", () => {
  it("has name 'duckduckgo'", () => {
    const engine = new DuckDuckGoEngine();
    expect(engine.name).toBe("duckduckgo");
  });

  it("available() returns true", () => {
    const engine = new DuckDuckGoEngine();
    expect(engine.available()).toBe(true);
  });

  it("search() throws 'Not implemented - requires network'", async () => {
    const engine = new DuckDuckGoEngine();
    await expect(engine.search("query")).rejects.toThrow(
      "Not implemented - requires network",
    );
  });

  it("search() accepts all EngineSearchOptions fields", async () => {
    const engine = new DuckDuckGoEngine();
    await expect(
      engine.search("query", { maxResults: 10, safeSearch: "strict", region: "us" }),
    ).rejects.toThrow("Not implemented");
  });
});

describe("SogouEngine", () => {
  it("has name 'sogou'", () => {
    const engine = new SogouEngine();
    expect(engine.name).toBe("sogou");
  });

  it("available() returns true", () => {
    const engine = new SogouEngine();
    expect(engine.available()).toBe(true);
  });

  it("search() throws 'Not implemented - requires network'", async () => {
    const engine = new SogouEngine();
    await expect(engine.search("搜索")).rejects.toThrow(
      "Not implemented - requires network",
    );
  });
});

describe("getEnginesForRegion — china", () => {
  it("returns 3 engines for china region", () => {
    const engines = getEnginesForRegion("china");
    expect(engines).toHaveLength(3);
  });

  it("includes BaiduEngine for china", () => {
    const engines = getEnginesForRegion("china");
    expect(engines.some((e) => e.name === "baidu")).toBe(true);
  });

  it("includes BingEngine for china", () => {
    const engines = getEnginesForRegion("china");
    expect(engines.some((e) => e.name === "bing")).toBe(true);
  });

  it("includes SogouEngine for china", () => {
    const engines = getEnginesForRegion("china");
    expect(engines.some((e) => e.name === "sogou")).toBe(true);
  });

  it("does not include DuckDuckGoEngine for china", () => {
    const engines = getEnginesForRegion("china");
    expect(engines.some((e) => e.name === "duckduckgo")).toBe(false);
  });

  it("returns engines in order: baidu, bing, sogou", () => {
    const engines = getEnginesForRegion("china");
    expect(engines[0].name).toBe("baidu");
    expect(engines[1].name).toBe("bing");
    expect(engines[2].name).toBe("sogou");
  });
});

describe("getEnginesForRegion — global", () => {
  it("returns 2 engines for global region", () => {
    const engines = getEnginesForRegion("global");
    expect(engines).toHaveLength(2);
  });

  it("includes DuckDuckGoEngine for global", () => {
    const engines = getEnginesForRegion("global");
    expect(engines.some((e) => e.name === "duckduckgo")).toBe(true);
  });

  it("includes BingEngine for global", () => {
    const engines = getEnginesForRegion("global");
    expect(engines.some((e) => e.name === "bing")).toBe(true);
  });

  it("does not include BaiduEngine for global", () => {
    const engines = getEnginesForRegion("global");
    expect(engines.some((e) => e.name === "baidu")).toBe(false);
  });

  it("does not include SogouEngine for global", () => {
    const engines = getEnginesForRegion("global");
    expect(engines.some((e) => e.name === "sogou")).toBe(false);
  });

  it("returns engines in order: duckduckgo, bing", () => {
    const engines = getEnginesForRegion("global");
    expect(engines[0].name).toBe("duckduckgo");
    expect(engines[1].name).toBe("bing");
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

  it("all engines reject search with Error type", async () => {
    const engines = [
      new BaiduEngine(),
      new BingEngine(),
      new DuckDuckGoEngine(),
      new SogouEngine(),
    ];
    for (const engine of engines) {
      await expect(engine.search("test")).rejects.toBeInstanceOf(Error);
    }
  });
});
