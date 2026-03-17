import type { CompressResult } from "../types.js";
import { estimateTokens } from "../utils/index.js";
import { sanitizePositiveInt, smartTruncateLines, smartTruncateByTokens } from "./shared.js";

export interface SearchOptions {
  maxLines?: number;
  maxTokens?: number;
  maxResults?: number;
  query?: string;
}

interface SearchResultInput {
  title: string;
  url: string;
  snippet: string;
  sources: string[];
  score: number;
}

const DEFAULT_MAX_RESULTS = 10;

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function countUniqueEngines(results: SearchResultInput[]): number {
  const engines = new Set<string>();
  for (const result of results) {
    if (Array.isArray(result.sources)) {
      for (const s of result.sources) {
        engines.add(s);
      }
    }
  }
  return engines.size;
}

export class SearchCompressor {
  compress(content: string, options?: SearchOptions): CompressResult {
    const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
    const maxLines = sanitizePositiveInt(options?.maxLines);
    const maxTokens = sanitizePositiveInt(options?.maxTokens);
    const query = options?.query ?? "";

    const originalLineCount = content.split("\n").length;

    let results: SearchResultInput[];
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        results = [];
      } else {
        results = parsed;
      }
    } catch {
      results = [];
    }

    const limited = results.slice(0, maxResults);
    const engineCount = countUniqueEngines(limited);

    const rendered: string[] = [];
    const queryDisplay = query ? `"${query}"` : '""';
    rendered.push(
      `Search: ${queryDisplay} — ${limited.length} results from ${engineCount} engine${engineCount !== 1 ? "s" : ""}`,
    );
    rendered.push("");

    for (let i = 0; i < limited.length; i++) {
      const r = limited[i];
      const title = r.title || "(untitled)";
      const domain = extractDomain(r.url || "");
      const snippet = r.snippet || "";
      const sources = Array.isArray(r.sources) ? r.sources.join(", ") : "";

      rendered.push(`${i + 1}. **${title}** (${domain})`);
      if (snippet) {
        rendered.push(`   ${snippet}`);
      }
      if (sources) {
        rendered.push(`   Sources: ${sources}`);
      }
    }

    let lines = rendered;

    const footerEstimatedLines = 1;
    const footerEstimatedTokens = 25;
    let includeStats = true;

    if (maxLines !== undefined && maxLines <= footerEstimatedLines) {
      includeStats = false;
    }
    if (maxTokens !== undefined && maxTokens <= footerEstimatedTokens) {
      includeStats = false;
    }

    const effectiveMaxLines =
      maxLines !== undefined
        ? Math.max(1, maxLines - (includeStats ? footerEstimatedLines : 0))
        : undefined;
    const effectiveMaxTokens =
      maxTokens !== undefined
        ? Math.max(1, maxTokens - (includeStats ? footerEstimatedTokens : 0))
        : undefined;

    if (effectiveMaxLines !== undefined && lines.length > effectiveMaxLines) {
      lines = smartTruncateLines(lines, effectiveMaxLines);
    }
    if (effectiveMaxTokens !== undefined) {
      const truncResult = smartTruncateByTokens(lines, effectiveMaxTokens);
      lines = truncResult.lines;
    }

    const compressedContent = lines.join("\n");
    const compressedLineCount = lines.length;
    const rawSavedPercent =
      originalLineCount > 0
        ? Math.round((1 - compressedLineCount / originalLineCount) * 100)
        : 0;
    const savedPercent = Math.max(0, rawSavedPercent);

    const statsLine = `--- air: ${originalLineCount} lines \u2192 ${compressedLineCount} lines (${savedPercent}% saved) ---`;
    const output = includeStats
      ? compressedContent + "\n" + statsLine
      : compressedContent;

    return {
      output,
      originalSize: originalLineCount,
      compressedSize: compressedLineCount,
      ratio: originalLineCount > 0 ? compressedLineCount / originalLineCount : 1,
      format: "air-search",
      metadata: {
        resultCount: limited.length,
        engineCount,
        maxResults,
        originalLines: originalLineCount,
        compressedLines: compressedLineCount,
        savedPercent,
        statsIncluded: includeStats,
      },
    };
  }
}
