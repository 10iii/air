/**
 * ReadCompressor — core compression engine for air-read.
 *
 * Compresses file content by:
 * 1. Removing line-number prefixes (saves 15-30%)
 * 2. Collapsing consecutive blank lines
 * 3. Collapsing comment blocks (preserving first line + count hint)
 * 4. Collapsing import blocks (preserving first/last + count hint)
 * 5. Smart truncation (head + tail with structural boundary awareness)
 */

import type { CompressResult } from "../types.js";
import {
  detectLanguage,
  isLineComment,
  isImportLine,
  type LanguageInfo,
} from "../parsers/file.js";
import { estimateTokens, collapseBlanks } from "../utils/index.js";

export interface ReadOptions {
  /** Whether to keep line number prefixes (default: false) */
  lineNumbers?: boolean;
  /** Maximum output lines */
  maxLines?: number;
  /** Maximum output tokens (approximate: chars/4) */
  maxTokens?: number;
  /** Collapse comment blocks (default: true) */
  collapseComments?: boolean;
  /** Collapse import blocks (default: true) */
  collapseImports?: boolean;
  /** Merge consecutive blank lines (default: true) */
  collapseBlanks?: boolean;
  /** File name (for language detection) */
  fileName?: string;
}

// estimateTokens moved to utils/index.ts

/**
 * Strip leading line-number prefix from a line.
 * Matches patterns like "  123: content", "123|content", "  123| content", "123: content"
 */
function stripLineNumber(line: string): string {
  // Match optional whitespace, digits, then : or |, then optional space
  return line.replace(/^\s*\d+\s*[:|]\s?/, "");
}

/**
 * Detect if content has line-number prefixes.
 * Sample first N non-empty lines and check if majority have the prefix pattern.
 * Skip detection for data formats (YAML, JSON, TOML) where `digit: value` is valid content.
 */
function hasLineNumberPrefixes(lines: string[], lang?: string): boolean {
  // Data formats use `digit:` as valid key syntax — never strip
  if (lang === "yaml" || lang === "json" || lang === "toml") return false;
  const sampleSize = Math.min(10, lines.length);
  let matches = 0;
  let sampled = 0;

  for (const line of lines) {
    if (sampled >= sampleSize) break;
    if (line.trim() === "") continue;
    sampled++;
    if (/^\s*\d+\s*[:|]/.test(line)) {
      matches++;
    }
  }

  // CR2-04: Require minimum 3 sampled lines to avoid false positives on short files
  return sampled >= 3 && matches / sampled > 0.6;
}

// collapseBlanks moved to utils/index.ts

/**
 * Collapse block comments (/* ... *​/) into a summary.
 */
function collapseBlockComments(
  lines: string[],
  lang: LanguageInfo
): string[] {
  if (lang.blockComment.length === 0 && !lang.docString?.length) {
    return lines;
  }

  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    let collapsed = false;

    // Check block comments
    for (const [start, end] of lang.blockComment) {
      const trimmed = lines[i].trimStart();
      if (trimmed.startsWith(start)) {
        const blockStart = i;
        // Find the end of the block
        let j = i;
        while (j < lines.length) {
          if (j > i && lines[j].includes(end)) {
            j++;
            break;
          }
          // Single-line block comment like /* ... */
          if (j === i && lines[j].includes(end) && lines[j].indexOf(end, lines[j].indexOf(start) + start.length) !== -1) {
            j++;
            break;
          }
          j++;
        }

        // CR-01: Guard against unclosed block comments
        if (j === lines.length && !lines[j - 1].includes(end)) {
          // Unclosed block comment — don't collapse, just push the start line
          result.push(lines[i]);
          i++;
          collapsed = true;
          break;
        }

        const blockLen = j - blockStart;
        if (blockLen >= 3) {
          // Collapse: keep first line + hint
          result.push(lines[blockStart]);
          result.push(
            `${" ".repeat(getIndent(lines[blockStart]))}... (${blockLen - 1} more comment lines)`
          );
          i = j;
          collapsed = true;
        } else {
          // Small block comment — keep as-is
          for (let k = blockStart; k < j; k++) {
            result.push(lines[k]);
          }
          i = j;
          collapsed = true;
        }
        break;
      }
    }

    // Check docstrings (Python)
    if (!collapsed && lang.docString) {
      for (const [start, end] of lang.docString) {
        const trimmed = lines[i].trimStart();
        if (trimmed.startsWith(start)) {
          const blockStart = i;
          let j = i;
          let foundEnd = false;

          // Check for single-line docstring: """text"""
          const afterOpen = trimmed.slice(start.length);
          if (afterOpen.includes(end)) {
            result.push(lines[i]);
            i++;
            collapsed = true;
            break;
          }

          // Multi-line docstring
          j++;
          while (j < lines.length) {
            if (lines[j].trimStart().includes(end)) {
              foundEnd = true;
              j++;
              break;
            }
            j++;
          }

          if (!foundEnd) {
            result.push(lines[i]);
            i++;
            collapsed = true;
            break;
          }

          const blockLen = j - blockStart;
          if (blockLen >= 3) {
            result.push(lines[blockStart]);
            result.push(
              `${" ".repeat(getIndent(lines[blockStart]))}... (${blockLen - 1} more docstring lines)`
            );
            i = j;
            collapsed = true;
          } else {
            for (let k = blockStart; k < j; k++) {
              result.push(lines[k]);
            }
            i = j;
            collapsed = true;
          }
          break;
        }
      }
    }

    if (!collapsed) {
      result.push(lines[i]);
      i++;
    }
  }

  return result;
}

/**
 * Collapse consecutive single-line comments (3+ lines) into a summary.
 */
function collapseLineComments(
  lines: string[],
  lang: LanguageInfo
): string[] {
  if (lang.lineComment.length === 0) return lines;

  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (isLineComment(lines[i], lang)) {
      const blockStart = i;
      while (i < lines.length && isLineComment(lines[i], lang)) {
        i++;
      }
      const blockLen = i - blockStart;

      if (blockLen >= 3) {
        // Collapse: first line + hint
        result.push(lines[blockStart]);
        result.push(
          `${" ".repeat(getIndent(lines[blockStart]))}${lang.lineComment[0] ?? "//"} ... (${blockLen - 1} more comment lines)`
        );
      } else {
        for (let k = blockStart; k < i; k++) {
          result.push(lines[k]);
        }
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result;
}

/**
 * Collapse consecutive import lines into first + last + count.
 */
function collapseImports(
  lines: string[],
  lang: LanguageInfo
): string[] {
  if (lang.importPatterns.length === 0) return lines;

  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (isImportLine(lines[i], lang)) {
      const blockStart = i;
      while (
        i < lines.length &&
        (isImportLine(lines[i], lang) || lines[i].trim() === "") &&
        (i - blockStart) < 100
      ) {
        // CR-12: Allow only single blank line within import blocks
        if (lines[i].trim() === "") {
          const next = i + 1;
          if (next < lines.length && isImportLine(lines[next], lang)) {
            i++;
            continue;
          }
          break;
        }
        i++;
      }

      // Count actual import lines (not blank)
      const importLines = lines
        .slice(blockStart, i)
        .filter((l) => l.trim() !== "");
      const blockLen = importLines.length;

      if (blockLen >= 4) {
        // Collapse: first + last + hint
        result.push(importLines[0]);
        result.push(
          `${lang.lineComment[0] ?? "//"} ... (${blockLen - 2} more imports)`
        );
        result.push(importLines[blockLen - 1]);
      } else {
        // Small import block — keep as-is
        for (let k = blockStart; k < i; k++) {
          result.push(lines[k]);
        }
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result;
}

/** Get indentation level (number of leading spaces). */
function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

/**
 * Check if a line looks like a structural boundary (function, class, etc.).
 */
function isStructuralBoundary(line: string): boolean {
  const trimmed = line.trimStart();
  return /^(export\s+)?(async\s+)?(function|class|interface|type|enum|const|let|var|def|fn|pub|func|struct|impl|module|namespace)\s/.test(
    trimmed
  ) || /^(public|private|protected|static|abstract)\s/.test(trimmed)
    || trimmed === "}" || trimmed === "};" || trimmed === "";
}

/**
 * Smart truncation: keep head + tail, insert omission marker.
 * Tries to cut at structural boundaries.
 */
function smartTruncate(
  lines: string[],
  maxLines: number
): string[] {
  if (maxLines <= 0 || lines.length <= maxLines) return lines;
  if (maxLines === 1) {
    return [`... (${lines.length} lines omitted) ...`];
  }

  const availableBudget = maxLines - 1;
  const headCount = Math.max(1, Math.floor(availableBudget * 0.6));
  const tailCount = availableBudget - headCount;

  // Try to find structural boundary near head cutoff
  let headEnd = headCount;
  const minHeadEnd = 1;
  const maxHeadEnd = maxLines - 1;

  // Search within ±5 lines of headCount for a structural boundary
  for (let offset = 0; offset <= 5; offset++) {
    const checkUp = headCount - offset;
    const checkDown = headCount + offset;
    if (
      checkUp >= minHeadEnd &&
      checkUp <= maxHeadEnd &&
      isStructuralBoundary(lines[checkUp])
    ) {
      headEnd = checkUp;
      break;
    }
    if (
      checkDown >= minHeadEnd &&
      checkDown <= maxHeadEnd &&
      checkDown < lines.length &&
      isStructuralBoundary(lines[checkDown])
    ) {
      headEnd = checkDown;
      break;
    }
  }

  // CR-07: Recalculate tail to maintain maxLines budget after structural boundary adjustment
  const tailBudget = Math.max(0, maxLines - headEnd - 1);
  const actualTail = Math.min(tailCount, tailBudget);
  const tailStart = lines.length - actualTail;
  const omittedCount = tailStart - headEnd;

  if (omittedCount <= 0) return lines;

  const result: string[] = [];
  for (let i = 0; i < headEnd; i++) {
    result.push(lines[i]);
  }
  result.push(`... (${omittedCount} lines omitted) ...`);
  for (let i = tailStart; i < lines.length; i++) {
    result.push(lines[i]);
  }

  return result;
}

/**
 * Smart truncation by token count.
 */
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
    const tokens = truncated.reduce((sum, l) => sum + estimateTokens(l + "\n"), 0);
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
      // R2-01: Even minimal output exceeds budget — return it with flag
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

  return { lines: smartTruncate(lines, Math.max(1, bestMaxLines)), budgetExceeded: false };
}

export class ReadCompressor {
  /**
   * Compress file content for AI consumption.
   */
  compress(content: string, options?: ReadOptions): CompressResult {
    const opts: Required<
      Pick<
        ReadOptions,
        | "lineNumbers"
        | "collapseComments"
        | "collapseImports"
        | "collapseBlanks"
      >
    > &
      ReadOptions = {
      lineNumbers: false,
      collapseComments: true,
      collapseImports: true,
      collapseBlanks: true,
      ...options,
    };

    const lang = detectLanguage(opts.fileName ?? "");
    let lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

    const originalLineCount = lines.length;
    const originalCharCount = content.length;
    const maxLines =
      typeof opts.maxLines === "number" && Number.isFinite(opts.maxLines) && opts.maxLines > 0
        ? Math.floor(opts.maxLines)
        : undefined;
    const maxTokens =
      typeof opts.maxTokens === "number" && Number.isFinite(opts.maxTokens) && opts.maxTokens > 0
        ? Math.floor(opts.maxTokens)
        : undefined;

    // 1. Strip line-number prefixes (if present and not explicitly requested)
    if (!opts.lineNumbers && hasLineNumberPrefixes(lines, lang.language)) {
      lines = lines.map(stripLineNumber);
    }

    // 2. Collapse consecutive blank lines
    if (opts.collapseBlanks) {
      lines = collapseBlanks(lines);
    }

    // 3. Collapse comment blocks
    if (opts.collapseComments) {
      lines = collapseBlockComments(lines, lang);
      lines = collapseLineComments(lines, lang);
    }

    // 4. Collapse import blocks
    if (opts.collapseImports) {
      lines = collapseImports(lines, lang);
    }

    // 5. Smart truncation
    // R2-02: Reserve budget for stats footer line
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

    // 6. Optionally add line numbers
    if (opts.lineNumbers) {
      lines = lines.map((line, i) => `${i + 1}: ${line}`);
    }

    const compressedContent = lines.join("\n");
    const compressedLineCount = lines.length;
    const compressedCharCount = compressedContent.length;

    // Build stats footer
    const savedPercent =
      originalCharCount > 0
        ? Math.round((1 - compressedCharCount / originalCharCount) * 100)
        : 0;
    const statsLine = `--- air: ${originalLineCount} lines \u2192 ${compressedLineCount} lines (${savedPercent}% saved) ---`;

    const output = includeStats ? compressedContent + "\n" + statsLine : compressedContent;
    return {
      output,
      originalSize: originalLineCount,
      compressedSize: compressedLineCount,
      ratio: originalLineCount > 0 ? compressedLineCount / originalLineCount : 1,
      format: "air-read",
      metadata: {
        originalLines: originalLineCount,
        compressedLines: compressedLineCount,
        savedPercent,
        language: lang.language,
        budgetExceeded,
        statsIncluded: includeStats,
      },
    };
  }
}
