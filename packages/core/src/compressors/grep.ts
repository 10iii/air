import type { CompressResult } from "../types.js";
import { estimateTokens, collapseBlanks } from "../utils/index.js";

export interface GrepOptions {
  maxLines?: number;
  maxTokens?: number;
  maxFiles?: number;
  mergeDistance?: number;
  filesOnly?: boolean;
}

interface ParsedMatch {
  filePath: string;
  line: number;
  column?: number;
  content: string;
}

interface FileGroup {
  filePath: string;
  displayPath: string;
  matches: ParsedMatch[];
}

interface MatchBlock {
  startLine: number;
  endLine: number;
  matches: ParsedMatch[];
}

const DEFAULT_MAX_FILES = 20;
const DEFAULT_MERGE_DISTANCE = 3;

function sanitizePositiveInt(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function sanitizeNonNegativeInt(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function pluralize(count: number, singular: string): string {
  if (count === 1) return singular;
  if (singular.endsWith("ch") || singular.endsWith("sh")) {
    return `${singular}es`;
  }
  return `${singular}s`;
}

function parseMatchFromRegex(
  line: string,
  regex: RegExp,
  hasColumn: boolean
): ParsedMatch | null {
  const match = line.match(regex);
  if (!match) return null;

  const filePath = match[1]?.trim();
  const lineNo = Number.parseInt(match[2] ?? "", 10);

  if (!filePath || !Number.isFinite(lineNo) || lineNo <= 0) {
    return null;
  }

  const content = hasColumn ? (match[4] ?? "") : (match[3] ?? "");

  if (hasColumn) {
    const columnNo = Number.parseInt(match[3] ?? "", 10);
    if (!Number.isFinite(columnNo) || columnNo < 0) {
      return null;
    }
    return {
      filePath,
      line: lineNo,
      column: columnNo,
      content,
    };
  }

  return {
    filePath,
    line: lineNo,
    content,
  };
}

function parseGrepLine(line: string): ParsedMatch | null {
  if (line.trim() === "") return null;

  const withColumn = parseMatchFromRegex(line, /^(.*):(\d+):(\d+):(.*)$/, true);
  if (withColumn) return withColumn;

  const colonSeparated = parseMatchFromRegex(line, /^(.*):(\d+):(.*)$/, false);
  if (colonSeparated) return colonSeparated;

  const colonDash = parseMatchFromRegex(line, /^(.*):(\d+)-(.*)$/, false);
  if (colonDash) return colonDash;

  const dashSeparated = parseMatchFromRegex(line, /^(.*)-(\d+)-(.*)$/, false);
  if (dashSeparated) return dashSeparated;

  return null;
}

function findCommonPathPrefix(paths: string[]): string {
  if (paths.length < 2) return "";

  let prefix = paths[0] ?? "";
  for (let i = 1; i < paths.length && prefix.length > 0; i++) {
    const current = paths[i] ?? "";
    while (!current.startsWith(prefix) && prefix.length > 0) {
      prefix = prefix.slice(0, -1);
    }
  }

  if (prefix.length === 0) return "";
  const lastSlash = Math.max(prefix.lastIndexOf("/"), prefix.lastIndexOf("\\"));
  if (lastSlash < 0) return "";

  return prefix.slice(0, lastSlash + 1);
}

function buildBlocks(matches: ParsedMatch[], mergeDistance: number): MatchBlock[] {
  if (matches.length === 0) return [];

  const sorted = [...matches].sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return (a.column ?? 0) - (b.column ?? 0);
  });

  const blocks: MatchBlock[] = [];
  let current: MatchBlock = {
    startLine: sorted[0].line,
    endLine: sorted[0].line,
    matches: [sorted[0]],
  };

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (item.line - current.endLine <= mergeDistance) {
      current.matches.push(item);
      current.endLine = Math.max(current.endLine, item.line);
    } else {
      blocks.push(current);
      current = {
        startLine: item.line,
        endLine: item.line,
        matches: [item],
      };
    }
  }

  blocks.push(current);
  return blocks;
}

function formatMatchRef(match: ParsedMatch): string {
  if (match.column !== undefined) {
    return `:${match.line}:${match.column}`;
  }
  return `:${match.line}`;
}

function formatMatchLine(match: ParsedMatch, indent: string): string {
  const reference = formatMatchRef(match);
  if (match.content.length === 0) return `${indent}${reference}`;
  return `${indent}${reference} ${match.content}`;
}

function renderBlock(block: MatchBlock): string[] {
  if (block.matches.length === 1) {
    return [formatMatchLine(block.matches[0], "  ")];
  }

  const range =
    block.startLine === block.endLine
      ? `${block.startLine}`
      : `${block.startLine}-${block.endLine}`;
  const out: string[] = [`  :${range} (${block.matches.length} ${pluralize(block.matches.length, "match")})`];

  if (block.matches.length <= 4) {
    for (const match of block.matches) {
      out.push(formatMatchLine(match, "    "));
    }
    return out;
  }

  out.push(formatMatchLine(block.matches[0], "    "));
  out.push(formatMatchLine(block.matches[1], "    "));
  out.push(`    ... (${block.matches.length - 3} more nearby match${block.matches.length - 3 === 1 ? "" : "es"})`);
  out.push(formatMatchLine(block.matches[block.matches.length - 1], "    "));
  return out;
}

function smartTruncate(lines: string[], maxLines: number): string[] {
  if (maxLines <= 0 || lines.length <= maxLines) return lines;
  if (maxLines === 1) {
    return [`... (${lines.length} lines omitted) ...`];
  }

  const availableBudget = maxLines - 1;
  const headCount = Math.max(1, Math.floor(availableBudget * 0.6));
  const tailCount = availableBudget - headCount;

  const tailStart = lines.length - tailCount;
  const omittedCount = tailStart - headCount;

  if (omittedCount <= 0) return lines;

  const result: string[] = [];
  for (let i = 0; i < headCount; i++) {
    result.push(lines[i]);
  }
  result.push(`... (${omittedCount} lines omitted) ...`);
  for (let i = tailStart; i < lines.length; i++) {
    result.push(lines[i]);
  }
  return result;
}

function smartTruncateByTokens(
  lines: string[],
  maxTokens: number
): { lines: string[]; budgetExceeded: boolean } {
  let totalTokens = 0;
  for (const line of lines) {
    totalTokens += estimateTokens(line + "\n");
  }
  if (totalTokens <= maxTokens) return { lines, budgetExceeded: false };

  const tokenCache = new Map<number, number>();
  const tokensFor = (lineBudget: number): number => {
    const cached = tokenCache.get(lineBudget);
    if (cached !== undefined) return cached;
    const truncated = smartTruncate(lines, lineBudget);
    const tokens = truncated.reduce((sum, line) => sum + estimateTokens(line + "\n"), 0);
    tokenCache.set(lineBudget, tokens);
    return tokens;
  };

  const step = Math.max(1, Math.floor(Math.sqrt(lines.length)));
  let bestMaxLines = 1;
  let firstFit = 0;
  let lastOver = lines.length + 1;

  for (let tryLines = lines.length; tryLines >= 1; tryLines -= step) {
    if (tokensFor(tryLines) <= maxTokens) {
      firstFit = tryLines;
      break;
    }
    lastOver = tryLines;
  }

  if (firstFit === 0) {
    if (tokensFor(1) <= maxTokens) {
      firstFit = 1;
      lastOver = Math.min(lines.length + 1, 1 + step);
    } else {
      return { lines: smartTruncate(lines, 1), budgetExceeded: true };
    }
  }

  bestMaxLines = firstFit;
  const refineTop = Math.min(lines.length, lastOver - 1);
  for (let tryLines = refineTop; tryLines > firstFit; tryLines--) {
    if (tokensFor(tryLines) <= maxTokens) {
      bestMaxLines = tryLines;
      break;
    }
  }

  return {
    lines: smartTruncate(lines, Math.max(1, bestMaxLines)),
    budgetExceeded: false,
  };
}

export class GrepCompressor {
  compress(content: string, options?: GrepOptions): CompressResult {
    const maxLines = sanitizePositiveInt(options?.maxLines);
    const maxTokens = sanitizePositiveInt(options?.maxTokens);
    const maxFiles = sanitizePositiveInt(options?.maxFiles) ?? DEFAULT_MAX_FILES;
    const mergeDistance = sanitizeNonNegativeInt(options?.mergeDistance) ?? DEFAULT_MERGE_DISTANCE;
    const filesOnly = options?.filesOnly ?? false;

    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const sourceLines = normalized.split("\n");
    const originalLineCount = sourceLines.length;
    const originalCharCount = content.length;

    const parsedMatches: ParsedMatch[] = [];
    for (const line of sourceLines) {
      const parsed = parseGrepLine(line);
      if (parsed) {
        parsedMatches.push(parsed);
      }
    }

    const groupedMap = new Map<string, ParsedMatch[]>();
    for (const match of parsedMatches) {
      const arr = groupedMap.get(match.filePath);
      if (arr) {
        arr.push(match);
      } else {
        groupedMap.set(match.filePath, [match]);
      }
    }

    const groupsRaw = [...groupedMap.entries()].map(([filePath, matches]) => ({
      filePath,
      matches: [...matches],
    }));

    groupsRaw.sort((a, b) => {
      if (a.matches.length !== b.matches.length) {
        return b.matches.length - a.matches.length;
      }
      return a.filePath.localeCompare(b.filePath);
    });

    const commonPrefix = findCommonPathPrefix(groupsRaw.map((g) => g.filePath));
    const groups: FileGroup[] = groupsRaw.map((group) => {
      const displayPath =
        commonPrefix.length > 0 && group.filePath.startsWith(commonPrefix)
          ? group.filePath.slice(commonPrefix.length) || group.filePath
          : group.filePath;

      return {
        filePath: group.filePath,
        displayPath,
        matches: group.matches,
      };
    });

    const shownGroups = groups.slice(0, maxFiles);
    const hiddenGroups = groups.slice(maxFiles);
    const hiddenMatchCount = hiddenGroups.reduce((sum, g) => sum + g.matches.length, 0);

    const totalMatches = parsedMatches.length;
    const totalFiles = groups.length;

    const rendered: string[] = [];
    rendered.push(
      `${totalMatches} ${pluralize(totalMatches, "match")} in ${totalFiles} ${pluralize(totalFiles, "file")}`
    );

    if (shownGroups.length > 0) {
      rendered.push("");
    }

    for (let i = 0; i < shownGroups.length; i++) {
      const group = shownGroups[i];
      rendered.push(
        filesOnly
          ? `${group.displayPath} (${group.matches.length} ${pluralize(group.matches.length, "match")})`
          : `${group.displayPath} (${group.matches.length} ${pluralize(group.matches.length, "match")}):`
      );

      if (!filesOnly) {
        const blocks = buildBlocks(group.matches, mergeDistance);
        for (const block of blocks) {
          rendered.push(...renderBlock(block));
        }
      }

      if (i < shownGroups.length - 1) {
        rendered.push("");
      }
    }

    if (hiddenGroups.length > 0) {
      if (shownGroups.length > 0) {
        rendered.push("");
      }
      rendered.push(
        `... and ${hiddenGroups.length} more ${pluralize(hiddenGroups.length, "file")} (${hiddenMatchCount} ${pluralize(hiddenMatchCount, "match")})`
      );
    }

    let lines = collapseBlanks(rendered);
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }

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

    const effectiveMaxLines =
      maxLines !== undefined
        ? Math.max(1, maxLines - (includeStats ? footerEstimatedLines : 0))
        : undefined;
    const effectiveMaxTokens =
      maxTokens !== undefined
        ? Math.max(1, maxTokens - (includeStats ? footerEstimatedTokens : 0))
        : undefined;

    if (effectiveMaxLines !== undefined && lines.length > effectiveMaxLines) {
      lines = smartTruncate(lines, effectiveMaxLines);
    }
    if (effectiveMaxTokens !== undefined) {
      const truncResult = smartTruncateByTokens(lines, effectiveMaxTokens);
      lines = truncResult.lines;
      budgetExceeded = truncResult.budgetExceeded;
    }

    const compressedContent = lines.join("\n");
    const compressedLineCount = lines.length;
    const compressedCharCount = compressedContent.length;
    const rawSavedPercent =
      originalCharCount > 0
        ? Math.round((1 - compressedCharCount / originalCharCount) * 100)
        : 0;
    const savedPercent = Math.max(0, rawSavedPercent);

    const statsLine = `--- air: ${originalLineCount} lines → ${compressedLineCount} lines (${savedPercent}% saved) ---`;
    const output = includeStats ? compressedContent + "\n" + statsLine : compressedContent;

    return {
      output,
      originalSize: originalLineCount,
      compressedSize: compressedLineCount,
      ratio: originalLineCount > 0 ? compressedLineCount / originalLineCount : 1,
      format: "air-grep",
      metadata: {
        originalLines: originalLineCount,
        compressedLines: compressedLineCount,
        savedPercent,
        totalMatches,
        totalFiles,
        displayedFiles: shownGroups.length,
        hiddenFiles: hiddenGroups.length,
        hiddenMatches: hiddenMatchCount,
        ignoredLines: sourceLines.length - parsedMatches.length,
        maxFiles,
        mergeDistance,
        filesOnly,
        commonPathPrefix: commonPrefix,
        budgetExceeded,
        statsIncluded: includeStats,
      },
    };
  }
}
