/**
 * Optional tree-sitter integration for enhanced AST-based skeleton extraction.
 *
 * This module provides tree-sitter parsing when `web-tree-sitter` and language
 * WASM files are available. Falls back gracefully when not installed.
 *
 * Usage:
 *   const ts = await tryLoadTreeSitter();
 *   if (ts) {
 *     const result = await ts.extractSignatures(content, "typescript");
 *   }
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type ParserModule = any;

let treeSitterModule: ParserModule | null = null;
let parserInitialized = false;
let languageCache = new Map<string, unknown>();

export interface SignatureInfo {
  name: string;
  type: "function" | "method" | "class" | "interface" | "type";
  startLine: number;
  endLine: number;
  signature: string;
}

export interface TreeSitterApi {
  available: true;
  extractSignatures(
    content: string,
    language: string,
    fileName?: string
  ): Promise<SignatureInfo[]>;
  collapseToSkeleton(
    content: string,
    language: string,
    fileName?: string
  ): Promise<string>;
}

export interface TreeSitterUnavailable {
  available: false;
  reason: string;
}

export type TreeSitterResult = TreeSitterApi | TreeSitterUnavailable;

const LANGUAGE_TO_WASM: Record<string, string> = {
  typescript: "typescript",
  javascript: "javascript",
  tsx: "tsx",
  python: "python",
  go: "go",
  rust: "rust",
  java: "java",
  c: "c",
  cpp: "cpp",
  csharp: "c_sharp",
  ruby: "ruby",
  php: "php",
  swift: "swift",
  kotlin: "kotlin",
  scala: "scala",
};

const SIGNATURE_NODE_TYPES = [
  "function_declaration",
  "function_definition",
  "method_declaration",
  "method_definition",
  "class_declaration",
  "class_definition",
  "interface_declaration",
  "type_alias_declaration",
  "arrow_function",
  "generator_function_declaration",
  "function_item",
];

async function tryInitParser(): Promise<boolean> {
  if (parserInitialized) return true;

  try {
    // Dynamic import - will fail if web-tree-sitter is not installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    treeSitterModule = await (Function('return import("web-tree-sitter")')() as Promise<ParserModule>);
    await treeSitterModule.default.init();
    parserInitialized = true;
    return true;
  } catch {
    treeSitterModule = null;
    return false;
  }
}

let wasmLocator: ((langName: string) => string) | null = null;

export function setWasmLocator(locator: (langName: string) => string): void {
  wasmLocator = locator;
}

/**
 * Try to resolve tree-sitter-wasms package path.
 * Returns the path to the WASM file for the given language, or null if not found.
 */
function tryResolveTreeSitterWasms(wasmName: string): string | null {
  try {
    // Try to resolve the tree-sitter-wasms package
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const createRequire = (Function('return require("module").createRequire')() as typeof import("module").createRequire);
    const require = createRequire(import.meta.url);
    
    // Resolve the package directory
    const packageJson = require.resolve("tree-sitter-wasms/package.json");
    const packageDir = packageJson.replace(/\/package\.json$/, "");
    
    // WASM files are in the "out" directory with format: tree-sitter-{lang}.wasm
    const wasmPath = `${packageDir}/out/tree-sitter-${wasmName}.wasm`;
    
    // Verify file exists (sync check for simplicity)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = (Function('return require("fs")')() as typeof import("fs"));
    if (fs.existsSync(wasmPath)) {
      return wasmPath;
    }
    return null;
  } catch {
    return null;
  }
}

async function loadLanguage(langName: string): Promise<unknown | null> {
  if (!treeSitterModule) return null;

  const wasmName = LANGUAGE_TO_WASM[langName];
  if (!wasmName) return null;

  if (languageCache.has(wasmName)) {
    return languageCache.get(wasmName)!;
  }

  // Try multiple WASM resolution strategies:
  // 1. User-provided locator (highest priority)
  // 2. tree-sitter-wasms package (auto-discovery)
  // 3. Default path (fallback)
  const wasmPaths: string[] = [];
  
  if (wasmLocator) {
    wasmPaths.push(wasmLocator(wasmName));
  }
  
  const treeSitterWasmsPath = tryResolveTreeSitterWasms(wasmName);
  if (treeSitterWasmsPath) {
    wasmPaths.push(treeSitterWasmsPath);
  }
  
  wasmPaths.push(`tree-sitter-${wasmName}.wasm`);

  for (const wasmPath of wasmPaths) {
    try {
      const language = await treeSitterModule.default.Language.load(wasmPath);
      languageCache.set(wasmName, language);
      return language;
    } catch {
      // Try next path
    }
  }
  
  return null;
}

function findIdentifier(node: {
  children: Array<{ type: string; text: string }>;
}): string | null {
  for (let i = node.children.length - 1; i >= 0; i--) {
    const child = node.children[i];
    if (child.type === "identifier" || child.type === "property_identifier") {
      return child.text;
    }
  }
  return null;
}

function getNodeSignature(node: {
  type: string;
  text: string;
  startPosition: { row: number };
}): string {
  const text = node.text;
  const firstNewline = text.indexOf("\n");
  if (firstNewline === -1) return text;

  const firstLine = text.slice(0, firstNewline);
  if (
    firstLine.includes("{") ||
    firstLine.includes(":") ||
    firstLine.endsWith(")")
  ) {
    return firstLine;
  }
  return firstLine + " ...";
}

function mapNodeType(
  nodeType: string
): "function" | "method" | "class" | "interface" | "type" {
  if (nodeType.includes("class")) return "class";
  if (nodeType.includes("interface")) return "interface";
  if (nodeType.includes("type_alias")) return "type";
  if (nodeType.includes("method")) return "method";
  return "function";
}

async function extractSignaturesImpl(
  content: string,
  language: string
): Promise<SignatureInfo[]> {
  if (!treeSitterModule || !parserInitialized) return [];

  const lang = await loadLanguage(language);
  if (!lang) return [];

  const Parser = treeSitterModule.default;
  const parser = new Parser();
  parser.setLanguage(lang as Parameters<typeof parser.setLanguage>[0]);

  let tree: ReturnType<typeof parser.parse>;
  try {
    tree = parser.parse(content);
  } catch {
    parser.delete?.();
    return [];
  }

  const signatures: SignatureInfo[] = [];

  function traverse(
    node: ReturnType<typeof tree.rootNode.child> & { children?: unknown[] }
  ): void {
    if (!node) return;

    if (SIGNATURE_NODE_TYPES.includes(node.type)) {
      const name = findIdentifier(
        node as { children: Array<{ type: string; text: string }> }
      );
      if (name) {
        signatures.push({
          name,
          type: mapNodeType(node.type),
          startLine: node.startPosition.row,
          endLine: node.endPosition.row,
          signature: getNodeSignature(node),
        });
      }
    }

    if (node.children) {
      for (const child of node.children as Array<typeof node>) {
        traverse(child);
      }
    }
  }

  traverse(tree.rootNode as ReturnType<typeof tree.rootNode.child>);
  tree.delete?.();
  parser.delete?.();
  return signatures;
}

async function collapseToSkeletonImpl(
  content: string,
  language: string
): Promise<string> {
  const signatures = await extractSignaturesImpl(content, language);
  if (signatures.length === 0) return content;

  const lines = content.split("\n");
  const result: string[] = [];
  const collapsedRanges = new Set<number>();

  signatures.sort((a, b) => a.startLine - b.startLine);

  for (const sig of signatures) {
    for (let i = sig.startLine + 1; i <= sig.endLine; i++) {
      collapsedRanges.add(i);
    }
  }

  let currentSigIdx = 0;
  let i = 0;

  while (i < lines.length) {
    if (
      currentSigIdx < signatures.length &&
      i === signatures[currentSigIdx].startLine
    ) {
      const sig = signatures[currentSigIdx];
      result.push(lines[i]);

      const bodyLines = sig.endLine - sig.startLine;
      if (bodyLines >= 3) {
        const indent = lines[i].match(/^(\s*)/)?.[1] || "";
        result.push(`${indent}  ... (${bodyLines} lines collapsed)`);
      } else {
        for (let j = sig.startLine + 1; j <= sig.endLine; j++) {
          result.push(lines[j]);
        }
      }

      i = sig.endLine + 1;
      currentSigIdx++;
      while (
        currentSigIdx < signatures.length &&
        signatures[currentSigIdx].startLine < i
      ) {
        currentSigIdx++;
      }
    } else if (collapsedRanges.has(i)) {
      i++;
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join("\n");
}

/**
 * Attempt to load tree-sitter. Returns an API object if successful,
 * or an unavailable result with reason if not.
 *
 * This function caches the result - subsequent calls return immediately.
 */
export async function tryLoadTreeSitter(): Promise<TreeSitterResult> {
  const initialized = await tryInitParser();

  if (!initialized) {
    return {
      available: false,
      reason:
        "web-tree-sitter not installed. Install with: npm install web-tree-sitter",
    };
  }

  return {
    available: true,
    extractSignatures: extractSignaturesImpl,
    collapseToSkeleton: collapseToSkeletonImpl,
  };
}

/**
 * Check if tree-sitter is available without loading it.
 */
export function isTreeSitterAvailable(): boolean {
  return parserInitialized && treeSitterModule !== null;
}

/**
 * Clear cached languages (useful for testing).
 */
export function clearLanguageCache(): void {
  languageCache.clear();
}
