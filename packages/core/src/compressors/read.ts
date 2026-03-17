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
  /** Output mode: "full" (default, current behavior) or "skeleton" (collapse function bodies) */
  mode?: "full" | "skeleton";
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

// --- Skeleton mode: language-specific signature patterns ---

interface SignaturePatterns {
  functionSignature: RegExp;
  braceStyle: "brace" | "indent" | "end-keyword";
}

const SKELETON_PATTERNS: Record<string, SignaturePatterns> = {
  typescript: {
    functionSignature:
      /^(\s*)(export\s+)?(export\s+default\s+)?(declare\s+)?(abstract\s+)?(async\s+)?(function\s*\*?\s+\w+|class\s+\w+|interface\s+\w+|enum\s+\w+|type\s+\w+\s*=\s*\{|(const|let|var)\s+\w+\s*=\s*(\(|async\s*\()|(?!if|else|for|while|do|switch|try|catch|finally|return|throw|with)\w+\s*\([^)]*\)\s*(:\s*\S+)?\s*\{)/,
    braceStyle: "brace",
  },
  javascript: {
    functionSignature:
      /^(\s*)(export\s+)?(export\s+default\s+)?(async\s+)?(function\s*\*?\s+\w+|class\s+\w+|(const|let|var)\s+\w+\s*=\s*(\(|async\s*\(|function)|(?!if|else|for|while|do|switch|try|catch|finally|return|throw|with)\w+\s*\([^)]*\)\s*\{)/,
    braceStyle: "brace",
  },
  python: {
    functionSignature: /^(\s*)(async\s+)?(def\s+\w+|class\s+\w+)/,
    braceStyle: "indent",
  },
  go: {
    functionSignature: /^(\s*)(func\s+|type\s+\w+\s+(struct|interface)\s*\{)/,
    braceStyle: "brace",
  },
  rust: {
    functionSignature:
      /^(\s*)(pub(\s*\(crate\))?\s+)?(unsafe\s+)?(async\s+)?(fn\s+\w+|impl\s+|struct\s+\w+|enum\s+\w+|trait\s+\w+|mod\s+\w+)/,
    braceStyle: "brace",
  },
  java: {
    functionSignature:
      /^(\s*)(public|private|protected|static|final|abstract|synchronized|native|strictfp|\s)*\s*(class\s+\w+|interface\s+\w+|enum\s+\w+|(\w+(<[^>]*>)?)\s+\w+\s*\()/,
    braceStyle: "brace",
  },
  csharp: {
    functionSignature:
      /^(\s*)(public|private|protected|internal|static|virtual|override|abstract|sealed|async|partial|\s)*\s*(class\s+\w+|interface\s+\w+|enum\s+\w+|struct\s+\w+|(\w+(<[^>]*>)?)\s+\w+\s*\()/,
    braceStyle: "brace",
  },
  cpp: {
    functionSignature:
      /^(\s*)(virtual\s+|static\s+|inline\s+|explicit\s+|extern\s+|const\s+|template\s*<[^>]*>\s*)*(class\s+\w+|struct\s+\w+|enum\s+|namespace\s+\w+|(\w+(::\w+)?(<[^>]*>)?\s*\*?\s*&?\s*)\s+\w+\s*\()/,
    braceStyle: "brace",
  },
  c: {
    functionSignature:
      /^(\s*)(static\s+|inline\s+|extern\s+|const\s+)*(struct\s+\w+|enum\s+|(\w+\s*\*?\s*)\s+\w+\s*\()/,
    braceStyle: "brace",
  },
  ruby: {
    functionSignature: /^(\s*)(def\s+\w+|class\s+\w+|module\s+\w+)/,
    braceStyle: "end-keyword",
  },
  shell: {
    functionSignature: /^(\s*)(function\s+\w+|\w+\s*\(\s*\)\s*\{?)/,
    braceStyle: "brace",
  },
  php: {
    functionSignature:
      /^(\s*)(public|private|protected|static|final|abstract|\s)*\s*(function\s+\w+|class\s+\w+|interface\s+\w+|trait\s+\w+|enum\s+\w+)/,
    braceStyle: "brace",
  },
  kotlin: {
    functionSignature:
      /^(\s*)(public|private|protected|internal|open|override|abstract|final|suspend|inline|\s)*\s*(fun\s+|class\s+\w+|interface\s+\w+|enum\s+class\s+\w+|object\s+\w+)/,
    braceStyle: "brace",
  },
  swift: {
    functionSignature:
      /^(\s*)(public|private|fileprivate|internal|open|override|static|class|final|mutating|\s)*\s*(func\s+\w+|class\s+\w+|struct\s+\w+|enum\s+\w+|protocol\s+\w+)/,
    braceStyle: "brace",
  },
};

function getSkeletonPatterns(lang: string): SignaturePatterns | undefined {
  return SKELETON_PATTERNS[lang];
}

function isSingleLineBraceFunction(line: string): boolean {
  const bc = countBraces(line);
  return bc.open > 0 && bc.close >= bc.open;
}

function countBraces(line: string): { open: number; close: number } {
  let open = 0;
  let close = 0;
  let inString = false;
  let stringChar = "";
  let escaped = false;
  for (let idx = 0; idx < line.length; idx++) {
    const ch = line[idx];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (inString) {
      if (ch === stringChar) inString = false;
      continue;
    }
    // Detect // line comment (outside strings)
    if (ch === "/" && idx + 1 < line.length && line[idx + 1] === "/") {
      break; // Stop counting — rest is comment
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "{") open++;
    else if (ch === "}") close++;
  }
  return { open, close };
}

function collapseFunctionBodies(
  lines: string[],
  lang: LanguageInfo
): string[] {
  const patterns = getSkeletonPatterns(lang.language);
  if (!patterns) return lines;

  if (patterns.braceStyle === "indent") {
    return collapseByIndent(lines, patterns);
  }
  if (patterns.braceStyle === "end-keyword") {
    return collapseByEndKeyword(lines, patterns);
  }
  return collapseByBraces(lines, patterns);
}

function collapseByBraces(
  lines: string[],
  patterns: SignaturePatterns
): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!patterns.functionSignature.test(line)) {
      result.push(line);
      i++;
      continue;
    }

    if (isSingleLineBraceFunction(line)) {
      result.push(line);
      i++;
      continue;
    }

    const sigIndent = getIndent(line);
    const bc = countBraces(line);
    let braceDepth = bc.open - bc.close;

    if (braceDepth > 0) {
      // Brace on signature line: `function foo() {`
      result.push(line);
      i++;
      const bodyStart = i;

      while (i < lines.length && braceDepth > 0) {
        const ibc = countBraces(lines[i]);
        braceDepth += ibc.open - ibc.close;
        i++;
      }

      const closingIdx = i - 1;
      const bodyLines = closingIdx - bodyStart;

      if (bodyLines < 3) {
        for (let k = bodyStart; k <= closingIdx; k++) result.push(lines[k]);
      } else {
        result.push(`${" ".repeat(sigIndent + 2)}... (${bodyLines} lines collapsed)`);
        result.push(lines[closingIdx]);
      }
    } else {
      // No brace on signature line — check next line
      result.push(line);
      i++;

      if (i >= lines.length) continue;

      const nextBc = countBraces(lines[i]);
      if (nextBc.open <= 0) continue;

      braceDepth = nextBc.open - nextBc.close;
      if (braceDepth <= 0) {
        result.push(lines[i]);
        i++;
        continue;
      }

      const braceLineIdx = i;
      i++;

      while (i < lines.length && braceDepth > 0) {
        const ibc = countBraces(lines[i]);
        braceDepth += ibc.open - ibc.close;
        i++;
      }

      const closingIdx = i - 1;
      const totalBodyLines = closingIdx - braceLineIdx;

      if (totalBodyLines < 3) {
        for (let k = braceLineIdx; k <= closingIdx; k++) result.push(lines[k]);
      } else {
        result.push(lines[braceLineIdx]);
        result.push(`${" ".repeat(sigIndent + 2)}... (${totalBodyLines - 1} lines collapsed)`);
        result.push(lines[closingIdx]);
      }
    }
  }

  return result;
}

function collapseByIndent(
  lines: string[],
  patterns: SignaturePatterns
): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!patterns.functionSignature.test(line)) {
      result.push(line);
      i++;
      continue;
    }

    // Preserve decorator lines above (already pushed)
    result.push(line);
    const sigIndent = getIndent(line);
    i++;

    // Body = consecutive lines with indent > sigIndent (or blank lines within)
    const bodyStart = i;
    while (i < lines.length) {
      const currentLine = lines[i];
      if (currentLine.trim() === "") {
        // Blank line — check if next non-blank is still indented
        let peek = i + 1;
        while (peek < lines.length && lines[peek].trim() === "") peek++;
        if (peek < lines.length && getIndent(lines[peek]) > sigIndent) {
          i++;
          continue;
        }
        break;
      }
      if (getIndent(currentLine) > sigIndent) {
        i++;
      } else {
        break;
      }
    }

    const bodyLen = i - bodyStart;
    if (bodyLen < 3) {
      for (let k = bodyStart; k < i; k++) {
        result.push(lines[k]);
      }
    } else {
      result.push(`${" ".repeat(sigIndent + 4)}... (${bodyLen} lines collapsed)`);
    }
  }

  return result;
}

function collapseByEndKeyword(
  lines: string[],
  patterns: SignaturePatterns
): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!patterns.functionSignature.test(line)) {
      result.push(line);
      i++;
      continue;
    }

    result.push(line);
    const sigIndent = getIndent(line);
    i++;

    const bodyStart = i;
    // Find matching `end` at same indent level
    while (i < lines.length) {
      if (/^end(\s|$|;)/.test(lines[i].trimStart()) && getIndent(lines[i]) <= sigIndent) {
        break;
      }
      i++;
    }

    const bodyLen = i - bodyStart;
    if (bodyLen < 3) {
      for (let k = bodyStart; k < i; k++) {
        result.push(lines[k]);
      }
    } else {
      result.push(`${" ".repeat(sigIndent + 2)}... (${bodyLen} lines collapsed)`);
    }
    // Push the `end` line
    if (i < lines.length) {
      result.push(lines[i]);
      i++;
    }
  }

  return result;
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
        | "mode"
      >
    > &
      ReadOptions = {
      lineNumbers: false,
      collapseComments: true,
      collapseImports: true,
      collapseBlanks: true,
      mode: "full",
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

    // 4.5. Skeleton mode: collapse function bodies
    if (opts.mode === "skeleton") {
      lines = collapseFunctionBodies(lines, lang);
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
      format: "air-read",
      metadata: {
        originalLines: originalLineCount,
        compressedLines: compressedLineCount,
        savedPercent,
        language: lang.language,
        budgetExceeded,
        statsIncluded: includeStats,
        mode: opts.mode,
      },
    };
  }
}
