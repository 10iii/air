export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

export interface AggregatedResult {
  title: string;
  url: string;
  snippet: string;
  sources: string[];
  score: number;
}

export interface AggregatorOptions {
  maxResults?: number;
}

const DEFAULT_MAX_RESULTS = 10;

const ENGINE_WEIGHTS: Record<string, number> = {
  baidu: 1.0,
  bing: 1.1,
  duckduckgo: 1.0,
  sogou: 0.9,
};

const MULTI_ENGINE_BONUS = 1.5;

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "fbclid",
  "gclid",
]);

export function normalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

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
}

export class SearchAggregator {
  aggregate(
    engineResults: Map<string, SearchResult[]>,
    options?: AggregatorOptions,
  ): AggregatedResult[] {
    const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;

    const merged = new Map<
      string,
      {
        title: string;
        url: string;
        snippet: string;
        sources: string[];
        totalScore: number;
      }
    >();

    for (const [engineName, results] of engineResults) {
      const weight = ENGINE_WEIGHTS[engineName.toLowerCase()] ?? 1.0;

      for (const result of results) {
        const normalizedUrl = normalizeUrl(result.url);
        const positionScore = result.position > 0 ? (1 / result.position) * weight : 0;

        const existing = merged.get(normalizedUrl);
        if (existing) {
          if (result.snippet.length > existing.snippet.length) {
            existing.snippet = result.snippet;
          }
          if (result.title.length > existing.title.length) {
            existing.title = result.title;
          }
          if (!existing.sources.includes(engineName)) {
            existing.sources.push(engineName);
          }
          existing.totalScore += positionScore;
        } else {
          merged.set(normalizedUrl, {
            title: result.title,
            url: result.url,
            snippet: result.snippet,
            sources: [engineName],
            totalScore: positionScore,
          });
        }
      }
    }

    const aggregated: AggregatedResult[] = [];
    for (const entry of merged.values()) {
      const score =
        entry.sources.length > 1
          ? entry.totalScore * MULTI_ENGINE_BONUS
          : entry.totalScore;

      aggregated.push({
        title: entry.title,
        url: entry.url,
        snippet: entry.snippet,
        sources: entry.sources,
        score: Math.round(score * 1000) / 1000,
      });
    }

    aggregated.sort((a, b) => b.score - a.score);

    return aggregated.slice(0, maxResults);
  }
}
