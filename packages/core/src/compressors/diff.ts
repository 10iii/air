import type { CompressResult } from "../types.js";
import { estimateTokens } from "../utils/index.js";

export interface DiffOptions {
  maxLines?: number;
  maxTokens?: number;
  level?: "summary" | "compact" | "full";
}

type DiffOperation = "A" | "D" | "M" | "R";

interface DiffStats {
  files: number;
  insertions: number;
  deletions: number;
}

interface DiffHunk {
  header: string;
  lines: string[];
  additions: number;
  deletions: number;
  start: number;
  endExclusive: number;
}

interface DiffFile {
  oldPath: string;
  newPath: string;
  operation: DiffOperation;
  renameFrom?: string;
  renameTo?: string;
  similarity?: number;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  rawLines: string[];
  binary: boolean;
}

interface RenderChunk {
  priority: string[];
  rest: string[];
}

interface TokenTruncateResult {
  lines: string[];
  budgetExceeded: boolean;
}

function parsePositiveInt(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function normalizeGitPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "/dev/null") return trimmed;

  const unquoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;

  if (unquoted.startsWith("a/")) return unquoted.slice(2);
  if (unquoted.startsWith("b/")) return unquoted.slice(2);
  return unquoted;
}

function parseDiffHeader(line: string): { oldPath: string; newPath: string } | null {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
  if (!match) return null;
  return {
    oldPath: normalizeGitPath(match[1]),
    newPath: normalizeGitPath(match[2]),
  };
}

function parseSimilarity(line: string): number | undefined {
  const match = /^similarity index\s+(\d+)%$/i.exec(line.trim());
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

function parseHunks(rawLines: string[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];
    if (!line.startsWith("@@ ")) {
      i++;
      continue;
    }

    const header = line;
    const start = i;
    let j = i + 1;
    while (j < rawLines.length && !rawLines[j].startsWith("@@ ")) {
      if (rawLines[j].startsWith("diff --git ")) {
        break;
      }
      j++;
    }

    const bodyLines = rawLines.slice(i + 1, j);
    let additions = 0;
    let deletions = 0;
    for (const bodyLine of bodyLines) {
      if (bodyLine.startsWith("+") && !bodyLine.startsWith("+++")) additions++;
      if (bodyLine.startsWith("-") && !bodyLine.startsWith("---")) deletions++;
    }

    hunks.push({
      header,
      lines: bodyLines,
      additions,
      deletions,
      start,
      endExclusive: j,
    });

    i = j;
  }

  return hunks;
}

function detectOperation(args: {
  renameFrom?: string;
  renameTo?: string;
  similarity?: number;
  oldPath: string;
  newPath: string;
  rawLines: string[];
}): DiffOperation {
  const { renameFrom, renameTo, similarity, oldPath, newPath, rawLines } = args;
  const hasRenameMeta = Boolean(renameFrom && renameTo);
  const inferredRename = similarity !== undefined && oldPath !== newPath;
  if (hasRenameMeta || inferredRename) return "R";

  const hasNewFileMode = rawLines.some((line) => line.startsWith("new file mode "));
  const hasDeletedFileMode = rawLines.some((line) => line.startsWith("deleted file mode "));
  const oldDevNull = rawLines.some((line) => line.startsWith("--- /dev/null")) || oldPath === "/dev/null";
  const newDevNull = rawLines.some((line) => line.startsWith("+++ /dev/null")) || newPath === "/dev/null";

  if (hasNewFileMode || oldDevNull) return "A";
  if (hasDeletedFileMode || newDevNull) return "D";
  return "M";
}

function parseDiffFiles(lines: string[]): DiffFile[] {
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("diff --git ")) {
      starts.push(i);
    }
  }

  if (starts.length === 0) return [];

  const files: DiffFile[] = [];

  for (let index = 0; index < starts.length; index++) {
    const start = starts[index];
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
    const raw = lines.slice(start, end);
    const header = parseDiffHeader(raw[0]);
    if (!header) continue;

    let renameFrom: string | undefined;
    let renameTo: string | undefined;
    let similarity: number | undefined;
    let binary = false;

    for (const line of raw) {
      if (line.startsWith("rename from ")) {
        renameFrom = normalizeGitPath(line.slice("rename from ".length));
      } else if (line.startsWith("rename to ")) {
        renameTo = normalizeGitPath(line.slice("rename to ".length));
      } else if (line.startsWith("Binary files ") || line === "GIT binary patch") {
        binary = true;
      }

      const parsedSimilarity = parseSimilarity(line);
      if (parsedSimilarity !== undefined) {
        similarity = parsedSimilarity;
      }
    }

    const hunks = parseHunks(raw);
    const additions = hunks.reduce((sum, hunk) => sum + hunk.additions, 0);
    const deletions = hunks.reduce((sum, hunk) => sum + hunk.deletions, 0);
    const operation = detectOperation({
      renameFrom,
      renameTo,
      similarity,
      oldPath: header.oldPath,
      newPath: header.newPath,
      rawLines: raw,
    });

    files.push({
      oldPath: header.oldPath,
      newPath: header.newPath,
      operation,
      renameFrom,
      renameTo,
      similarity,
      additions,
      deletions,
      hunks,
      rawLines: raw,
      binary,
    });
  }

  return files;
}

function extractStatsFromContent(lines: string[]): DiffStats | undefined {
  for (const line of lines) {
    const match =
      /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/i.exec(
        line
      );

    if (!match) continue;

    return {
      files: Number(match[1]) || 0,
      insertions: Number(match[2] ?? "0") || 0,
      deletions: Number(match[3] ?? "0") || 0,
    };
  }

  return undefined;
}

function computeStats(files: DiffFile[]): DiffStats {
  return {
    files: files.length,
    insertions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
}

function formatDelta(additions: number, deletions: number, operation: DiffOperation): string {
  if (operation === "A") {
    if (additions > 0) return ` (+${additions})`;
    return "";
  }
  if (operation === "D") {
    if (deletions > 0) return ` (-${deletions})`;
    return "";
  }

  const parts: string[] = [];
  if (additions > 0) parts.push(`+${additions}`);
  if (deletions > 0) parts.push(`-${deletions}`);
  if (parts.length === 0) return "";
  return ` (${parts.join(" ")})`;
}

function buildSummaryLine(file: DiffFile): string {
  if (file.operation === "R") {
    const from = file.renameFrom ?? file.oldPath;
    const to = file.renameTo ?? file.newPath;
    const similarityText =
      file.similarity !== undefined ? ` (similarity ${file.similarity}%)` : "";
    return `R ${from} → ${to}${similarityText}`;
  }

  const path = file.operation === "D" ? file.oldPath : file.newPath;
  const binarySuffix = file.binary ? " (binary)" : "";
  return `${file.operation} ${path}${formatDelta(file.additions, file.deletions, file.operation)}${binarySuffix}`;
}

function renderSummaryMode(files: DiffFile[], stats: DiffStats): string[] {
  const lines: string[] = [`${stats.files} files changed, +${stats.insertions} -${stats.deletions}`];
  for (const file of files) {
    lines.push(buildSummaryLine(file));
  }
  return lines;
}

function buildCompactHunkLines(file: DiffFile, hunk: DiffHunk): string[] {
  const changed = hunk.lines.filter((line) => line.startsWith("+") || line.startsWith("-") || line.startsWith("\\"));
  if (changed.length === 0) {
    return [hunk.header, "  ... context omitted ..."];
  }
  return [hunk.header, ...changed];
}

function renderCompactChunks(files: DiffFile[]): RenderChunk[] {
  const chunks: RenderChunk[] = [];

  for (const file of files) {
    const header = buildSummaryLine(file);

    if (file.binary || file.hunks.length === 0) {
      const binaryLine = file.binary ? ["Binary file changed"] : ["No textual hunks"];
      chunks.push({
        priority: [header, ...binaryLine],
        rest: [],
      });
      continue;
    }

    const first = buildCompactHunkLines(file, file.hunks[0]);
    const rest: string[] = [];
    for (let i = 1; i < file.hunks.length; i++) {
      rest.push(...buildCompactHunkLines(file, file.hunks[i]));
    }

    chunks.push({
      priority: [header, ...first],
      rest,
    });
  }

  return chunks;
}

function renderFullChunks(files: DiffFile[]): RenderChunk[] {
  const chunks: RenderChunk[] = [];

  for (const file of files) {
    if (file.rawLines.length === 0) {
      chunks.push({ priority: [], rest: [] });
      continue;
    }

    if (file.hunks.length === 0) {
      const keep = file.rawLines.slice(0, Math.min(file.rawLines.length, 6));
      const rest = file.rawLines.slice(keep.length);
      chunks.push({ priority: keep, rest });
      continue;
    }

    const firstHunk = file.hunks[0];
    const priority = file.rawLines.slice(0, firstHunk.endExclusive);
    const rest = file.rawLines.slice(firstHunk.endExclusive);
    chunks.push({ priority, rest });
  }

  return chunks;
}

function flattenChunks(chunks: RenderChunk[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    lines.push(...chunk.priority, ...chunk.rest);
    if (i < chunks.length - 1) lines.push("");
  }
  return lines;
}

function renderPriorityFirst(chunks: RenderChunk[], maxLines: number): string[] {
  if (maxLines <= 0) return [];
  const all = flattenChunks(chunks);
  if (all.length <= maxLines) return all;
  if (maxLines === 1) return [`... (${all.length} lines omitted) ...`];

  const core: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    core.push(...chunk.priority);
    if (i < chunks.length - 1) core.push("");
  }

  if (core.length >= maxLines) {
    const available = maxLines - 1;
    const headCount = Math.max(1, Math.floor(available * 0.75));
    const tailCount = Math.max(0, available - headCount);
    const omitted = core.length - headCount - tailCount;
    if (omitted <= 0) return core.slice(0, maxLines);
    return [
      ...core.slice(0, headCount),
      `... (${omitted} lines omitted) ...`,
      ...core.slice(core.length - tailCount),
    ];
  }

  const rest: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    rest.push(...chunk.rest);
    if (i < chunks.length - 1 && chunk.rest.length > 0) rest.push("");
  }

  const remaining = maxLines - core.length;
  if (rest.length <= remaining) {
    return [...core, ...rest];
  }

  if (remaining === 1) {
    return [...core, `... (${rest.length} lines omitted) ...`];
  }

  const keep = remaining - 1;
  const omitted = rest.length - keep;
  return [...core, ...rest.slice(0, keep), `... (${omitted} lines omitted) ...`];
}

function truncateByTokens(
  chunks: RenderChunk[],
  maxTokens: number,
  truncateByLines: (lineBudget: number) => string[]
): TokenTruncateResult {
  const all = flattenChunks(chunks);
  const total = all.reduce((sum, line) => sum + estimateTokens(line + "\n"), 0);
  if (total <= maxTokens) return { lines: all, budgetExceeded: false };

  const tokenCache = new Map<number, number>();
  const tokensFor = (lineBudget: number): number => {
    const cached = tokenCache.get(lineBudget);
    if (cached !== undefined) return cached;
    const lines = truncateByLines(lineBudget);
    const tokens = lines.reduce((sum, line) => sum + estimateTokens(line + "\n"), 0);
    tokenCache.set(lineBudget, tokens);
    return tokens;
  };

  const step = Math.max(1, Math.floor(Math.sqrt(Math.max(1, all.length))));
  let firstFit = 0;
  let lastOver = all.length + 1;

  for (let tryLines = all.length; tryLines >= 1; tryLines -= step) {
    if (tokensFor(tryLines) <= maxTokens) {
      firstFit = tryLines;
      break;
    }
    lastOver = tryLines;
  }

  if (firstFit === 0) {
    if (tokensFor(1) <= maxTokens) {
      firstFit = 1;
      lastOver = Math.min(all.length + 1, 1 + step);
    } else {
      return {
        lines: truncateByLines(1),
        budgetExceeded: true,
      };
    }
  }

  let best = firstFit;
  const refineTop = Math.min(all.length, lastOver - 1);
  for (let tryLines = refineTop; tryLines > firstFit; tryLines--) {
    if (tokensFor(tryLines) <= maxTokens) {
      best = tryLines;
      break;
    }
  }

  return {
    lines: truncateByLines(Math.max(1, best)),
    budgetExceeded: false,
  };
}

export class DiffCompressor {
  compress(content: string, options?: DiffOptions): CompressResult {
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const originalLineCount = normalized.split("\n").length;
    const originalCharCount = normalized.length;

    const level = options?.level ?? "compact";
    const maxLines = parsePositiveInt(options?.maxLines);
    const maxTokens = parsePositiveInt(options?.maxTokens);

    const sourceLines = normalized.split("\n");
    const files = parseDiffFiles(sourceLines);
    const computedStats = computeStats(files);
    const extractedStats = extractStatsFromContent(sourceLines);
    const stats = extractedStats ?? computedStats;

    let bodyLines: string[] = [];
    let chunks: RenderChunk[] = [];

    if (level === "summary") {
      bodyLines = renderSummaryMode(files, stats);
    } else if (level === "compact") {
      chunks = renderCompactChunks(files);
      bodyLines = flattenChunks(chunks);
    } else {
      chunks = renderFullChunks(files);
      bodyLines = flattenChunks(chunks);
    }

    if (bodyLines.length === 0) {
      bodyLines = [`0 files changed, +0 -0`];
    }

    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === "") {
      bodyLines.pop();
    }

    let includeStats = true;
    const footerEstimatedLines = 1;
    const footerEstimatedTokens = 25;
    let budgetExceeded = false;

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

    const truncateByLines = (lineBudget: number): string[] => {
      if (level === "summary") {
        if (bodyLines.length <= lineBudget) return [...bodyLines];
        if (lineBudget === 1) return [`... (${bodyLines.length} lines omitted) ...`];
        const keep = Math.max(1, lineBudget - 1);
        return [...bodyLines.slice(0, keep), `... (${bodyLines.length - keep} lines omitted) ...`];
      }
      return renderPriorityFirst(chunks, lineBudget);
    };

    if (effectiveMaxLines !== undefined && bodyLines.length > effectiveMaxLines) {
      bodyLines = truncateByLines(effectiveMaxLines);
    }

    if (effectiveMaxTokens !== undefined) {
      if (level === "summary") {
        const syntheticChunk: RenderChunk = { priority: bodyLines, rest: [] };
        const tokenResult = truncateByTokens([syntheticChunk], effectiveMaxTokens, (lineBudget) => {
          if (bodyLines.length <= lineBudget) return [...bodyLines];
          if (lineBudget === 1) return [`... (${bodyLines.length} lines omitted) ...`];
          const keep = Math.max(1, lineBudget - 1);
          return [...bodyLines.slice(0, keep), `... (${bodyLines.length - keep} lines omitted) ...`];
        });
        bodyLines = tokenResult.lines;
        budgetExceeded = tokenResult.budgetExceeded;
      } else {
        const tokenResult = truncateByTokens(chunks, effectiveMaxTokens, truncateByLines);
        bodyLines = tokenResult.lines;
        budgetExceeded = tokenResult.budgetExceeded;
      }
    }

    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === "") {
      bodyLines.pop();
    }

    const body = bodyLines.join("\n");
    const compressedLineCount = bodyLines.length;
    const compressedCharCount = body.length;

    const rawSavedPercent =
      originalCharCount > 0 ? Math.round((1 - compressedCharCount / originalCharCount) * 100) : 0;
    const savedPercent = Math.max(0, rawSavedPercent);
    const statsLine = `--- air: ${originalLineCount} lines → ${compressedLineCount} lines (${savedPercent}% saved) ---`;
    const output = includeStats ? `${body}\n${statsLine}` : body;

    return {
      output,
      originalSize: originalLineCount,
      compressedSize: compressedLineCount,
      ratio: originalLineCount > 0 ? compressedLineCount / originalLineCount : 1,
      format: "air-diff",
      metadata: {
        level,
        originalLines: originalLineCount,
        compressedLines: compressedLineCount,
        savedPercent,
        filesChanged: stats.files,
        insertions: stats.insertions,
        deletions: stats.deletions,
        parsedFiles: files.length,
        usedExtractedStats: extractedStats !== undefined,
        budgetExceeded,
        statsIncluded: includeStats,
      },
    };
  }
}
