/**
 * AIR Search Core Function
 *
 * Reusable search function for plugins and CLI.
 * Uses region-based engine selection and aggregation.
 */

import { getEngines } from "./engines.js";
import { SearchAggregator } from "./aggregator.js";
import type { SearchResult, AggregatedResult } from "./aggregator.js";

export interface AirSearchOptions {
  /** Maximum results to return (default: 10) */
  maxResults?: number;
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
}

export interface AirSearchResult {
  /** Aggregated search results */
  results: AggregatedResult[];
  /** Engines that returned results */
  successfulEngines: string[];
  /** Engines that failed */
  failedEngines: string[];
  /** Total search time in milliseconds */
  totalTimeMs: number;
}

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_MAX_RESULTS = 10;

/**
 * Search using AIR's free search engines (no API key required).
 *
 * Uses region-based engine selection:
 * - China: AIR Facts + Baidu + Bing + Sogou
 * - Global: AIR Facts + DuckDuckGo + Bing
 *
 * Results are aggregated and deduplicated across engines.
 *
 * @param query - Search query
 * @param options - Search options
 * @returns Aggregated search results with metadata
 *
 * @example
 * ```typescript
 * import { airSearch } from "@10iii/air-core";
 *
 * const { results } = await airSearch("TypeScript best practices");
 * console.log(results[0].title, results[0].url);
 * ```
 */
export async function airSearch(
  query: string,
  options?: AirSearchOptions,
): Promise<AirSearchResult> {
  const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const startTime = Date.now();

  // Get region-appropriate engines
  const engines = await getEngines();

  // Search all engines in parallel with timeout
  const searchPromises = engines.map(async (engine) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const results = await Promise.race([
        engine.search(query, { maxResults }),
        new Promise<SearchResult[]>((_resolve, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error(`${engine.name} search timed out`)),
            timeout,
          );
        }),
      ]);
      return { engine: engine.name, results, error: null };
    } catch (err) {
      return {
        engine: engine.name,
        results: [] as SearchResult[],
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      // Clean up timeout to prevent memory leak
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  });

  const engineResultsArray = await Promise.all(searchPromises);

  // Collect successful and failed engines
  const engineResults = new Map<string, SearchResult[]>();
  const successfulEngines: string[] = [];
  const failedEngines: string[] = [];

  for (const { engine, results, error } of engineResultsArray) {
    if (results.length > 0) {
      engineResults.set(engine, results);
      successfulEngines.push(engine);
    } else if (error) {
      failedEngines.push(engine);
    }
  }

  // Aggregate and deduplicate results
  const aggregator = new SearchAggregator();
  const aggregated = aggregator.aggregate(engineResults, { maxResults });

  const totalTimeMs = Date.now() - startTime;

  return {
    results: aggregated,
    successfulEngines,
    failedEngines,
    totalTimeMs,
  };
}
