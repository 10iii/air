/**
 * AIR Dual-Source Search Merge for OpenCode Plugin
 *
 * Enhances LLM search results (Exa/Tavily) with AIR's free engines.
 * When API keys run out, AIR results still provide value.
 *
 * Design: FEATURES.md F512
 */

import { createRequire } from "node:module";

// =============================================================================
// Types
// =============================================================================

interface ExaResult {
  title?: string;
  url?: string;
  snippet?: string;
  text?: string;
  publishedDate?: string;
}

interface ExaResponse {
  results?: ExaResult[];
  autopromptString?: string;
}

interface AirSearchResult {
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    sources: string[];
    score: number;
  }>;
  successfulEngines: string[];
  failedEngines: string[];
  totalTimeMs: number;
}

interface MergedResult {
  title: string;
  url: string;
  snippet: string;
  sources: string[];
}

// =============================================================================
// Core module loader
// =============================================================================

const require = createRequire(import.meta.url);

interface CoreModule {
  airSearch: (
    query: string,
    options?: { maxResults?: number; timeout?: number },
  ) => Promise<AirSearchResult>;
  SearchCompressor: new () => {
    compress: (
      content: string,
      options?: { query?: string },
    ) => { output: string };
  };
}

let core: CoreModule | null = null;

function getCore(): CoreModule {
  if (!core) {
    core = require("@10iii/air-core") as CoreModule;
  }
  return core;
}

// =============================================================================
// Exa Response Parser
// =============================================================================

/**
 * Parse Exa/Tavily search response.
 * Handles various response formats gracefully.
 */
function parseExaResponse(output: string): { query: string; results: MergedResult[] } | null {
  try {
    // Try to extract query from the output (Exa includes it in response)
    let query = "";
    let data: ExaResponse;

    // Handle string output (already stringified JSON)
    if (typeof output === "string") {
      // Try to parse as JSON
      try {
        data = JSON.parse(output) as ExaResponse;
      } catch {
        // Not JSON, might be formatted text
        return null;
      }
    } else {
      data = output as unknown as ExaResponse;
    }

    // Extract query from autopromptString if available
    if (data.autopromptString) {
      query = data.autopromptString;
    }

    // Parse results
    const results: MergedResult[] = [];
    if (Array.isArray(data.results)) {
      for (const r of data.results) {
        if (r.url) {
          results.push({
            title: r.title || "",
            url: r.url,
            snippet: r.snippet || r.text || "",
            sources: ["exa"],
          });
        }
      }
    }

    return { query, results };
  } catch {
    return null;
  }
}

// =============================================================================
// URL Normalization
// =============================================================================

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "ref", "fbclid", "gclid",
]);

function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
    }

    const paramsToDelete: string[] = [];
    url.searchParams.forEach((_value, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        paramsToDelete.push(key);
      }
    });
    for (const key of paramsToDelete) {
      url.searchParams.delete(key);
    }

    let result = url.toString();
    if (result.endsWith("/") && url.pathname !== "/") {
      result = result.slice(0, -1);
    }

    return result;
  } catch {
    return rawUrl;
  }
}

// =============================================================================
// Result Merger
// =============================================================================

/**
 * Merge Exa and AIR results, deduplicating by URL.
 * Exa results are prioritized (they appear first in the list).
 */
function mergeResults(
  exaResults: MergedResult[],
  airResults: AirSearchResult["results"],
): MergedResult[] {
  const seen = new Map<string, MergedResult>();

  // Add Exa results first (higher priority)
  for (const r of exaResults) {
    const normalized = normalizeUrl(r.url);
    seen.set(normalized, r);
  }

  // Add AIR results (deduplicate)
  for (const r of airResults) {
    const normalized = normalizeUrl(r.url);
    const existing = seen.get(normalized);

    if (existing) {
      // Merge sources
      if (!existing.sources.includes("air")) {
        existing.sources.push(...r.sources);
      }
      // Use longer snippet
      if (r.snippet.length > existing.snippet.length) {
        existing.snippet = r.snippet;
      }
    } else {
      seen.set(normalized, {
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        sources: r.sources,
      });
    }
  }

  return Array.from(seen.values());
}

// =============================================================================
// Main Merge Function
// =============================================================================

export interface SearchMergeOptions {
  /** Maximum AIR results to fetch (default: 10) */
  maxAirResults?: number;
  /** AIR search timeout in ms (default: 8000) */
  timeout?: number;
}

/**
 * Merge LLM search results with AIR search results.
 * 
 * Returns merged results in a compressed format suitable for LLM consumption.
 * 
 * @param toolName - The tool name (must match websearch_* pattern)
 * @param originalOutput - The original LLM tool output
 * @param query - The search query (extracted from args or output)
 * @param options - Merge options
 * @returns Merged and compressed output, or null if merge not applicable
 */
export async function mergeSearchResults(
  toolName: string,
  originalOutput: string,
  query: string,
  options?: SearchMergeOptions,
): Promise<string | null> {
  // Only process websearch_* tools
  if (!toolName.startsWith("websearch_")) {
    return null;
  }

  const maxAirResults = options?.maxAirResults ?? 10;
  const timeout = options?.timeout ?? 8000;

  // Parse Exa response
  const parsed = parseExaResponse(originalOutput);
  const exaResults = parsed?.results ?? [];
  const searchQuery = query || parsed?.query || "";

  if (!searchQuery) {
    // No query to search with, return original
    return null;
  }

  try {
    // Fetch AIR results
    const coreModule = getCore();
    const airResult = await coreModule.airSearch(searchQuery, {
      maxResults: maxAirResults,
      timeout,
    });

    // Merge results
    const merged = mergeResults(exaResults, airResult.results);

    // Format output
    const output = formatMergedOutput(merged, exaResults.length, airResult);

    return output;
  } catch {
    // AIR search failed - silently fallback to original results
    // (network issues, timeout, etc. are expected in production)
    if (exaResults.length > 0) {
      return formatFallbackOutput(exaResults);
    }
    return null;
  }
}

// =============================================================================
// Output Formatters
// =============================================================================

/**
 * Format Exa-only results when AIR fails.
 */
function formatFallbackOutput(results: MergedResult[]): string {
  const lines: string[] = [];

  lines.push(`# Search Results (${results.length} total)`);
  lines.push("");

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`## ${i + 1}. ${r.title || "(No title)"}`);
    lines.push(`URL: ${r.url}`);
    lines.push(`Sources: ${r.sources.join(", ")}`);
    lines.push("");
    if (r.snippet) {
      lines.push(r.snippet);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(`[AIR Search Merge]`);
  lines.push(`- Exa results: ${results.length}`);
  lines.push(`- AIR: fallback (search failed)`);

  return lines.join("\n");
}

function formatMergedOutput(
  merged: MergedResult[],
  exaCount: number,
  airResult: AirSearchResult,
): string {
  const lines: string[] = [];

  lines.push(`# Search Results (${merged.length} total)`);
  lines.push("");

  for (let i = 0; i < merged.length; i++) {
    const r = merged[i];
    lines.push(`## ${i + 1}. ${r.title || "(No title)"}`);
    lines.push(`URL: ${r.url}`);
    lines.push(`Sources: ${r.sources.join(", ")}`);
    lines.push("");
    if (r.snippet) {
      lines.push(r.snippet);
      lines.push("");
    }
  }

  // Add metadata
  lines.push("---");
  lines.push(`[AIR Search Merge]`);
  lines.push(`- Exa results: ${exaCount}`);
  lines.push(`- AIR engines: ${airResult.successfulEngines.join(", ") || "none"}`);
  if (airResult.failedEngines.length > 0) {
    lines.push(`- Failed engines: ${airResult.failedEngines.join(", ")}`);
  }
  lines.push(`- Merge time: ${airResult.totalTimeMs}ms`);

  return lines.join("\n");
}

// =============================================================================
// Tool name matcher
// =============================================================================

/**
 * Check if a tool name matches the search tool pattern.
 * Currently supports: websearch_* (OC MCP bridge format)
 */
export function isSearchTool(toolName: string): boolean {
  return toolName.startsWith("websearch_");
}
