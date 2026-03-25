import { load } from "cheerio";
import type { SearchResult } from "./aggregator.js";

export interface EngineSearchOptions {
  maxResults?: number;
  safeSearch?: "off" | "moderate" | "strict";
  region?: string;
}

// ---------------------------------------------------------------------------
// AIR Facts — Crowdsourced fact database (highest priority)
// ---------------------------------------------------------------------------

const AIR_FACTS_ENDPOINT = "https://facts.airgo.dev/v1/search";
const AIR_FACTS_TIMEOUT_MS = 5_000; // Lower timeout for local-first search

interface AirFactsResponse {
  ok: boolean;
  results: Array<{
    url: string;
    title: string;
    snippet: string;
    source: string;
    freshness: string;
    confidence: number;
  }>;
  total: number;
  query_time_ms: number;
}

export class AirFactsEngine {
  readonly name = "air-facts";

  available(): boolean {
    return true;
  }

  async search(
    query: string,
    options?: EngineSearchOptions,
  ): Promise<SearchResult[]> {
    const maxResults = options?.maxResults ?? 10;
    const url = `${AIR_FACTS_ENDPOINT}?q=${encodeURIComponent(query)}&limit=${maxResults}`;

    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(AIR_FACTS_TIMEOUT_MS),
      });

      if (!res.ok) {
        // Silently fail for air-facts (best-effort)
        return [];
      }

      const data = (await res.json()) as AirFactsResponse;
      
      if (!data.ok || !data.results) {
        return [];
      }

      return data.results.map((r, i) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        position: i + 1,
      }));
    } catch {
      // Silently fail — air-facts is best-effort
      return [];
    }
  }
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

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 10_000;

/** Strip HTML tags and decode entities (named + numeric) */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#(\d+);/g, (_m, dec) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
    })
    .trim();
}

// ---------------------------------------------------------------------------
// Baidu — JSON API with HTML fallback
// ---------------------------------------------------------------------------

export class BaiduEngine extends BaseSearchEngine {
  readonly name = "baidu";

  async search(
    query: string,
    options?: EngineSearchOptions,
  ): Promise<SearchResult[]> {
    const maxResults = options?.maxResults ?? 10;
    const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${maxResults}&pn=0&tn=json`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: "application/json, text/plain, */*",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (res.status === 302) {
      const loc = res.headers.get("location") || "";
      if (loc.includes("wappass")) {
        throw new Error("Baidu CAPTCHA triggered");
      }
      throw new Error(`Baidu unexpected redirect: ${loc}`);
    }

    if (!res.ok) {
      throw new Error(`Baidu search failed: HTTP ${res.status}`);
    }

    const body = await res.text();

    // Try JSON first
    try {
      const data = JSON.parse(body) as {
        feed?: { entry?: Array<{ title?: string; url?: string; abs?: string }> };
      };
      return this.parseJson(data, maxResults);
    } catch {
      // Fallback to HTML parsing when Baidu returns HTML instead of JSON
      return this.parseHtml(body, maxResults);
    }
  }

  private parseJson(
    data: {
      feed?: { entry?: Array<{ title?: string; url?: string; abs?: string }> };
    },
    maxResults: number,
  ): SearchResult[] {
    const results: SearchResult[] = [];
    const entries = data?.feed?.entry ?? [];

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      if (!entry.title || !entry.url) continue;
      results.push({
        title: stripHtml(entry.title),
        url: entry.url,
        snippet: stripHtml(entry.abs || entry.title),
        position: results.length + 1,
      });
    }
    return results;
  }

  /** Fallback HTML parser for Baidu desktop results */
  private parseHtml(html: string, maxResults: number): SearchResult[] {
    const $ = load(html);
    const results: SearchResult[] = [];

    $("#content_left .result, #content_left .c-container").each((_i, el) => {
      if (results.length >= maxResults) return;
      const $el = $(el);
      const titleEl = $el.find("h3 a").first();
      const title = titleEl.text().trim();
      const href = titleEl.attr("href") || "";
      const snippet =
        $el.find(".c-abstract, .c-span-last").first().text().trim() || title;

      if (title && href) {
        results.push({ title, url: href, snippet, position: results.length + 1 });
      }
    });
    return results;
  }
}

// ---------------------------------------------------------------------------
// Bing — HTML scraping with base64 URL decode
// ---------------------------------------------------------------------------

/**
 * Decode Bing tracking URLs.
 * Format: `/ck/a?...&u=a1<BASE64URL>` → strip "a1", base64url-decode.
 */
export function decodeBingUrl(url: string): string {
  if (!url.includes("/ck/a")) return url;

  try {
    const parsed = new URL(url, "https://www.bing.com");
    const uParam = parsed.searchParams.get("u");
    if (!uParam?.startsWith("a1")) return url;

    const encoded = uParam.slice(2);
    // Add base64 padding
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    // base64url → base64
    const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(base64, "base64").toString("utf-8");

    if (decoded.startsWith("http")) return decoded;
  } catch {
    // fall through — return original
  }
  return url;
}

export class BingEngine extends BaseSearchEngine {
  readonly name = "bing";

  async search(
    query: string,
    options?: EngineSearchOptions,
  ): Promise<SearchResult[]> {
    const maxResults = options?.maxResults ?? 10;
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Bing search failed: HTTP ${res.status}`);
    }

    const html = await res.text();
    const $ = load(html);
    const results: SearchResult[] = [];

    $("#b_results .b_algo").each((_i, el) => {
      if (results.length >= maxResults) return;
      const $el = $(el);
      const titleEl = $el.find("h2 a").first();
      const title = titleEl.text().trim();
      let href = titleEl.attr("href") || "";
      const snippet =
        $el.find("p").first().text().trim() ||
        $el.find(".b_caption p").first().text().trim() ||
        title;

      href = decodeBingUrl(href);

      if (title && href) {
        results.push({ title, url: href, snippet, position: results.length + 1 });
      }
    });

    return results;
  }
}

// ---------------------------------------------------------------------------
// Sogou — HTML scraping
// ---------------------------------------------------------------------------

export class SogouEngine extends BaseSearchEngine {
  readonly name = "sogou";

  async search(
    query: string,
    options?: EngineSearchOptions,
  ): Promise<SearchResult[]> {
    const maxResults = options?.maxResults ?? 10;
    const url = `https://www.sogou.com/web?query=${encodeURIComponent(query)}&num=${maxResults}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (res.status === 302) {
      const loc = res.headers.get("location") || "";
      if (loc.includes("antispider")) {
        throw new Error("Sogou CAPTCHA triggered");
      }
      throw new Error(`Sogou unexpected redirect: ${loc}`);
    }

    if (!res.ok) {
      throw new Error(`Sogou search failed: HTTP ${res.status}`);
    }

    const html = await res.text();
    const $ = load(html);
    const results: SearchResult[] = [];

    $(".rb, .vrwrap").each((_i, el) => {
      if (results.length >= maxResults) return;
      const $el = $(el);

      // Standard results use h3.pt a, vrwrap results use h3.vr-title a
      let titleEl = $el.find("h3.pt a").first();
      if (!titleEl.length) {
        titleEl = $el.find("h3.vr-title a").first();
      }

      const title = titleEl.text().trim();
      // Prefer data-url (direct URL) over href (may be redirect)
      let href = titleEl.attr("data-url") || titleEl.attr("href") || "";

      // Resolve Sogou redirect URLs
      if (href.startsWith("/link?url=")) {
        href = `https://www.sogou.com${href}`;
      }

      const snippet =
        $el.find(".str_info, .space-txt, .str-text-info").first().text().trim() ||
        title;

      if (title && href) {
        results.push({
          title,
          url: href,
          snippet,
          position: results.length + 1,
        });
      }
    });

    return results;
  }
}

// ---------------------------------------------------------------------------
// DuckDuckGo — via duck-duck-scrape (optional dependency)
// ---------------------------------------------------------------------------

export class DuckDuckGoEngine extends BaseSearchEngine {
  readonly name = "duckduckgo";
  private static _moduleAvailable = true;

  available(): boolean {
    return DuckDuckGoEngine._moduleAvailable;
  }

  async search(
    query: string,
    options?: EngineSearchOptions,
  ): Promise<SearchResult[]> {
    const maxResults = options?.maxResults ?? 10;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ddg: any;
    try {
      ddg = await import("duck-duck-scrape");
      DuckDuckGoEngine._moduleAvailable = true;
    } catch {
      DuckDuckGoEngine._moduleAvailable = false;
      throw new Error(
        "duck-duck-scrape not installed — run: npm install duck-duck-scrape",
      );
    }

    const safeSearch =
      options?.safeSearch === "off"
        ? ddg.SafeSearchType.OFF
        : options?.safeSearch === "strict"
          ? ddg.SafeSearchType.STRICT
          : ddg.SafeSearchType.MODERATE;

    const searchResults = await Promise.race([
      ddg.search(query, { safeSearch }),
      new Promise<never>((_resolve, reject) =>
        setTimeout(
          () => reject(new Error("DuckDuckGo search timed out")),
          FETCH_TIMEOUT_MS,
        ),
      ),
    ]);
    const results: SearchResult[] = [];
    const entries = searchResults?.results ?? [];

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      if (!entry.title || !entry.url) continue;
      results.push({
        title: entry.title,
        url: entry.url,
        snippet: entry.description || entry.title,
        position: results.length + 1,
      });
    }

    return results;
  }
}

// ---------------------------------------------------------------------------
// Region-based engine selection
// ---------------------------------------------------------------------------

import { getRegion, getRegionSync, type Region } from "../config/region.js";

export function getEnginesForRegion(region: Region): SearchEngine[] {
  const airFacts = new AirFactsEngine();
  if (region === "china") {
    return [airFacts, new BaiduEngine(), new BingEngine(), new SogouEngine()];
  }
  return [airFacts, new DuckDuckGoEngine(), new BingEngine()];
}

export async function getEngines(): Promise<SearchEngine[]> {
  const region = await getRegion();
  return getEnginesForRegion(region);
}

export function getEnginesSync(): SearchEngine[] {
  const region = getRegionSync();
  return getEnginesForRegion(region);
}
