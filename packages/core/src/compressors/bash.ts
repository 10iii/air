/**
 * BashCompressor — core compression engine for air-bash.
 *
 * Compresses command/terminal output by:
 * 1. Stripping ANSI escape codes (colors, cursor movement, etc.)
 * 2. Collapsing consecutive blank lines
 * 3. Detecting and collapsing repeated/similar lines (progress bars, download ticks, etc.)
 * 4. Filtering noise patterns (spinner frames, progress indicators, banners)
 * 5. Extracting error/warning lines as high-priority content
 * 6. Smart truncation (head + tail) with error-aware boundary awareness
 */

import type { CompressResult } from "../types.js";
import { estimateTokens, collapseBlanks } from "../utils/index.js";
export interface BashOptions {
  /** Maximum output lines */
  maxLines?: number;
  /** Maximum output tokens (approximate: chars/4) */
  maxTokens?: number;
  /** Strip ANSI escape codes (default: true) */
  stripAnsi?: boolean;
  /** Collapse consecutive blank lines (default: true) */
  collapseBlanks?: boolean;
  /** Collapse repeated/similar lines (default: true) */
  collapseRepeats?: boolean;
  /** Filter noise patterns like progress bars, spinners (default: true) */
  filterNoise?: boolean;
  /** Command hint for smarter parsing (e.g. "npm install", "docker build") */
  command?: string;
}

// estimateTokens moved to utils/index.ts

// ─── ANSI stripping ───────────────────────────────────────────────

// R2-06: Extended CSI pattern to handle private mode sequences (e.g. \x1b[?25l, \x1b[?25h)
const ANSI_ESCAPE_PATTERN = new RegExp(
  "\\x1b\\[[?]?[0-9;]*[A-Za-z]|\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)|\\x1b[()][AB012]|\\x1b[=>Nno|}~78DHM]",
  "g"
);

/**
 * Strip all ANSI escape codes from text.
 * Handles: SGR (colors), cursor movement, erase, OSC, etc.
 */
function stripAnsiCodes(text: string): string {
  // Comprehensive ANSI escape pattern:
  // - CSI sequences: ESC [ ... final_byte
  // - OSC sequences: ESC ] ... ST (or BEL)
  // - Simple escapes: ESC followed by single char
  // - Also handle \r (carriage return) used for progress bar overwriting
  return text
    .replace(
      // eslint-disable-next-line no-control-regex
      ANSI_ESCAPE_PATTERN,
      ""
    )
    .replace(/\r(?!\n)/g, ""); // Remove carriage returns (not \r\n), used for line-overwriting
}

// collapseBlanks moved to utils/index.ts

// ─── Repeated line detection ──────────────────────────────────────

/**
 * Collapse runs of repeated or highly-similar lines.
 * E.g., progress download lines, repeated warnings.
 * Threshold: 3+ consecutive similar lines collapse to first + count.
 */
function collapseRepeatedLines(lines: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const current = lines[i];
    const currentNorm = normalizeLine(current);

    // Count consecutive similar lines
    let j = i + 1;
    while (j < lines.length && areSimilar(currentNorm, normalizeLine(lines[j]))) {
      j++;
    }

    const runLen = j - i;
    if (runLen >= 3) {
      // Collapse: keep first + last + count hint
      result.push(current);
      if (runLen > 2) {
        result.push(`  ... (${runLen - 2} similar line${runLen - 2 === 1 ? "" : "s"} omitted)`);
      }
      result.push(lines[j - 1]);
    } else {
      // Keep as-is
      for (let k = i; k < j; k++) {
        result.push(lines[k]);
      }
    }
    i = j;
  }

  return result;
}

/**
 * Normalize a line for similarity comparison.
 * Strips numbers, hashes, timestamps, and whitespace to find structural similarity.
 */
function normalizeLine(line: string): string {
  return line
    .replace(/(?=[0-9a-f]*\d)[0-9a-f]{7,}/gi, "H") // CR2-03: Replace hex hashes (require digit, 7+ chars)
    .replace(/\d+/g, "N")             // Then replace remaining numbers
    .replace(/\s+/g, " ")             // Normalize whitespace
    .trim();
}

/**
 * Check if two normalized lines are structurally similar.
 * Uses simple equality on normalized forms.
 */
function areSimilar(normA: string, normB: string): boolean {
  // CR2-01: Empty normalized lines should never be considered similar
  if (normA.length === 0 || normB.length === 0) return false;
  if (normA === normB) return true;

  // Also check if they share >80% of their content
  // (handles minor variations in similar lines)
  const shorter = Math.min(normA.length, normB.length);
  const longer = Math.max(normA.length, normB.length);
  if (shorter / longer < 0.7) return false;

  // CR-08: Quick reject for very long lines (skip char-by-char)
  if (shorter > 500) return normA === normB;

  // Count matching characters at same positions
  let matches = 0;
  for (let i = 0; i < shorter; i++) {
    if (normA[i] === normB[i]) matches++;
  }
  return matches / longer > 0.8;
}

// ─── Noise filtering ──────────────────────────────────────────────

/** Patterns that indicate terminal noise (progress bars, spinners, download indicators). */
const NOISE_PATTERNS: RegExp[] = [
  // Progress bars: [####    ] 45%, ████░░░░, etc.
  /^.*[█▓▒░]{3,}.*$/,
  /^.*[#=\-]{5,}>?\s*\d+%/,
  // npm/yarn progress: ⸩ ⠋ ⠙ ⠹ etc. (Braille spinners)
  // eslint-disable-next-line no-control-regex
  /^[\s]*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷⠁⠂⠄⡀⢀⠠⠐⠈|/\\\-⸩][\s]/,
  // Cursor movement / line-clear artifacts (already mostly handled by ANSI strip)
  /^\s*\.{4,}\s*$/,
  // npm timing lines
  /^npm\s+(timing|verb|info|notice)\s/i,
  // npm WARN lines about peer deps that are just noise for AI
  /^npm\s+warn\s+(notsup|EBADENGINE|ERESOLVE)\s/i,
  // Download progress: "Downloading ... 45.2 MB / 100 MB"
  /downloading.*\d+(\.\d+)?\s*(kb|mb|gb|bytes)\s*[/|]\s*\d+/i,
  // Fetching packages
  /^(GET|Fetch|fetch)\s+https?:\/\//i,
  // Docker layer progress: "=> [2/5] RUN ..."
  /^#\d+\s+\d+\.\d+\s/,
  // Time elapsed indicators (not useful for AI)
  /^\s*\[[\d:]+\]\s*$/,
];

/**
 * Check if a line is pure noise that can be safely removed.
 */
function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return false; // Blank lines handled separately
  return NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Filter noise lines, keeping a count of removed lines.
 */
function filterNoise(lines: string[]): { filtered: string[]; removedCount: number } {
  const filtered: string[] = [];
  let removedCount = 0;
  let consecutiveNoiseStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (isNoiseLine(lines[i])) {
      if (consecutiveNoiseStart === -1) {
        consecutiveNoiseStart = i;
      }
      removedCount++;
    } else {
      // If we had a run of noise lines, add a hint
      if (consecutiveNoiseStart !== -1) {
        const noiseCount = i - consecutiveNoiseStart;
        if (noiseCount >= 3) {
          filtered.push(`  ... (${noiseCount} progress/noise lines filtered)`);
        } else {
          // Small number of noise lines — still filter, just don't add hint
        }
        consecutiveNoiseStart = -1;
      }
      filtered.push(lines[i]);
    }
  }

  // Handle trailing noise
  if (consecutiveNoiseStart !== -1) {
    const noiseCount = lines.length - consecutiveNoiseStart;
    if (noiseCount >= 3) {
      filtered.push(`  ... (${noiseCount} progress/noise lines filtered)`);
    }
  }

  return { filtered, removedCount };
}

// ─── Error/warning extraction ─────────────────────────────────────

/** Patterns indicating error lines (high priority to keep). */
const ERROR_PATTERNS: RegExp[] = [
  /^error\s*[:!\[\]]/i,
  /^ERR[!:|\s]/,
  /^npm\s+ERR!/i,
  /^\s*✗\s/,
  /^\s*×\s/,
  /^FATAL[\s:]/i,
  /^FAIL[\s:]/i,
  /^failed[\s:]/i,
  /^panic[\s:]/i,
  /^\s*at\s+.*\(.*:\d+:\d+\)/, // Stack trace lines
  /^\s*at\s+.*\s+\(.*\)/, // Stack trace (node format)
  /Traceback \(most recent call last\)/,
  /^TypeError:|^ReferenceError:|^SyntaxError:|^RangeError:|^ValueError:|^KeyError:|^AttributeError:|^ImportError:|^ModuleNotFoundError:|^FileNotFoundError:/,
  /^Exception|^Unhandled\s/i,
  /cannot find module/i,
  /command\s+(not\s+found|failed)/i,
  /permission denied/i,
  /no such file or directory/i,
  /segmentation fault/i,
  /out of memory/i,
  /compilation? (error|failed)/i,
  /build\s+failed/i,
];

/** Patterns indicating warning lines (medium priority). */
const WARNING_PATTERNS: RegExp[] = [
  /^warn(ing)?[\s:[\]]/i,
  /^npm\s+warn/i,
  /^\s*⚠\s/,
  /deprecated/i,
];

/**
 * Check if a line contains an error indicator.
 */
function isErrorLine(line: string): boolean {
  return ERROR_PATTERNS.some((p) => p.test(line.trim()));
}

/**
 * Check if a line contains a warning indicator.
 */
function isWarningLine(line: string): boolean {
  return WARNING_PATTERNS.some((p) => p.test(line.trim()));
}

// ─── Smart truncation ─────────────────────────────────────────────

/**
 * Smart truncation for bash output: keep head + tail, prioritize error sections.
 * Unlike file truncation, bash output errors tend to appear at the END.
 * So we allocate: ~40% head, ~60% tail (inverse of air-read).
 */
function smartTruncate(lines: string[], maxLines: number): string[] {
  if (maxLines <= 0 || lines.length <= maxLines) return lines;
  if (maxLines === 1) {
    return [`... (${lines.length} lines omitted) ...`];
  }

  // Check if there are error lines — if so, ensure they're in the kept portion
  const errorIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isErrorLine(lines[i])) {
      errorIndices.push(i);
    }
  }

  // If errors exist and are concentrated in a section, prioritize that section
  if (errorIndices.length > 0) {
    const errorStart = Math.max(0, errorIndices[0] - 3); // 3 lines context before first error
    const errorEnd = Math.min(lines.length, errorIndices[errorIndices.length - 1] + 4); // 3 lines after last error
    const errorSectionSize = errorEnd - errorStart;

    // If error section fits in budget, show head + error section + tail
    if (errorSectionSize < maxLines * 0.7) {
      const remainingBudget = maxLines - errorSectionSize;
      const contextBudget = Math.max(0, remainingBudget - 2);
      const headCount = Math.min(Math.floor(contextBudget * 0.4), errorStart);
      const tailCount = Math.min(
        contextBudget - headCount,
        lines.length - errorEnd
      );

      const result: string[] = [];

      // Head
      for (let i = 0; i < headCount; i++) {
        result.push(lines[i]);
      }

      // Omission before errors (if there's a gap)
      if (headCount < errorStart) {
        result.push(`... (${errorStart - headCount} lines omitted) ...`);
      }

      // Error section
      for (let i = errorStart; i < errorEnd; i++) {
        result.push(lines[i]);
      }

      // Omission after errors (if there's a gap)
      const tailStart = lines.length - tailCount;
      if (errorEnd < tailStart) {
        result.push(`... (${tailStart - errorEnd} lines omitted) ...`);
      }

      // Tail
      for (let i = tailStart; i < lines.length; i++) {
        result.push(lines[i]);
      }

      return result;
    }
  }

  // Default truncation: 40% head, 60% tail (errors tend to be at end for terminal output)
  const headCount = Math.floor(maxLines * 0.4);
  const tailCount = maxLines - headCount - 1; // -1 for marker line

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

/**
 * Smart truncation by token count.
 */
function smartTruncateByTokens(lines: string[], maxTokens: number): { lines: string[]; budgetExceeded: boolean } {
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
// ─── Main compressor ──────────────────────────────────────────────

export class BashCompressor {
  /**
   * Compress command/terminal output for AI consumption.
   */
  compress(content: string, options?: BashOptions): CompressResult {
    const opts: Required<
      Pick<
        BashOptions,
        | "stripAnsi"
        | "collapseBlanks"
        | "collapseRepeats"
        | "filterNoise"
      >
    > &
      BashOptions = {
      stripAnsi: true,
      collapseBlanks: true,
      collapseRepeats: true,
      filterNoise: true,
      ...options,
    };

    let text = content;
    const originalCharCount = content.length;

    // 1. Strip ANSI escape codes
    if (opts.stripAnsi) {
      text = stripAnsiCodes(text);
    }

    let lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const originalLineCount = lines.length;
    const maxLines =
      typeof opts.maxLines === "number" && Number.isFinite(opts.maxLines) && opts.maxLines > 0
        ? Math.floor(opts.maxLines)
        : undefined;
    const maxTokens =
      typeof opts.maxTokens === "number" && Number.isFinite(opts.maxTokens) && opts.maxTokens > 0
        ? Math.floor(opts.maxTokens)
        : undefined;

    // 2. Collapse consecutive blank lines
    if (opts.collapseBlanks) {
      lines = collapseBlanks(lines);
    }

    // 3. Filter noise patterns (progress bars, spinners, download indicators)
    let noiseRemoved = 0;
    if (opts.filterNoise) {
      const noiseResult = filterNoise(lines);
      lines = noiseResult.filtered;
      noiseRemoved = noiseResult.removedCount;
    }

    // 4. Collapse repeated/similar lines
    if (opts.collapseRepeats) {
      lines = collapseRepeatedLines(lines);
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

    const compressedContent = lines.join("\n");
    const compressedLineCount = lines.length;
    const compressedCharCount = compressedContent.length;

    // Count errors and warnings in output
    const errorCount = lines.filter((l) => isErrorLine(l)).length;
    const warningCount = lines.filter((l) => isWarningLine(l)).length;

    // Build stats footer
    const rawSavedPercent =
      originalCharCount > 0
        ? Math.round((1 - compressedCharCount / originalCharCount) * 100)
        : 0;
    const savedPercent = Math.max(0, rawSavedPercent);
    const statsLine = `--- air: ${originalLineCount} lines \u2192 ${compressedLineCount} lines (${savedPercent}% saved) ---`;

    const output = includeStats ? compressedContent + "\n" + statsLine : compressedContent;

    return {
      output,
      originalSize: originalLineCount,
      compressedSize: compressedLineCount,
      ratio: originalLineCount > 0 ? compressedLineCount / originalLineCount : 1,
      format: "air-bash",
      metadata: {
        originalLines: originalLineCount,
        compressedLines: compressedLineCount,
        savedPercent,
        errorCount,
        warningCount,
        noiseRemoved,
        command: opts.command,
        budgetExceeded,
        statsIncluded: includeStats,
      },
    };
  }
}

// ─── Exported utilities (for testing / advanced usage) ────────────

export { stripAnsiCodes, isErrorLine, isWarningLine, isNoiseLine };
