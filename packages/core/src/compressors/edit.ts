import type { CompressResult } from "../types.js";

type MatchMethod =
  | "exact"
  | "whitespace-normalized"
  | "line-hash"
  | "levenshtein";

type LineEndingMode = "auto" | "preserve" | "lf";

interface EditOperation {
  search: string;
  replace: string;
  context?: string;
  occurrence?: number;
}

export interface EditOptions {
  fileName?: string;
  edits: EditOperation[];
  dryRun?: boolean;
  fuzzyThreshold?: number;
  enableFuzzyMatch?: boolean;
  lineEnding?: LineEndingMode;
}

interface MatchResult {
  index: number;
  length: number;
  confidence: number;
  method: MatchMethod;
}

interface EditChange {
  edit: number;
  line: number;
  summary: string;
  confidence: number;
  method: MatchMethod;
}

interface EditApplyError {
  edit: number;
  reason: string;
}

interface EditMetadata {
  applied: number;
  total: number;
  status: "success" | "partial" | "error";
  changes: EditChange[];
  errors: EditApplyError[];
  modifiedContent: string;
}

interface ApplyEditResult {
  success: boolean;
  newContent?: string;
  lineNumber?: number;
  confidence?: number;
  method?: MatchMethod;
  reason?: string;
}

const DEFAULT_OPTIONS: Required<
  Pick<EditOptions, "fuzzyThreshold" | "enableFuzzyMatch" | "lineEnding" | "dryRun">
> = {
  fuzzyThreshold: 0.1,
  enableFuzzyMatch: true,
  lineEnding: "auto",
  dryRun: false,
};

function countLines(text: string): number {
  if (text === "") return 0;
  return text.split("\n").length;
}

function normalizeToLf(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

class EditMatcher {
  findMatch(
    content: string,
    search: string,
    context?: string,
    occurrence = 1,
    fuzzyThreshold = 0.1,
    enableFuzzy = true
  ): MatchResult | null {
    const exactMatches = this.collectExactMatches(content, search);
    const exact = this.findOccurrence(exactMatches, occurrence);
    if (exact) return exact;

    if (!enableFuzzy) return null;

    const wsMatches = this.whitespaceNormalizedMatch(content, search);
    const ws = this.findOccurrence(wsMatches, occurrence);
    if (ws) return ws;

    const hashMatches = this.hashBasedMatch(content, search);
    const hash = this.findOccurrence(hashMatches, occurrence);
    if (hash) return hash;

    if (content.length > 1024 * 1024) return null;

    const levMatches = this.levenshteinMatch(content, search, context, fuzzyThreshold);
    return this.findOccurrence(levMatches, occurrence);
  }

  private findOccurrence(matches: MatchResult[], occurrence = 1): MatchResult | null {
    if (matches.length === 0) return null;
    if (occurrence === 0) return null;

    if (occurrence > 0) {
      return matches[occurrence - 1] ?? null;
    }

    const fromEnd = Math.abs(occurrence);
    return matches[matches.length - fromEnd] ?? null;
  }

  private collectExactMatches(content: string, search: string): MatchResult[] {
    if (!search) return [];

    const out: MatchResult[] = [];
    let from = 0;

    while (from <= content.length) {
      const index = content.indexOf(search, from);
      if (index === -1) break;

      out.push({
        index,
        length: search.length,
        confidence: 1,
        method: "exact",
      });
      from = index + 1;
    }

    return out;
  }

  private whitespaceNormalizedMatch(content: string, search: string): MatchResult[] {
    const { normalized, map } = this.normalizeWithMap(content);
    const normalizedSearch = search.replace(/\s+/g, " ").trim();
    if (!normalizedSearch) return [];

    const out: MatchResult[] = [];
    let from = 0;

    while (from <= normalized.length) {
      const normIndex = normalized.indexOf(normalizedSearch, from);
      if (normIndex === -1) break;

      const start = this.mapNormToOrig(map, normIndex);
      const endNorm = normIndex + normalizedSearch.length - 1;
      const end = this.mapNormToOrig(map, endNorm) + 1;

      out.push({
        index: start,
        length: end - start,
        confidence: 0.95,
        method: "whitespace-normalized",
      });

      from = normIndex + 1;
    }

    return out;
  }

  private hashBasedMatch(content: string, search: string): MatchResult[] {
    const searchLines = search.split("\n").map((line) => line.trim());
    if (searchLines.length === 0) return [];

    const contentLines = content.split("\n");
    if (contentLines.length < searchLines.length) return [];

    const lineStarts: number[] = [];
    let cursor = 0;
    for (const line of contentLines) {
      lineStarts.push(cursor);
      cursor += line.length + 1;
    }

    const searchHashes = searchLines.map((line) => this.simpleHash(line));
    const out: MatchResult[] = [];

    for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
      const windowHashes = contentLines
        .slice(i, i + searchLines.length)
        .map((line) => this.simpleHash(line.trim()));

      if (!this.arraysEqual(searchHashes, windowHashes)) continue;

      const startIndex = lineStarts[i];
      const endLine = i + searchLines.length - 1;
      const endIndex = lineStarts[endLine] + contentLines[endLine].length;

      out.push({
        index: startIndex,
        length: endIndex - startIndex,
        confidence: 0.85,
        method: "line-hash",
      });
    }

    return out;
  }

  private levenshteinMatch(
    content: string,
    search: string,
    context: string | undefined,
    threshold: number
  ): MatchResult[] {
    if (!context) return [];

    const contextIndex = content.indexOf(context);
    if (contextIndex === -1) return [];

    const rangeStart = Math.max(0, contextIndex - 500);
    const rangeEnd = Math.min(content.length, contextIndex + context.length + 500);
    const scoped = content.slice(rangeStart, rangeEnd);

    const minLen = Math.max(1, Math.floor(search.length * 0.8));
    const maxLen = Math.max(minLen, Math.ceil(search.length * 1.2));

    if (search.length > 500) {
      return [];
    }

    const out: MatchResult[] = [];

    for (let i = 0; i < scoped.length; i++) {
      for (let len = minLen; len <= maxLen; len++) {
        if (i + len > scoped.length) break;
        const candidate = scoped.slice(i, i + len);
        if (!candidate) continue;

        const distance = this.levenshteinDistance(search, candidate);
        const ratio = distance / Math.max(search.length, candidate.length);
        if (ratio > threshold) continue;

        out.push({
          index: rangeStart + i,
          length: candidate.length,
          confidence: Math.max(0.5, 1 - ratio),
          method: "levenshtein",
        });
      }
    }

    return out.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.index - b.index;
    });
  }

  private normalizeWithMap(text: string): { normalized: string; map: number[] } {
    const chars: string[] = [];
    const map: number[] = [];
    let previousWasWhitespace = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (/\s/.test(char)) {
        if (!previousWasWhitespace) {
          chars.push(" ");
          map.push(i);
          previousWasWhitespace = true;
        }
        continue;
      }

      chars.push(char);
      map.push(i);
      previousWasWhitespace = false;
    }

    let start = 0;
    while (start < chars.length && chars[start] === " ") start++;

    let end = chars.length;
    while (end > start && chars[end - 1] === " ") end--;

    return {
      normalized: chars.slice(start, end).join(""),
      map: map.slice(start, end),
    };
  }

  private mapNormToOrig(map: number[], normalizedIndex: number): number {
    if (map.length === 0) return 0;
    const bounded = Math.max(0, Math.min(normalizedIndex, map.length - 1));
    return map[bounded];
  }

  private simpleHash(input: string): number {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return hash >>> 0;
  }

  private arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let previous = new Array<number>(b.length + 1);
    let current = new Array<number>(b.length + 1);

    for (let j = 0; j <= b.length; j++) {
      previous[j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      current[0] = i;
      const ai = a.charCodeAt(i - 1);

      for (let j = 1; j <= b.length; j++) {
        const bj = b.charCodeAt(j - 1);
        const cost = ai === bj ? 0 : 1;

        const insertion = current[j - 1] + 1;
        const deletion = previous[j] + 1;
        const substitution = previous[j - 1] + cost;

        current[j] = Math.min(insertion, deletion, substitution);
      }

      const swap = previous;
      previous = current;
      current = swap;
    }

    return previous[b.length];
  }
}

class ChangeSummarizer {
  summarize(input: {
    fileName: string;
    applied: number;
    total: number;
    changes: Array<{ line: number; summary: string }>;
    errors: Array<{ edit: number; reason: string }>;
    originalContent: string;
  }): string {
    const summaryLines: string[] = [];

    for (const change of input.changes) {
      summaryLines.push(`  Line ${change.line}: ${change.summary}`);
    }

    for (const err of input.errors) {
      summaryLines.push(`  ✗ Edit ${err.edit}: ${err.reason}`);
    }

    const icon = input.applied === input.total ? "✓" : input.applied === 0 ? "✗" : "⚠";
    const originalLines = countLines(normalizeToLf(input.originalContent));
    const outputLines = summaryLines.length + 2;
    const rawSavings =
      originalLines > 0
        ? Math.round((1 - outputLines / originalLines) * 100)
        : 0;
    const savings = Math.max(0, rawSavings);

    return [
      `${icon} ${input.applied}/${input.total} changes applied to ${input.fileName}`,
      ...summaryLines,
      `--- air: ${originalLines} lines → ${outputLines} lines (${savings}% saved) ---`,
    ].join("\n");
  }

  buildSingleSummary(search: string, replace: string): string {
    const info = this.classifyChange(search, replace);

    const deltaLabel =
      info.lineDelta === 0
        ? "0 lines"
        : info.lineDelta > 0
          ? `+${info.lineDelta} lines`
          : `${info.lineDelta} lines`;

    if (info.type === "removed") {
      return `removed (${deltaLabel}): ${this.truncate(search, 60)}`;
    }
    if (info.type === "added") {
      return `added (${deltaLabel}): ${this.truncate(replace, 60)}`;
    }

    return `modified (${deltaLabel}): ${this.truncate(search, 30)} → ${this.truncate(replace, 30)}`;
  }

  private classifyChange(search: string, replace: string): {
    type: "removed" | "added" | "modified";
    lineDelta: number;
  } {
    const searchLines = this.countLinesFragment(search);
    const replaceLines = this.countLinesFragment(replace);
    const lineDelta = replaceLines - searchLines;

    if (replace === "") return { type: "removed", lineDelta };
    if (search === "") return { type: "added", lineDelta };
    return { type: "modified", lineDelta };
  }

  private countLinesFragment(text: string): number {
    if (text === "") return 0;
    return text.split("\n").length;
  }

  private truncate(text: string, maxLength: number): string {
    const singleLine = text.replace(/\n/g, " ");
    return singleLine.length <= maxLength
      ? singleLine
      : `${singleLine.slice(0, maxLength)}...`;
  }
}

export class EditCompressor {
  private readonly matcher = new EditMatcher();
  private readonly summarizer = new ChangeSummarizer();

  compress(content: string, options: EditOptions): CompressResult {
    const merged = {
      ...DEFAULT_OPTIONS,
      ...options,
      edits: options.edits ?? [],
    };

    const originalContent = content;
    let workingContent = normalizeToLf(content);

    const changes: EditChange[] = [];
    const errors: EditApplyError[] = [];

    for (let i = 0; i < merged.edits.length; i++) {
      const normalizedEdit = this.normalizeEdit(merged.edits[i]);
      const result = this.applyEdit(workingContent, normalizedEdit, merged);

      if (!result.success || result.newContent === undefined) {
        errors.push({ edit: i + 1, reason: result.reason ?? "unknown error" });
        continue;
      }

      workingContent = result.newContent;
      changes.push({
        edit: i + 1,
        line: result.lineNumber ?? 1,
        summary: this.summarizer.buildSingleSummary(normalizedEdit.search, normalizedEdit.replace),
        confidence: result.confidence ?? 1,
        method: result.method ?? "exact",
      });
    }

    const applied = changes.length;
    const total = merged.edits.length;
    const status: EditMetadata["status"] =
      applied === total ? "success" : applied === 0 ? "error" : "partial";

    const restoredContent = this.restoreLineEndings(workingContent, originalContent, merged.lineEnding);
    const modifiedContent = merged.dryRun ? originalContent : restoredContent;

    const summary = this.summarizer.summarize({
      fileName: merged.fileName ?? "<memory>",
      applied,
      total,
      changes,
      errors,
      originalContent,
    });

    const normalizedOriginal = normalizeToLf(originalContent);
    const originalSize = countLines(normalizedOriginal);
    const compressedSize = countLines(summary);

    return {
      output: summary,
      originalSize,
      compressedSize,
      ratio: originalSize > 0 ? compressedSize / originalSize : 1,
      format: "air-edit",
      metadata: {
        applied,
        total,
        status,
        changes,
        errors,
        modifiedContent,
      } satisfies EditMetadata,
    };
  }

  private applyEdit(
    content: string,
    edit: EditOperation,
    options: Required<
      Pick<EditOptions, "fuzzyThreshold" | "enableFuzzyMatch" | "lineEnding" | "dryRun">
    >
  ): ApplyEditResult {
    if (edit.search === "") {
      return {
        success: true,
        newContent: `${content}${edit.replace}`,
        lineNumber: this.indexToLine(content, content.length),
        confidence: 1,
        method: "exact",
      };
    }

    if (edit.search === edit.replace) {
      const index = content.indexOf(edit.search);
      if (index === -1) {
        return { success: false, newContent: content };
      }
      return {
        success: true,
        newContent: content,
        lineNumber: this.indexToLine(content, index),
        confidence: 1,
        method: "exact",
      };
    }

    const match = this.matcher.findMatch(
      content,
      edit.search,
      edit.context,
      edit.occurrence,
      options.fuzzyThreshold,
      options.enableFuzzyMatch
    );

    if (!match) {
      return { success: false, reason: "NO_MATCH" };
    }

    return {
      success: true,
      newContent: `${content.slice(0, match.index)}${edit.replace}${content.slice(match.index + match.length)}`,
      lineNumber: this.indexToLine(content, match.index),
      confidence: match.confidence,
      method: match.method,
    };
  }

  private normalizeEdit(edit: EditOperation): EditOperation {
    return {
      ...edit,
      search: normalizeToLf(edit.search),
      replace: normalizeToLf(edit.replace),
      context: edit.context === undefined ? undefined : normalizeToLf(edit.context),
    };
  }

  private restoreLineEndings(
    content: string,
    originalContent: string,
    mode: LineEndingMode
  ): string {
    if (mode === "lf") {
      return content;
    }

    const originalUsesCrlf = /\r\n/.test(originalContent);
    if (!originalUsesCrlf) return content;
    return content.replace(/\n/g, "\r\n");
  }

  private indexToLine(content: string, index: number): number {
    if (index < 0) return 1;
    return content.slice(0, index).split("\n").length;
  }
}

export type { EditMetadata, EditChange, EditApplyError, EditOperation, MatchMethod };
