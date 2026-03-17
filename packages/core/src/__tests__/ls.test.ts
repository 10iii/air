import { describe, it, expect } from "vitest";
import { LsCompressor } from "../compressors/ls.js";

const TREE_LISTING = `my-project
├── src/
│   ├── index.ts
│   ├── utils.ts
│   └── types.ts
├── tests/
│   └── index.test.ts
├── package.json
├── tsconfig.json
└── README.md

3 directories, 7 files`;

const LS_LONG_LISTING = `total 48
drwxr-xr-x  5 user staff  160 Jan  1 10:00 src
drwxr-xr-x  3 user staff   96 Jan  1 10:00 tests
-rw-r--r--  1 user staff  512 Jan  1 10:00 package.json
-rw-r--r--  1 user staff  256 Jan  1 10:00 tsconfig.json
-rw-r--r--  1 user staff 1024 Jan  1 10:00 README.md`;

const PATH_LIST = `src/index.ts
src/utils.ts
src/types.ts
tests/index.test.ts
package.json
tsconfig.json
README.md`;

const NOISY_TREE = `project
├── .git/
│   ├── HEAD
│   └── config
├── node_modules/
│   └── lodash/
│       └── index.js
├── src/
│   └── index.ts
└── package.json`;

const DEEP_TREE = `root
├── a/
│   ├── b/
│   │   ├── c/
│   │   │   ├── d/
│   │   │   │   └── deep.txt
│   │   │   └── mid.txt
│   │   └── shallow.txt
│   └── top.txt
└── README.md`;

const MIXED_TYPE_LISTING = `project
├── src/
│   ├── index.ts
│   ├── app.tsx
│   ├── styles.css
│   └── utils.js
├── docs/
│   ├── guide.md
│   └── api.md
├── config.json
├── config.yaml
├── Makefile
└── script.sh`;

const RECURSIVE_LS_LONG = `.:
total 8
drwxr-xr-x  3 user staff  96 Jan  1 10:00 src
-rw-r--r--  1 user staff 512 Jan  1 10:00 package.json

./src:
total 4
-rw-r--r--  1 user staff 256 Jan  1 10:00 index.ts
-rw-r--r--  1 user staff 128 Jan  1 10:00 utils.ts`;

const COLUMN_LISTING = `README.md    package.json    tsconfig.json
src          tests           docs`;

describe("LsCompressor", () => {
  const compressor = new LsCompressor();

  describe("basic functionality", () => {
    it("should return valid CompressResult structure", () => {
      const result = compressor.compress(TREE_LISTING);
      expect(result).toHaveProperty("output");
      expect(result).toHaveProperty("originalSize");
      expect(result).toHaveProperty("compressedSize");
      expect(result).toHaveProperty("ratio");
      expect(result).toHaveProperty("format");
      expect(result).toHaveProperty("metadata");
      expect(result.format).toBe("air-ls");
    });

    it("should compress a tree listing", () => {
      const result = compressor.compress(TREE_LISTING);
      expect(result.output).toBeTruthy();
      expect(result.originalSize).toBeGreaterThan(0);
      expect(result.compressedSize).toBeGreaterThan(0);
      expect(result.ratio).toBeGreaterThan(0);
      expect(result.ratio).toBeLessThanOrEqual(1);
    });

    it("should compress an ls -l listing", () => {
      const result = compressor.compress(LS_LONG_LISTING);
      expect(result.format).toBe("air-ls");
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.detectedFormat).toBe("ls-long");
    });

    it("should compress a path list", () => {
      const result = compressor.compress(PATH_LIST);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.detectedFormat).toBe("path-list");
    });

    it("should count files and directories", () => {
      const result = compressor.compress(TREE_LISTING);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.totalFiles).toBeGreaterThan(0);
      expect(meta.totalDirs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("format detection", () => {
    it("should detect tree format", () => {
      const result = compressor.compress(TREE_LISTING);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.detectedFormat).toBe("tree");
    });

    it("should detect ls-long format", () => {
      const result = compressor.compress(LS_LONG_LISTING);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.detectedFormat).toBe("ls-long");
    });

    it("should detect path-list format", () => {
      const result = compressor.compress(PATH_LIST);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.detectedFormat).toBe("path-list");
    });

    it("should detect recursive ls -lR format", () => {
      const result = compressor.compress(RECURSIVE_LS_LONG);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.detectedFormat).toBe("ls-long");
      expect(meta.totalFiles).toBeGreaterThanOrEqual(3);
    });
  });

  describe("noise pruning", () => {
    it("should prune .git directory", () => {
      const result = compressor.compress(NOISY_TREE);
      expect(result.output).not.toContain(".git");
    });

    it("should prune node_modules directory", () => {
      const result = compressor.compress(NOISY_TREE);
      expect(result.output).not.toContain("node_modules");
    });

    it("should preserve non-noise entries", () => {
      const result = compressor.compress(NOISY_TREE);
      expect(result.output).toContain("src");
      expect(result.output).toContain("index.ts");
      expect(result.output).toContain("package.json");
    });

    it("should prune __pycache__ from path lists", () => {
      const listing = `src/main.py\n__pycache__/main.cpython-311.pyc\nsrc/utils.py`;
      const result = compressor.compress(listing);
      expect(result.output).not.toContain("__pycache__");
      expect(result.output).toContain("main.py");
    });

    it("should prune .DS_Store (case-insensitive)", () => {
      const listing = `project\n├── .DS_Store\n├── src/\n│   └── index.ts\n└── README.md`;
      const result = compressor.compress(listing);
      expect(result.output).not.toContain(".DS_Store");
      expect(result.output).toContain("index.ts");
    });
  });

  describe("type breakdown", () => {
    it("should report type breakdown in metadata", () => {
      const result = compressor.compress(MIXED_TYPE_LISTING);
      const meta = result.metadata as Record<string, unknown>;
      const breakdown = meta.typeBreakdown as Record<string, number>;
      expect(breakdown).toBeDefined();
      expect(breakdown[".ts"]).toBeGreaterThan(0);
    });

    it("should include Types footer line", () => {
      const result = compressor.compress(TREE_LISTING);
      expect(result.output).toContain("Types:");
    });

    it("should count multiple extensions correctly", () => {
      const result = compressor.compress(MIXED_TYPE_LISTING);
      const meta = result.metadata as Record<string, unknown>;
      const breakdown = meta.typeBreakdown as Record<string, number>;
      expect(breakdown[".md"]).toBe(2);
      expect(breakdown[".ts"]).toBe(1);
      expect(breakdown[".tsx"]).toBe(1);
      expect(breakdown[".css"]).toBe(1);
      expect(breakdown[".js"]).toBe(1);
    });

    it("should handle files without extensions", () => {
      const listing = `project\n├── Makefile\n└── Dockerfile`;
      const result = compressor.compress(listing);
      const meta = result.metadata as Record<string, unknown>;
      const breakdown = meta.typeBreakdown as Record<string, number>;
      expect(breakdown["[no-ext]"]).toBe(2);
    });
  });

  describe("groupByType option", () => {
    it("should default to tree output (groupByType=false)", () => {
      const result = compressor.compress(TREE_LISTING);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.groupByType).toBe(false);
      expect(result.output).toContain("├──");
    });

    it("should group files by type when groupByType=true", () => {
      const result = compressor.compress(MIXED_TYPE_LISTING, { groupByType: true });
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.groupByType).toBe(true);
      expect(result.output).not.toContain("├──");
      expect(result.output).toMatch(/\(\d+ files?\)/);
    });

    it("should show type labels in grouped output", () => {
      const result = compressor.compress(MIXED_TYPE_LISTING, { groupByType: true });
      expect(result.output).toMatch(/TypeScript|JavaScript|CSS|Markdown/);
    });

    it("should list file paths under each type group", () => {
      const result = compressor.compress(MIXED_TYPE_LISTING, { groupByType: true });
      expect(result.output).toContain("index.ts");
      expect(result.output).toContain("guide.md");
    });
  });

  describe("maxDepth option", () => {
    it("should limit tree depth when maxDepth is set", () => {
      const result = compressor.compress(DEEP_TREE, { maxDepth: 1 });
      expect(result.output).toContain("a/");
      expect(result.output).toContain("README.md");
      expect(result.output).not.toContain("deep.txt");
    });

    it("should show full depth when maxDepth is not set", () => {
      const result = compressor.compress(DEEP_TREE);
      expect(result.output).toContain("deep.txt");
    });

    it("should handle maxDepth=0 (show nothing below root)", () => {
      const result = compressor.compress(DEEP_TREE, { maxDepth: 0 });
      expect(result.output).toContain("(empty)");
    });

    it("should report maxDepth in metadata", () => {
      const result = compressor.compress(DEEP_TREE, { maxDepth: 2 });
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.maxDepth).toBe(2);
    });
  });

  describe("maxLines option", () => {
    it("should truncate output when maxLines is set", () => {
      const full = compressor.compress(DEEP_TREE);
      const truncated = compressor.compress(DEEP_TREE, { maxLines: 5 });
      expect(truncated.compressedSize).toBeLessThanOrEqual(5);
      expect(truncated.compressedSize).toBeLessThan(full.compressedSize);
    });

    it("should handle maxLines=1", () => {
      const result = compressor.compress(TREE_LISTING, { maxLines: 1 });
      const lines = result.output.split("\n");
      expect(lines.length).toBeLessThanOrEqual(1);
    });

    it("should include omitted indicator when truncating", () => {
      const result = compressor.compress(DEEP_TREE, { maxLines: 4 });
      expect(result.output).toContain("omitted");
    });

    it("should not truncate when output fits", () => {
      const result = compressor.compress(PATH_LIST, { maxLines: 100 });
      expect(result.output).not.toContain("omitted");
    });

    it("should ignore non-positive maxLines", () => {
      const normal = compressor.compress(PATH_LIST);
      const withZero = compressor.compress(PATH_LIST, { maxLines: 0 });
      expect(withZero.compressedSize).toBe(normal.compressedSize);
    });
  });

  describe("maxTokens option", () => {
    it("should truncate by token budget", () => {
      const full = compressor.compress(DEEP_TREE);
      const limited = compressor.compress(DEEP_TREE, { maxTokens: 20 });
      expect(limited.compressedSize).toBeLessThan(full.compressedSize);
    });

    it("should set budgetExceeded when tokens extremely limited", () => {
      const result = compressor.compress(TREE_LISTING, { maxTokens: 1 });
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.budgetExceeded).toBe(true);
    });

    it("should not set budgetExceeded when budget is generous", () => {
      const result = compressor.compress(TREE_LISTING, { maxTokens: 10000 });
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.budgetExceeded).toBe(false);
    });

    it("should handle combined maxLines and maxTokens", () => {
      const result = compressor.compress(DEEP_TREE, { maxLines: 10, maxTokens: 30 });
      expect(result.format).toBe("air-ls");
      expect(result.compressedSize).toBeLessThanOrEqual(10);
    });
  });

  describe("stats footer", () => {
    it("should include stats footer by default", () => {
      const result = compressor.compress(TREE_LISTING);
      expect(result.output).toContain("--- air:");
      expect(result.output).toContain("saved");
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.statsIncluded).toBe(true);
    });

    it("should omit stats footer when maxLines=1", () => {
      const result = compressor.compress(TREE_LISTING, { maxLines: 1 });
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.statsIncluded).toBe(false);
    });

    it("should report savedPercent", () => {
      const result = compressor.compress(TREE_LISTING);
      const meta = result.metadata as Record<string, unknown>;
      expect(typeof meta.savedPercent).toBe("number");
      expect(meta.savedPercent as number).toBeGreaterThanOrEqual(0);
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      const result = compressor.compress("");
      expect(result.format).toBe("air-ls");
      expect(result.output).toBeTruthy();
    });

    it("should handle single file path", () => {
      const result = compressor.compress("README.md");
      expect(result.output).toContain("README.md");
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.totalFiles).toBe(1);
    });

    it("should normalize CRLF line endings", () => {
      const crlfListing = TREE_LISTING.replace(/\n/g, "\r\n");
      const result = compressor.compress(crlfListing);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.totalFiles).toBeGreaterThan(0);
    });

    it("should normalize standalone CR line endings", () => {
      const crListing = PATH_LIST.replace(/\n/g, "\r");
      const result = compressor.compress(crListing);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.totalFiles).toBeGreaterThan(0);
    });

    it("should handle paths with ./ prefix", () => {
      const listing = `./src/index.ts\n./src/utils.ts\n./README.md`;
      const result = compressor.compress(listing);
      expect(result.output).toContain("index.ts");
      expect(result.output).toContain("README.md");
    });

    it("should handle paths with backslashes", () => {
      const listing = `src\\index.ts\nsrc\\utils.ts`;
      const result = compressor.compress(listing);
      expect(result.output).toContain("index.ts");
    });

    it("should strip common root from path list entries", () => {
      const listing = `myapp/src/index.ts\nmyapp/src/utils.ts\nmyapp/README.md`;
      const result = compressor.compress(listing);
      expect(result.output).toContain("myapp");
    });

    it("should handle symlinks (-> notation) in ls -l", () => {
      const listing = `total 8\nlrwxr-xr-x  1 user staff  10 Jan  1 10:00 link -> target\n-rw-r--r--  1 user staff 512 Jan  1 10:00 file.txt`;
      const result = compressor.compress(listing);
      expect(result.output).toContain("link");
    });

    it("should handle column-style ls output", () => {
      const result = compressor.compress(COLUMN_LISTING);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.detectedFormat).toBe("path-list");
    });

    it("should handle trailing slashes on directory names", () => {
      const listing = `src/\ntests/\npackage.json`;
      const result = compressor.compress(listing);
      expect(result.output).toContain("src");
      expect(result.output).toContain("package.json");
    });

    it("should skip find error lines", () => {
      const listing = `find: permission denied\nsrc/index.ts\nsrc/utils.ts`;
      const result = compressor.compress(listing);
      expect(result.output).not.toContain("find:");
      expect(result.output).toContain("index.ts");
    });

    it("should handle tree summary line (N directories, M files)", () => {
      const result = compressor.compress(TREE_LISTING);
      expect(result.output).not.toContain("3 directories, 7 files");
    });
  });

  describe("sorting", () => {
    it("should sort directories before files", () => {
      const listing = `project\n├── file.txt\n├── src/\n│   └── index.ts\n└── README.md`;
      const result = compressor.compress(listing);
      const lines = result.output.split("\n");
      const srcLine = lines.findIndex((l) => l.includes("src/"));
      const fileLine = lines.findIndex((l) => l.includes("file.txt"));
      expect(srcLine).toBeLessThan(fileLine);
    });

    it("should sort entries alphabetically within same kind", () => {
      const listing = `src/zebra.ts\nsrc/alpha.ts\nsrc/middle.ts`;
      const result = compressor.compress(listing);
      const lines = result.output.split("\n");
      const alphaLine = lines.findIndex((l) => l.includes("alpha.ts"));
      const middleLine = lines.findIndex((l) => l.includes("middle.ts"));
      const zebraLine = lines.findIndex((l) => l.includes("zebra.ts"));
      expect(alphaLine).toBeLessThan(middleLine);
      expect(middleLine).toBeLessThan(zebraLine);
    });
  });

  describe("root name normalization", () => {
    it("should use project name from tree header", () => {
      const result = compressor.compress(TREE_LISTING);
      expect(result.output).toContain("my-project");
    });

    it("should normalize . to 'project'", () => {
      const listing = `.\n├── src/\n│   └── index.ts\n└── README.md`;
      const result = compressor.compress(listing);
      expect(result.output).toContain("project");
    });

    it("should strip trailing colon from root", () => {
      const listing = `myapp:\n├── src/\n│   └── index.ts\n└── README.md`;
      const result = compressor.compress(listing);
      expect(result.output).toContain("myapp");
    });
  });

  describe("metadata completeness", () => {
    it("should include all expected metadata fields", () => {
      const result = compressor.compress(TREE_LISTING);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta).toHaveProperty("originalLines");
      expect(meta).toHaveProperty("compressedLines");
      expect(meta).toHaveProperty("savedPercent");
      expect(meta).toHaveProperty("totalFiles");
      expect(meta).toHaveProperty("totalDirs");
      expect(meta).toHaveProperty("typeBreakdown");
      expect(meta).toHaveProperty("detectedFormat");
      expect(meta).toHaveProperty("groupByType");
      expect(meta).toHaveProperty("parsedNodes");
      expect(meta).toHaveProperty("budgetExceeded");
      expect(meta).toHaveProperty("statsIncluded");
    });

    it("should report parsedNodes count", () => {
      const result = compressor.compress(TREE_LISTING);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.parsedNodes).toBeGreaterThan(0);
    });

    it("should report original and compressed line counts matching top-level", () => {
      const result = compressor.compress(TREE_LISTING);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.originalLines).toBe(result.originalSize);
      expect(meta.compressedLines).toBe(result.compressedSize);
    });
  });
});
