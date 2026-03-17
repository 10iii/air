import type { SearchResult } from "./aggregator.js";

export interface EngineSearchOptions {
  maxResults?: number;
  safeSearch?: "off" | "moderate" | "strict";
  region?: string;
}

export interface SearchEngine {
  name: string;
  available(): boolean;
  search(query: string, options?: EngineSearchOptions): Promise<SearchResult[]>;
}

export abstract class BaseSearchEngine implements SearchEngine {
  abstract readonly name: string;

  available(): boolean {
    return true;
  }

  abstract search(
    query: string,
    options?: EngineSearchOptions,
  ): Promise<SearchResult[]>;
}

export class BaiduEngine extends BaseSearchEngine {
  readonly name = "baidu";

  async search(
    _query: string,
    _options?: EngineSearchOptions,
  ): Promise<SearchResult[]> {
    throw new Error("Not implemented - requires network");
  }
}

export class BingEngine extends BaseSearchEngine {
  readonly name = "bing";

  async search(
    _query: string,
    _options?: EngineSearchOptions,
  ): Promise<SearchResult[]> {
    throw new Error("Not implemented - requires network");
  }
}

export class DuckDuckGoEngine extends BaseSearchEngine {
  readonly name = "duckduckgo";

  async search(
    _query: string,
    _options?: EngineSearchOptions,
  ): Promise<SearchResult[]> {
    throw new Error("Not implemented - requires network");
  }
}

export class SogouEngine extends BaseSearchEngine {
  readonly name = "sogou";

  async search(
    _query: string,
    _options?: EngineSearchOptions,
  ): Promise<SearchResult[]> {
    throw new Error("Not implemented - requires network");
  }
}

export function getEnginesForRegion(
  region: "china" | "global",
): SearchEngine[] {
  if (region === "china") {
    return [new BaiduEngine(), new BingEngine(), new SogouEngine()];
  }
  return [new DuckDuckGoEngine(), new BingEngine()];
}
