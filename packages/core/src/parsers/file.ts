/**
 * File type detection and language-aware comment/import syntax.
 */

export interface LanguageInfo {
  /** Language identifier */
  language: string;
  /** Single-line comment prefix(es) */
  lineComment: string[];
  /** Block comment start/end delimiters */
  blockComment: [string, string][];
  /** Doc-string delimiters (e.g. Python triple-quotes) */
  docString?: [string, string][];
  /** Import statement patterns (regex) */
  importPatterns: RegExp[];
}

const LANGUAGES: Record<string, LanguageInfo> = {
  typescript: {
    language: "typescript",
    lineComment: ["//"],
    blockComment: [["/*", "*/"]],
    importPatterns: [/^\s*import\s/, /^\s*export\s.*\sfrom\s/],
  },
  javascript: {
    language: "javascript",
    lineComment: ["//"],
    blockComment: [["/*", "*/"]],
    importPatterns: [
      /^\s*import\s/,
      /^\s*export\s.*\sfrom\s/,
      /^\s*const\s+\w+\s*=\s*require\(/,
      // R2-05: Tightened from bare /^\s*require\(/ to require assignment form
      /^\s*(let|var)\s+\w+\s*=\s*require\(/,
      /^\s*module\.exports\s*=/,
    ],
  },
  python: {
    language: "python",
    lineComment: ["#"],
    blockComment: [],
    docString: [
      ['"""', '"""'],
      ["'''", "'''"],
    ],
    importPatterns: [/^\s*import\s/, /^\s*from\s+\S+\s+import\s/],
  },
  go: {
    language: "go",
    lineComment: ["//"],
    blockComment: [["/*", "*/"]],
    importPatterns: [/^\s*import\s/],
  },
  rust: {
    language: "rust",
    lineComment: ["//"],
    blockComment: [["/*", "*/"]],
    importPatterns: [/^\s*use\s/, /^\s*extern\s+crate\s/],
  },
  java: {
    language: "java",
    lineComment: ["//"],
    blockComment: [["/*", "*/"]],
    importPatterns: [/^\s*import\s/],
  },
  c: {
    language: "c",
    lineComment: ["//"],
    blockComment: [["/*", "*/"]],
    importPatterns: [/^\s*#\s*include\s/],
  },
  cpp: {
    language: "cpp",
    lineComment: ["//"],
    blockComment: [["/*", "*/"]],
    importPatterns: [/^\s*#\s*include\s/, /^\s*using\s+namespace\s/],
  },
  ruby: {
    language: "ruby",
    lineComment: ["#"],
    blockComment: [["=begin", "=end"]],
    importPatterns: [/^\s*require\s/, /^\s*require_relative\s/],
  },
  shell: {
    language: "shell",
    lineComment: ["#"],
    blockComment: [],
    importPatterns: [/^\s*source\s/, /^\s*\.\s+/],
  },
  markdown: {
    language: "markdown",
    lineComment: [],
    blockComment: [["<!--", "-->"]],
    importPatterns: [],
  },
  json: {
    language: "json",
    lineComment: [],
    blockComment: [],
    importPatterns: [],
  },
  yaml: {
    language: "yaml",
    lineComment: ["#"],
    blockComment: [],
    importPatterns: [],
  },
  toml: {
    language: "toml",
    lineComment: ["#"],
    blockComment: [],
    importPatterns: [],
  },
  csharp: {
    language: "csharp",
    lineComment: ["//"],
    blockComment: [["/*", "*/"]],
    importPatterns: [/^\s*using\s/],
  },
  php: {
    language: "php",
    lineComment: ["//", "#"],
    blockComment: [["/*", "*/"]],
    importPatterns: [/^\s*use\s/, /^\s*require\s/, /^\s*include\s/],
  },
  swift: {
    language: "swift",
    lineComment: ["//"],
    blockComment: [["/*", "*/"]],
    importPatterns: [/^\s*import\s/],
  },
  kotlin: {
    language: "kotlin",
    lineComment: ["//"],
    blockComment: [["/*", "*/"]],
    importPatterns: [/^\s*import\s/],
  },
  css: {
    language: "css",
    lineComment: [],
    blockComment: [["/*", "*/"]],
    importPatterns: [/^\s*@import\s/],
  },
  html: {
    language: "html",
    lineComment: [],
    blockComment: [["<!--", "-->"]],
    importPatterns: [],
  },
};

/** Map file extensions to language keys */
const EXT_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".pyw": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".rb": "ruby",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".md": "markdown",
  ".mdx": "markdown",
  ".json": "json",
  ".jsonc": "json",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".toml": "toml",
  ".cs": "csharp",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".css": "css",
  ".scss": "css",
  ".less": "css",
  ".html": "html",
  ".htm": "html",
  ".vue": "html",
  ".svelte": "html",
};

/** CR-15: Map known filenames without extensions to language keys */
const FILENAME_MAP: Record<string, string> = {
  "Makefile": "shell",
  "Dockerfile": "shell",
  "Rakefile": "ruby",
  "Gemfile": "ruby",
  ".bashrc": "shell",
  ".zshrc": "shell",
  ".profile": "shell",
  ".bash_profile": "shell",
  ".gitignore": "unknown",
};

/** Default language info for unknown file types */
const DEFAULT_LANGUAGE: LanguageInfo = {
  language: "unknown",
  lineComment: [],
  blockComment: [],
  importPatterns: [],
};

/**
 * Detect language from a file name or extension.
 * Returns the LanguageInfo for the detected language.
 */
export function detectLanguage(fileName: string): LanguageInfo {
  // CR-15: Check known filenames first (Makefile, Dockerfile, etc.)
  const baseName = fileName.includes("/") ? fileName.slice(fileName.lastIndexOf("/") + 1) : 
    fileName.includes("\\") ? fileName.slice(fileName.lastIndexOf("\\") + 1) : fileName;
  const filenameKey = FILENAME_MAP[baseName];
  if (filenameKey && filenameKey !== "unknown") {
    return LANGUAGES[filenameKey] ?? DEFAULT_LANGUAGE;
  }

  // Extract extension (handle compound extensions like .test.ts)
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) return DEFAULT_LANGUAGE;

  const ext = fileName.slice(dotIndex).toLowerCase();
  const langKey = EXT_MAP[ext];

  if (!langKey) return DEFAULT_LANGUAGE;

  return LANGUAGES[langKey] ?? DEFAULT_LANGUAGE;
}

/**
 * Check if a line is a single-line comment.
 */
export function isLineComment(line: string, lang: LanguageInfo): boolean {
  const trimmed = line.trimStart();
  return lang.lineComment.some((prefix) => trimmed.startsWith(prefix));
}

/**
 * Check if a line matches an import pattern.
 */
export function isImportLine(line: string, lang: LanguageInfo): boolean {
  return lang.importPatterns.some((pat) => pat.test(line));
}
