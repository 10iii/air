import { extname } from "node:path";
import type { CompressResult } from "../types.js";
import { collapseBlanks, estimateTokens } from "../utils/index.js";

export interface LsOptions {
  maxLines?: number;
  maxTokens?: number;
  maxDepth?: number;
  groupByType?: boolean;
}

type NodeKind = "file" | "dir" | "unknown";
type ListingFormat = "tree" | "ls-long" | "path-list";

interface TreeNode {
  name: string;
  kind: NodeKind;
  children: Map<string, TreeNode>;
}

interface ParsedEntry {
  segments: string[];
  kindHint: NodeKind;
}

interface ParsedListing {
  entries: ParsedEntry[];
  detectedFormat: ListingFormat;
  rootName?: string;
}

interface ListingStats {
  totalFiles: number;
  totalDirs: number;
  typeBreakdown: Record<string, number>;
  filesByType: Map<string, string[]>;
}

interface DiffBudgetResult {
  lines: string[];
  budgetExceeded: boolean;
}

const NOISE_NAMES = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  ".ds_store",
  "thumbs.db",
]);

const TREE_ENTRY_RE = /^([│\s]*)(?:├──|└──)\s+(.*)$/;
const TREE_SUMMARY_RE = /^\s*\d+\s+directories?,\s+\d+\s+files?\s*$/i;
const LS_LONG_RE =
  /^([\-dlcbps])[rwxStTs\-]{9}[+@]?\s+\d+\s+\S+\s+\S+\s+\d+\s+\w{3}\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4})\s+(.+)$/;
const LS_LONG_ALT_RE =
  /^([\-dlcbps])[rwxStTs\-]{9}[+@]?\s+\d+\s+\S+\s+\d+\s+\w{3}\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4})\s+(.+)$/;

const TYPE_LABELS: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".json": "JSON",
  ".md": "Markdown",
  ".py": "Python",
  ".yml": "YAML",
  ".yaml": "YAML",
  ".toml": "TOML",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".css": "CSS",
  ".html": "HTML",
  ".go": "Go",
  ".rs": "Rust",
};

function parsePositiveInt(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function parseNonNegativeInt(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.floor(value));
}

function createNode(name: string, kind: NodeKind = "unknown"): TreeNode {
  return {
    name,
    kind,
    children: new Map<string, TreeNode>(),
  };
}

function isNoiseName(name: string): boolean {
  return NOISE_NAMES.has(name.toLowerCase());
}

function normalizeRootName(raw: string | undefined): string {
  if (!raw) return "project";
  let value = raw.trim();
  if (value.endsWith(":")) {
    value = value.slice(0, -1);
  }
  if (value === "." || value === "/" || value === "\\" || value.length === 0) {
    return "project";
  }
  value = value.replace(/[\\/]+$/g, "");
  const parts = splitSegments(value);
  if (parts.length === 0) return "project";
  const candidate = parts[parts.length - 1];
  if (!candidate || candidate.endsWith(":")) return "project";
  return candidate;
}

function splitSegments(input: string): string[] {
  const normalized = input
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
    .trim();

  if (normalized.length === 0 || normalized === ".") {
    return [];
  }

  const out: string[] = [];
  const chunks = normalized.split("/");
  for (const chunk of chunks) {
    const segment = chunk.trim();
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out;
}

function cleanEntryName(raw: string): { name: string; kindHint: NodeKind } | null {
  let value = raw.trim();
  if (!value) return null;

  const arrowIndex = value.indexOf(" -> ");
  if (arrowIndex >= 0) {
    value = value.slice(0, arrowIndex).trim();
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }

  let kindHint: NodeKind = "unknown";
  if (/[\\/]$/.test(value)) {
    kindHint = "dir";
    value = value.replace(/[\\/]+$/g, "");
  }

  value = value.replace(/\*$/, "").trim();
  if (!value || value === "." || value === "..") return null;

  return { name: value, kindHint };
}

function matchLongLsLine(line: string): { kindChar: string; name: string } | null {
  const primary = LS_LONG_RE.exec(line);
  if (primary) {
    return { kindChar: primary[1], name: primary[2] };
  }
  const alt = LS_LONG_ALT_RE.exec(line);
  if (alt) {
    return { kindChar: alt[1], name: alt[2] };
  }
  return null;
}

function detectListingFormat(lines: string[]): ListingFormat {
  if (lines.some((line) => TREE_ENTRY_RE.test(line))) {
    return "tree";
  }

  const longMatches = lines.reduce((count, line) => {
    return matchLongLsLine(line.trim()) ? count + 1 : count;
  }, 0);

  if (longMatches >= 2 || lines.some((line) => /^\s*total\s+\d+/i.test(line))) {
    return "ls-long";
  }

  return "path-list";
}

function parseTreeListing(lines: string[]): ParsedListing {
  const entries: ParsedEntry[] = [];
  const stack: string[][] = [[]];

  const firstNonEmpty = lines.find((line) => line.trim().length > 0);
  const maybeRoot =
    firstNonEmpty && !TREE_ENTRY_RE.test(firstNonEmpty) && !TREE_SUMMARY_RE.test(firstNonEmpty.trim())
      ? normalizeRootName(firstNonEmpty)
      : undefined;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    if (!line.trim()) continue;
    if (TREE_SUMMARY_RE.test(line.trim())) continue;

    const match = TREE_ENTRY_RE.exec(line);
    if (!match) continue;

    const indent = match[1] ?? "";
    const depth = Math.max(1, Math.floor(indent.replace(/│/g, " ").length / 4) + 1);
    const cleaned = cleanEntryName(match[2] ?? "");
    if (!cleaned) continue;

    const parentSegments = stack[depth - 1] ?? [];
    const entrySegments = [...parentSegments, ...splitSegments(cleaned.name)];
    if (entrySegments.length === 0) continue;

    entries.push({ segments: entrySegments, kindHint: cleaned.kindHint });
    stack[depth] = entrySegments;
    stack.length = depth + 1;
  }

  return {
    entries,
    detectedFormat: "tree",
    rootName: maybeRoot,
  };
}

function parseLongLsListing(lines: string[]): ParsedListing {
  const entries: ParsedEntry[] = [];
  let currentDir: string[] = [];
  let rootName: string | undefined;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (TREE_SUMMARY_RE.test(trimmed)) continue;
    if (/^total\s+\d+/i.test(trimmed)) continue;

    const sectionMatch = /^(.*):$/.exec(trimmed);
    if (sectionMatch && !matchLongLsLine(trimmed)) {
      currentDir = splitSegments(sectionMatch[1]);
      if (!rootName && currentDir.length === 1 && currentDir[0] !== ".") {
        rootName = currentDir[0];
      }
      continue;
    }

    const long = matchLongLsLine(trimmed);
    if (!long) continue;

    const cleaned = cleanEntryName(long.name);
    if (!cleaned) continue;

    const segments = [...currentDir, ...splitSegments(cleaned.name)];
    if (segments.length === 0) continue;

    const kindHint: NodeKind = long.kindChar === "d" || cleaned.kindHint === "dir" ? "dir" : "file";
    entries.push({ segments, kindHint });
  }

  return {
    entries,
    detectedFormat: "ls-long",
    rootName,
  };
}

function parsePathListing(lines: string[]): ParsedListing {
  const entries: ParsedEntry[] = [];
  let currentDir: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed === "." || trimmed === "./" || trimmed === ".\\") continue;
    if (trimmed.startsWith("find:")) continue;
    if (TREE_SUMMARY_RE.test(trimmed)) continue;
    if (/^total\s+\d+/i.test(trimmed)) continue;
    if (matchLongLsLine(trimmed)) continue;
    if (/^Found \d+ file\(s\)$/i.test(trimmed)) continue;

    const sectionMatch = /^(.*):$/.exec(trimmed);
    if (sectionMatch && !trimmed.includes(" ")) {
      currentDir = splitSegments(sectionMatch[1]);
      continue;
    }

    if (/\s{2,}/.test(trimmed) && !trimmed.includes("/") && !trimmed.includes("\\")) {
      const columns = trimmed.split(/\s+/).filter(Boolean);
      for (const column of columns) {
        const cleanedColumn = cleanEntryName(column);
        if (!cleanedColumn) continue;
        const segments = [...currentDir, ...splitSegments(cleanedColumn.name)];
        if (segments.length === 0) continue;
        entries.push({ segments, kindHint: cleanedColumn.kindHint });
      }
      continue;
    }

    const cleaned = cleanEntryName(trimmed);
    if (!cleaned) continue;
    const segments = [...currentDir, ...splitSegments(cleaned.name)];
    if (segments.length === 0) continue;
    entries.push({ segments, kindHint: cleaned.kindHint });
  }

  return {
    entries,
    detectedFormat: "path-list",
  };
}

function parseListing(content: string): ParsedListing {
  const lines = content.split("\n");
  const detected = detectListingFormat(lines);

  if (detected === "tree") {
    return parseTreeListing(lines);
  }
  if (detected === "ls-long") {
    return parseLongLsListing(lines);
  }
  return parsePathListing(lines);
}

function maybeStripCommonRoot(entries: ParsedEntry[], explicitRoot?: string): { entries: ParsedEntry[]; rootName: string } {
  if (explicitRoot) {
    return { entries, rootName: normalizeRootName(explicitRoot) };
  }

  if (entries.length < 2) {
    return { entries, rootName: "project" };
  }

  const first = entries[0]?.segments[0];
  if (!first || first.endsWith(":")) {
    return { entries, rootName: "project" };
  }

  const hasCommonFirst = entries.every((entry) => entry.segments[0] === first);
  if (!hasCommonFirst) {
    return { entries, rootName: "project" };
  }

  const stripped = entries
    .map((entry) => ({
      segments: entry.segments.slice(1),
      kindHint: entry.kindHint,
    }))
    .filter((entry) => entry.segments.length > 0);

  return {
    entries: stripped,
    rootName: normalizeRootName(first),
  };
}

function ensureChild(parent: TreeNode, name: string, kindHint: NodeKind): TreeNode {
  const existing = parent.children.get(name);
  if (!existing) {
    const created = createNode(name, kindHint === "unknown" ? "unknown" : kindHint);
    parent.children.set(name, created);
    parent.kind = "dir";
    return created;
  }

  if (kindHint === "dir") {
    existing.kind = "dir";
  } else if (kindHint === "file" && existing.kind === "unknown") {
    existing.kind = "file";
  }

  parent.kind = "dir";
  return existing;
}

function insertEntry(root: TreeNode, entry: ParsedEntry): void {
  if (entry.segments.length === 0) return;
  let cursor = root;

  for (let i = 0; i < entry.segments.length; i++) {
    const segment = entry.segments[i];
    const isLast = i === entry.segments.length - 1;
    const hint: NodeKind = isLast ? entry.kindHint : "dir";
    cursor = ensureChild(cursor, segment, hint);
  }
}

function finalizeNodeKinds(node: TreeNode): void {
  for (const child of node.children.values()) {
    finalizeNodeKinds(child);
  }

  if (node.children.size > 0) {
    node.kind = "dir";
  } else if (node.kind === "unknown") {
    node.kind = "file";
  }
}

function pruneNoise(node: TreeNode, depth: number = 0): void {
  for (const [childName, child] of [...node.children.entries()]) {
    if (depth === 0 && isNoiseName(child.name)) {
      node.children.delete(childName);
      continue;
    }
    pruneNoise(child, depth + 1);
  }
}

function sortChildren(children: Iterable<TreeNode>): TreeNode[] {
  return [...children].sort((a, b) => {
    const aDir = a.kind === "dir";
    const bDir = b.kind === "dir";
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function getTypeKey(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  return ext || "[no-ext]";
}

function collectStats(root: TreeNode): ListingStats {
  let totalFiles = 0;
  let totalDirs = 0;
  const typeBreakdown: Record<string, number> = {};
  const filesByType = new Map<string, string[]>();

  const walk = (node: TreeNode, parentPath: string[]): void => {
    const children = sortChildren(node.children.values());
    for (const child of children) {
      const nextPath = [...parentPath, child.name];
      if (child.kind === "dir") {
        totalDirs++;
        walk(child, nextPath);
      } else {
        totalFiles++;
        const filePath = nextPath.join("/");
        const key = getTypeKey(child.name);
        typeBreakdown[key] = (typeBreakdown[key] ?? 0) + 1;
        const bucket = filesByType.get(key) ?? [];
        bucket.push(filePath);
        filesByType.set(key, bucket);
      }
    }
  };

  walk(root, []);

  for (const paths of filesByType.values()) {
    paths.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  return {
    totalFiles,
    totalDirs,
    typeBreakdown,
    filesByType,
  };
}

function renderTreeLines(root: TreeNode, maxDepth?: number): string[] {
  const lines: string[] = [];
  if (maxDepth !== undefined && maxDepth <= 0) {
    return lines;
  }

  const walk = (node: TreeNode, prefix: string, depth: number): void => {
    const children = sortChildren(node.children.values());
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const isLast = i === children.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const label = child.kind === "dir" ? `${child.name}/` : child.name;

      lines.push(prefix + connector + label);

      if (
        child.kind === "dir" &&
        child.children.size > 0 &&
        (maxDepth === undefined || depth < maxDepth)
      ) {
        const nextPrefix = prefix + (isLast ? "    " : "│   ");
        walk(child, nextPrefix, depth + 1);
      }
    }
  };

  walk(root, "", 1);
  return lines;
}

function formatTypeBreakdown(typeBreakdown: Record<string, number>): string {
  const entries = Object.entries(typeBreakdown).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0], undefined, { sensitivity: "base" });
  });

  if (entries.length === 0) return "none";

  return entries
    .map(([type, count]) => `${type}(${count})`)
    .join(", ");
}

function typeLabel(typeKey: string): string {
  if (typeKey === "[no-ext]") return "No Extension";
  return TYPE_LABELS[typeKey] ?? (typeKey.startsWith(".") ? typeKey.slice(1).toUpperCase() : typeKey.toUpperCase());
}

function wrapFileList(paths: string[], prefix = "  ", maxWidth = 90): string[] {
  if (paths.length === 0) return [prefix + "(none)"];

  const out: string[] = [];
  let current = prefix;

  for (const filePath of paths) {
    const candidate = current === prefix ? `${prefix}${filePath}` : `${current}, ${filePath}`;
    if (candidate.length > maxWidth && current !== prefix) {
      out.push(current);
      current = `${prefix}${filePath}`;
    } else {
      current = candidate;
    }
  }

  out.push(current);
  return out;
}

function buildNormalOutput(rootName: string, root: TreeNode, stats: ListingStats, maxDepth?: number): string[] {
  const lines: string[] = [`${rootName}/ (${stats.totalFiles} files, ${stats.totalDirs} dirs)`];
  const tree = renderTreeLines(root, maxDepth);

  if (tree.length === 0) {
    lines.push("(empty)");
  } else {
    lines.push(...tree);
  }

  lines.push("");
  lines.push(`Types: ${formatTypeBreakdown(stats.typeBreakdown)}`);
  return lines;
}

function buildGroupedOutput(rootName: string, stats: ListingStats): string[] {
  const lines: string[] = [`${rootName}/ (${stats.totalFiles} files, ${stats.totalDirs} dirs)`, ""];

  const groups = [...stats.filesByType.entries()].sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0], undefined, { sensitivity: "base" });
  });

  if (groups.length === 0) {
    lines.push("No files");
    return lines;
  }

  for (let i = 0; i < groups.length; i++) {
    const [type, paths] = groups[i];
    lines.push(`${typeLabel(type)} (${paths.length} ${paths.length === 1 ? "file" : "files"}):`);
    lines.push(...wrapFileList(paths));
    if (i < groups.length - 1) {
      lines.push("");
    }
  }

  return lines;
}

function smartTruncate(lines: string[], maxLines: number): string[] {
  if (maxLines <= 0 || lines.length <= maxLines) return lines;
  if (maxLines === 1) return [`... (${lines.length} lines omitted) ...`];

  const available = maxLines - 1;
  const headCount = Math.max(1, Math.floor(available * 0.7));
  const tailCount = Math.max(0, available - headCount);
  const omitted = lines.length - headCount - tailCount;

  if (omitted <= 0) return lines;

  return [
    ...lines.slice(0, headCount),
    `... (${omitted} lines omitted) ...`,
    ...lines.slice(lines.length - tailCount),
  ];
}

function smartTruncateByTokens(lines: string[], maxTokens: number): DiffBudgetResult {
  const total = lines.reduce((sum, line) => sum + estimateTokens(line + "\n"), 0);
  if (total <= maxTokens) return { lines, budgetExceeded: false };

  const tokenCache = new Map<number, number>();
  const tokensFor = (lineBudget: number): number => {
    const cached = tokenCache.get(lineBudget);
    if (cached !== undefined) return cached;
    const candidate = smartTruncate(lines, lineBudget);
    const tokens = candidate.reduce((sum, line) => sum + estimateTokens(line + "\n"), 0);
    tokenCache.set(lineBudget, tokens);
    return tokens;
  };

  const step = Math.max(1, Math.floor(Math.sqrt(lines.length)));
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
      return {
        lines: smartTruncate(lines, 1),
        budgetExceeded: true,
      };
    }
  }

  let best = firstFit;
  const refineTop = Math.min(lines.length, lastOver - 1);
  for (let tryLines = refineTop; tryLines > firstFit; tryLines--) {
    if (tokensFor(tryLines) <= maxTokens) {
      best = tryLines;
      break;
    }
  }

  return {
    lines: smartTruncate(lines, Math.max(1, best)),
    budgetExceeded: false,
  };
}

function countOperations(root: TreeNode): { nodes: number } {
  let nodes = 0;
  const walk = (node: TreeNode): void => {
    for (const child of node.children.values()) {
      nodes++;
      walk(child);
    }
  };
  walk(root);
  return { nodes };
}

export class LsCompressor {
  compress(content: string, options?: LsOptions): CompressResult {
    const opts: LsOptions = {
      groupByType: false,
      ...options,
    };

    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const originalLineCount = normalized.split("\n").length;
    const originalCharCount = normalized.length;

    const maxLines = parsePositiveInt(opts.maxLines);
    const maxTokens = parsePositiveInt(opts.maxTokens);
    const maxDepth = parseNonNegativeInt(opts.maxDepth);

    const parsed = parseListing(normalized);
    const rootAdjusted = maybeStripCommonRoot(parsed.entries, parsed.rootName);
    const root = createNode("", "dir");

    for (const entry of rootAdjusted.entries) {
      insertEntry(root, entry);
    }

    finalizeNodeKinds(root);
    pruneNoise(root);
    finalizeNodeKinds(root);

    const stats = collectStats(root);
    const bodyLinesRaw = opts.groupByType
      ? buildGroupedOutput(rootAdjusted.rootName, stats)
      : buildNormalOutput(rootAdjusted.rootName, root, stats, maxDepth);

    let bodyLines = collapseBlanks(bodyLinesRaw);
    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === "") {
      bodyLines.pop();
    }

    let budgetExceeded = false;
    let includeStats = true;
    const footerEstimatedLines = 1;
    const footerEstimatedTokens = 25;

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

    if (effectiveMaxLines !== undefined && bodyLines.length > effectiveMaxLines) {
      bodyLines = smartTruncate(bodyLines, effectiveMaxLines);
    }

    if (effectiveMaxTokens !== undefined) {
      const tokenResult = smartTruncateByTokens(bodyLines, effectiveMaxTokens);
      bodyLines = tokenResult.lines;
      budgetExceeded = tokenResult.budgetExceeded;
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
      format: "air-ls",
      metadata: {
        originalLines: originalLineCount,
        compressedLines: compressedLineCount,
        savedPercent,
        totalFiles: stats.totalFiles,
        totalDirs: stats.totalDirs,
        typeBreakdown: stats.typeBreakdown,
        detectedFormat: parsed.detectedFormat,
        groupByType: opts.groupByType ?? false,
        maxDepth,
        parsedNodes: countOperations(root).nodes,
        budgetExceeded,
        statsIncluded: includeStats,
      },
    };
  }
}
