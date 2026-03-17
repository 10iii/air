import type { CompressResult } from "../types.js";
import { estimateTokens } from "../utils/index.js";
import { sanitizePositiveInt, smartTruncateLines, smartTruncateByTokens } from "./shared.js";

export interface ApiOptions {
  maxLines?: number;
  maxTokens?: number;
  maxDepth?: number;
  maxArrayLength?: number;
  removeNulls?: boolean;
  removeDefaults?: boolean;
  schemaFields?: string[];
}

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_ARRAY_LENGTH = 5;

const METADATA_FIELDS = new Set([
  "_links",
  "_embedded",
  "_meta",
  "__typename",
  "$schema",
  "@odata.context",
  "@odata.type",
  "@odata.id",
  "@odata.etag",
  "@odata.nextLink",
  "@context",
  "@type",
  "@id",
  "_metadata",
  "_response",
  "_headers",
  "_status",
]);

interface CompressStats {
  fieldsRemoved: number;
  arraysTruncated: number;
  depthLimited: number;
  nullsRemoved: number;
}

function isNullOrEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0) {
    return true;
  }
  return false;
}

function isDefaultValue(value: unknown): boolean {
  if (value === false) return true;
  if (value === 0) return true;
  if (value === "") return true;
  return false;
}

function compressValue(
  value: unknown,
  depth: number,
  options: {
    maxDepth: number;
    maxArrayLength: number;
    removeNulls: boolean;
    removeDefaults: boolean;
    schemaFields: string[] | undefined;
  },
  stats: CompressStats,
  isTopLevel: boolean
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;

  if (depth > options.maxDepth) {
    stats.depthLimited++;
    if (Array.isArray(value)) return "[...]";
    return "{...}";
  }

  if (Array.isArray(value)) {
    const processed: unknown[] = [];
    const limit = options.maxArrayLength;
    const itemsToProcess = Math.min(value.length, limit);

    for (let i = 0; i < itemsToProcess; i++) {
      const item = value[i];
      if (options.removeNulls && isNullOrEmpty(item)) {
        stats.nullsRemoved++;
        continue;
      }
      processed.push(compressValue(item, depth + 1, options, stats, false));
    }

    if (value.length > limit) {
      stats.arraysTruncated++;
      const remaining = value.length - limit;
      processed.push(`... (${remaining} more items)`);
    }

    return processed;
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const keys = Object.keys(obj);

  const allowedKeys = isTopLevel && options.schemaFields ? new Set(options.schemaFields) : undefined;

  for (const key of keys) {
    if (allowedKeys && !allowedKeys.has(key)) {
      stats.fieldsRemoved++;
      continue;
    }

    if (METADATA_FIELDS.has(key)) {
      stats.fieldsRemoved++;
      continue;
    }

    const val = obj[key];

    if (options.removeNulls && isNullOrEmpty(val)) {
      stats.nullsRemoved++;
      continue;
    }

    if (options.removeDefaults && isDefaultValue(val)) {
      stats.fieldsRemoved++;
      continue;
    }

    result[key] = compressValue(val, depth + 1, options, stats, false);
  }

  return result;
}

export class ApiCompressor {
  compress(content: string, options?: ApiOptions): CompressResult {
    const maxLines = sanitizePositiveInt(options?.maxLines);
    const maxTokens = sanitizePositiveInt(options?.maxTokens);
    const maxDepth = sanitizePositiveInt(options?.maxDepth) ?? DEFAULT_MAX_DEPTH;
    const maxArrayLength = sanitizePositiveInt(options?.maxArrayLength) ?? DEFAULT_MAX_ARRAY_LENGTH;
    const removeNulls = options?.removeNulls ?? true;
    const removeDefaults = options?.removeDefaults ?? false;
    const schemaFields = options?.schemaFields;

    const originalSize = content.length;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return {
        output: content,
        originalSize,
        compressedSize: content.length,
        ratio: 1,
        format: "air-api",
        metadata: {
          fieldsRemoved: 0,
          arraysTruncated: 0,
          depthLimited: 0,
          nullsRemoved: 0,
          error: "Invalid JSON input",
        },
      };
    }

    if (parsed === null || typeof parsed !== "object") {
      const output = JSON.stringify(parsed);
      return {
        output,
        originalSize,
        compressedSize: output.length,
        ratio: originalSize > 0 ? output.length / originalSize : 1,
        format: "air-api",
        metadata: {
          fieldsRemoved: 0,
          arraysTruncated: 0,
          depthLimited: 0,
          nullsRemoved: 0,
        },
      };
    }

    const stats: CompressStats = {
      fieldsRemoved: 0,
      arraysTruncated: 0,
      depthLimited: 0,
      nullsRemoved: 0,
    };

    const compressed = compressValue(
      parsed,
      1,
      { maxDepth, maxArrayLength, removeNulls, removeDefaults, schemaFields },
      stats,
      true
    );

    let compactJson = JSON.stringify(compressed);

    let budgetExceeded = false;
    const footerEstimatedLines = 1;
    const footerEstimatedTokens = 25;
    let includeStats = true;

    if (maxLines !== undefined && maxLines <= footerEstimatedLines) {
      includeStats = false;
    }
    if (maxTokens !== undefined && maxTokens <= footerEstimatedTokens) {
      includeStats = false;
    }

    if (maxLines !== undefined || maxTokens !== undefined) {
      let lines = compactJson.split("\n");

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
        budgetExceeded = truncResult.budgetExceeded;
      }

      compactJson = lines.join("\n");
    }

    const originalLineCount = content.split("\n").length;
    const compressedLineCount = compactJson.split("\n").length;
    const rawSavedPercent =
      originalLineCount > 0 ? Math.round((1 - compressedLineCount / originalLineCount) * 100) : 0;
    const savedPercent = Math.max(0, rawSavedPercent);

    const statsLine = `--- air: ${originalLineCount} lines \u2192 ${compressedLineCount} lines (${savedPercent}% saved) ---`;
    const output = includeStats ? `${compactJson}\n${statsLine}` : compactJson;

    return {
      output,
      originalSize: originalLineCount,
      compressedSize: compressedLineCount,
      ratio: originalLineCount > 0 ? compressedLineCount / originalLineCount : 1,
      format: "air-api",
      metadata: {
        fieldsRemoved: stats.fieldsRemoved,
        arraysTruncated: stats.arraysTruncated,
        depthLimited: stats.depthLimited,
        nullsRemoved: stats.nullsRemoved,
        savedPercent,
        budgetExceeded,
        statsIncluded: includeStats,
      },
    };
  }
}
