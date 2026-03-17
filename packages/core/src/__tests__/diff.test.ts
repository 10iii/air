import { describe, it, expect } from "vitest";
import { DiffCompressor } from "../compressors/diff.js";

// ============================================================
// Tests for DiffCompressor (compressors/diff.ts)
// ============================================================

const SIMPLE_MODIFY_DIFF = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,5 @@
 import { foo } from "./foo";
-import { bar } from "./bar";
+import { bar, baz } from "./bar";
 
 export function main() {
-  return foo() + bar();
+  return foo() + bar() + baz();
 }`;

const NEW_FILE_DIFF = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,5 @@
+export function hello() {
+  console.log("hello");
+}
+
+export default hello;`;

const DELETE_FILE_DIFF = `diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old-file.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function deprecated() {
-  return "old";
-}`;

const RENAME_DIFF = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 95%
rename from src/old-name.ts
rename to src/new-name.ts
index abc1234..def5678 100644
--- a/src/old-name.ts
+++ b/src/new-name.ts
@@ -1,3 +1,3 @@
-export function oldFunc() {
+export function newFunc() {
   return 42;
 }`;

const BINARY_DIFF = `diff --git a/assets/logo.png b/assets/logo.png
new file mode 100644
index 0000000..abc1234
Binary files /dev/null and b/assets/logo.png differ`;

const MULTI_FILE_DIFF = `diff --git a/src/a.ts b/src/a.ts
index abc1234..def5678 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 export function a() {
   return 1;
+  // added comment
 }
diff --git a/src/b.ts b/src/b.ts
index abc1234..def5678 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,3 +1,3 @@
 export function b() {
-  return 2;
+  return 22;
 }`;

const MULTI_HUNK_DIFF = `diff --git a/src/large.ts b/src/large.ts
index abc1234..def5678 100644
--- a/src/large.ts
+++ b/src/large.ts
@@ -1,5 +1,5 @@
 import { foo } from "./foo";
-import { bar } from "./bar";
+import { bar, baz } from "./bar";
 
 export function main() {
   return foo();
@@ -20,5 +20,6 @@
 export function helper() {
   const x = 1;
-  return x;
+  const y = 2;
+  return x + y;
 }`;

const DIFF_WITH_STATS = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,3 @@
-const old = true;
+const updated = true;

 2 files changed, 3 insertions(+), 1 deletion(-)`;

describe("DiffCompressor", () => {
  const compressor = new DiffCompressor();

  // ============================================================
  // Basic functionality
  // ============================================================

  describe("basic functionality", () => {
    it("should compress a simple modification diff", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF);
      expect(result.format).toBe("air-diff");
      expect(result.output).toBeTruthy();
      expect(result.originalSize).toBeGreaterThan(0);
      expect(result.compressedSize).toBeGreaterThan(0);
      expect(result.ratio).toBeGreaterThan(0);
      expect(result.ratio).toBeLessThanOrEqual(1);
    });

    it("should return valid CompressResult structure", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF);
      expect(result).toHaveProperty("output");
      expect(result).toHaveProperty("originalSize");
      expect(result).toHaveProperty("compressedSize");
      expect(result).toHaveProperty("ratio");
      expect(result).toHaveProperty("format");
      expect(result).toHaveProperty("metadata");
    });

    it("should detect modifications", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF);
      expect(result.output).toContain("M src/index.ts");
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.parsedFiles).toBe(1);
    });

    it("should detect new file additions", () => {
      const result = compressor.compress(NEW_FILE_DIFF);
      expect(result.output).toContain("A src/new-file.ts");
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.insertions).toBe(5);
      expect(meta.deletions).toBe(0);
    });

    it("should detect file deletions", () => {
      const result = compressor.compress(DELETE_FILE_DIFF);
      expect(result.output).toContain("D src/old-file.ts");
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.deletions).toBe(3);
    });

    it("should detect file renames", () => {
      const result = compressor.compress(RENAME_DIFF);
      expect(result.output).toContain("R");
      expect(result.output).toContain("old-name.ts");
      expect(result.output).toContain("new-name.ts");
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.parsedFiles).toBe(1);
    });

    it("should handle binary files", () => {
      const result = compressor.compress(BINARY_DIFF);
      expect(result.output).toContain("binary");
    });

    it("should handle multi-file diffs", () => {
      const result = compressor.compress(MULTI_FILE_DIFF);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.parsedFiles).toBe(2);
      expect(meta.filesChanged).toBe(2);
    });
  });

  // ============================================================
  // Compression levels
  // ============================================================

  describe("compression levels", () => {
    it("should default to compact level", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.level).toBe("compact");
    });

    it("should support summary level", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF, { level: "summary" });
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.level).toBe("summary");
      // Summary should be the most compressed
      const compactResult = compressor.compress(SIMPLE_MODIFY_DIFF, { level: "compact" });
      expect(result.compressedSize).toBeLessThanOrEqual(compactResult.compressedSize);
    });

    it("should support compact level", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF, { level: "compact" });
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.level).toBe("compact");
      // Compact strips context lines (lines starting with space)
      const lines = result.output.split("\n");
      const contextLines = lines.filter(
        (line) =>
          line.startsWith(" ") &&
          !line.startsWith("--- air:") &&
          !line.includes("omitted")
      );
      // In compact mode, pure context lines should be removed
      expect(contextLines.length).toBe(0);
    });

    it("should support full level", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF, { level: "full" });
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.level).toBe("full");
      // Full should preserve everything
      const compactResult = compressor.compress(SIMPLE_MODIFY_DIFF, { level: "compact" });
      expect(result.compressedSize).toBeGreaterThanOrEqual(compactResult.compressedSize);
    });

    it("summary should produce a stat header line", () => {
      const result = compressor.compress(MULTI_FILE_DIFF, { level: "summary" });
      // Summary mode outputs "N files changed, +X -Y" as first line
      expect(result.output).toMatch(/\d+ files changed/);
    });

    it("compact should strip context-only lines from hunks", () => {
      const result = compressor.compress(MULTI_HUNK_DIFF, { level: "compact" });
      expect(result.output).toContain("@@");
      expect(result.output).toContain('+import { bar, baz } from "./bar"');
      expect(result.output).not.toContain(' import { foo } from "./foo"');
      expect(result.output).not.toContain("   return foo();");
    });

    it("full should include all raw lines", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF, { level: "full" });
      // Full mode preserves context lines
      expect(result.output).toContain('import { foo } from "./foo"');
    });
  });

  // ============================================================
  // maxLines truncation
  // ============================================================

  describe("maxLines option", () => {
    it("should truncate output when maxLines is set", () => {
      const full = compressor.compress(MULTI_FILE_DIFF, { level: "full" });
      const truncated = compressor.compress(MULTI_FILE_DIFF, { level: "full", maxLines: 5 });
      expect(truncated.compressedSize).toBeLessThanOrEqual(5);
      expect(truncated.compressedSize).toBeLessThan(full.compressedSize);
    });

    it("should handle maxLines = 1", () => {
      const result = compressor.compress(MULTI_FILE_DIFF, { maxLines: 1 });
      // With maxLines=1, stats are excluded (budget <= footerEstimatedLines)
      const lines = result.output.split("\n");
      expect(lines.length).toBeLessThanOrEqual(1);
    });

    it("should not truncate if output fits within maxLines", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF, { level: "summary", maxLines: 100 });
      const meta = result.metadata as Record<string, unknown>;
      // No truncation needed
      expect(result.output).not.toContain("omitted");
      expect(meta.statsIncluded).toBe(true);
    });

    it("should ignore non-positive maxLines", () => {
      const normal = compressor.compress(SIMPLE_MODIFY_DIFF);
      const withZero = compressor.compress(SIMPLE_MODIFY_DIFF, { maxLines: 0 });
      const withNeg = compressor.compress(SIMPLE_MODIFY_DIFF, { maxLines: -5 });
      // Non-positive values should be treated as undefined (no limit)
      expect(withZero.compressedSize).toBe(normal.compressedSize);
      expect(withNeg.compressedSize).toBe(normal.compressedSize);
    });

    it("should include omitted indicator when truncating", () => {
      const result = compressor.compress(MULTI_FILE_DIFF, { level: "full", maxLines: 3 });
      expect(result.output).toContain("omitted");
    });
  });

  // ============================================================
  // maxTokens truncation
  // ============================================================

  describe("maxTokens option", () => {
    it("should truncate by token budget", () => {
      const full = compressor.compress(MULTI_FILE_DIFF, { level: "full" });
      const limited = compressor.compress(MULTI_FILE_DIFF, { level: "full", maxTokens: 30 });
      expect(limited.compressedSize).toBeLessThan(full.compressedSize);
    });

    it("should set budgetExceeded when tokens are extremely limited", () => {
      const result = compressor.compress(MULTI_FILE_DIFF, { level: "full", maxTokens: 1 });
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.budgetExceeded).toBe(true);
    });

    it("should not set budgetExceeded when budget is generous", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF, { maxTokens: 10000 });
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.budgetExceeded).toBe(false);
    });

    it("should ignore non-positive maxTokens", () => {
      const normal = compressor.compress(SIMPLE_MODIFY_DIFF);
      const withZero = compressor.compress(SIMPLE_MODIFY_DIFF, { maxTokens: 0 });
      expect(withZero.compressedSize).toBe(normal.compressedSize);
    });
  });

  // ============================================================
  // Stats and metadata
  // ============================================================

  describe("metadata", () => {
    it("should count insertions and deletions correctly", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.insertions).toBe(2);
      expect(meta.deletions).toBe(2);
    });

    it("should count files changed", () => {
      const result = compressor.compress(MULTI_FILE_DIFF);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.filesChanged).toBe(2);
    });

    it("should report savedPercent", () => {
      const result = compressor.compress(MULTI_FILE_DIFF, { level: "summary" });
      const meta = result.metadata as Record<string, unknown>;
      expect(typeof meta.savedPercent).toBe("number");
      expect(meta.savedPercent as number).toBeGreaterThanOrEqual(0);
    });

    it("should report original and compressed line counts", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.originalLines).toBe(result.originalSize);
      expect(meta.compressedLines).toBe(result.compressedSize);
    });

    it("should prefer extracted stats from diff content when available", () => {
      const result = compressor.compress(DIFF_WITH_STATS);
      const meta = result.metadata as Record<string, unknown>;
      // Extracted stats from the "2 files changed" line
      expect(meta.usedExtractedStats).toBe(true);
      expect(meta.filesChanged).toBe(2);
      expect(meta.insertions).toBe(3);
      expect(meta.deletions).toBe(1);
    });

    it("should include stats footer line by default", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF);
      expect(result.output).toContain("--- air:");
      expect(result.output).toContain("saved");
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.statsIncluded).toBe(true);
    });

    it("should omit stats footer when budget is extremely tight", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF, { maxLines: 1 });
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.statsIncluded).toBe(false);
    });
  });

  // ============================================================
  // Edge cases
  // ============================================================

  describe("edge cases", () => {
    it("should handle empty string", () => {
      const result = compressor.compress("");
      expect(result.format).toBe("air-diff");
      expect(result.output).toContain("0 files changed");
    });

    it("should handle non-diff content gracefully", () => {
      const result = compressor.compress("this is not a diff\njust random text\n");
      expect(result.format).toBe("air-diff");
      expect(result.output).toContain("0 files changed");
    });

    it("should normalize CRLF line endings", () => {
      const crlfDiff = SIMPLE_MODIFY_DIFF.replace(/\n/g, "\r\n");
      const result = compressor.compress(crlfDiff);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.parsedFiles).toBe(1);
      expect(result.output).toContain("M src/index.ts");
    });

    it("should normalize standalone CR line endings", () => {
      const crDiff = SIMPLE_MODIFY_DIFF.replace(/\n/g, "\r");
      const result = compressor.compress(crDiff);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.parsedFiles).toBe(1);
    });

    it("should handle diff with only binary files", () => {
      const result = compressor.compress(BINARY_DIFF);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.parsedFiles).toBe(1);
      expect(meta.insertions).toBe(0);
      expect(meta.deletions).toBe(0);
    });

    it("should handle diff with rename and similarity index", () => {
      const result = compressor.compress(RENAME_DIFF);
      expect(result.output).toContain("similarity");
      expect(result.output).toContain("95%");
    });

    it("should handle diff with multiple hunks", () => {
      const result = compressor.compress(MULTI_HUNK_DIFF);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.insertions).toBe(3);
      expect(meta.deletions).toBe(2);
    });

    it("should handle quoted paths", () => {
      const quotedPathDiff = `diff --git "a/path with spaces/file.ts" "b/path with spaces/file.ts"
index abc1234..def5678 100644
--- "a/path with spaces/file.ts"
+++ "b/path with spaces/file.ts"
@@ -1,3 +1,3 @@
-const x = 1;
+const x = 2;`;
      const result = compressor.compress(quotedPathDiff);
      // The diff header regex expects unquoted format; this tests graceful handling
      expect(result.format).toBe("air-diff");
    });

    it("should handle GIT binary patch marker", () => {
      const gitBinaryPatch = `diff --git a/assets/image.png b/assets/image.png
new file mode 100644
index 0000000..abc1234
GIT binary patch
literal 1234
some binary data here`;
      const result = compressor.compress(gitBinaryPatch);
      expect(result.output).toContain("binary");
    });

    it("should handle combined maxLines and maxTokens", () => {
      const result = compressor.compress(MULTI_FILE_DIFF, {
        level: "full",
        maxLines: 10,
        maxTokens: 50,
      });
      expect(result.format).toBe("air-diff");
      expect(result.compressedSize).toBeLessThanOrEqual(10);
    });

    it("should strip trailing blank lines from body", () => {
      const diffWithTrailingBlanks = SIMPLE_MODIFY_DIFF + "\n\n\n";
      const result = compressor.compress(diffWithTrailingBlanks);
      const lines = result.output.split("\n");
      // The last line should be the stats footer, not blank
      expect(lines[lines.length - 1]).toMatch(/^--- air:/);
    });
  });

  // ============================================================
  // Compact mode specifics
  // ============================================================

  describe("compact mode details", () => {
    it("should include hunk headers in compact mode", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF, { level: "compact" });
      expect(result.output).toContain("@@");
    });

    it("should show changed lines in compact mode", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF, { level: "compact" });
      expect(result.output).toContain('+import { bar, baz } from "./bar"');
      expect(result.output).toContain('-import { bar } from "./bar"');
    });

    it("should handle binary file in compact mode", () => {
      const result = compressor.compress(BINARY_DIFF, { level: "compact" });
      expect(result.output).toContain("Binary file changed");
    });

    it("should handle file with no hunks in compact mode", () => {
      // A rename with no content change (all context, no +/-)
      const renameOnlyDiff = `diff --git a/src/old.ts b/src/new.ts
similarity index 100%
rename from src/old.ts
rename to src/new.ts`;
      const result = compressor.compress(renameOnlyDiff, { level: "compact" });
      expect(result.output).toContain("R");
      expect(result.output).toContain("No textual hunks");
    });
  });

  // ============================================================
  // Summary mode specifics
  // ============================================================

  describe("summary mode details", () => {
    it("should show file count and total changes", () => {
      const result = compressor.compress(MULTI_FILE_DIFF, { level: "summary" });
      expect(result.output).toContain("2 files changed");
    });

    it("should show per-file summary with delta", () => {
      const result = compressor.compress(MULTI_FILE_DIFF, { level: "summary" });
      expect(result.output).toContain("M src/a.ts");
      expect(result.output).toContain("M src/b.ts");
    });

    it("should show delta for additions only", () => {
      const result = compressor.compress(NEW_FILE_DIFF, { level: "summary" });
      expect(result.output).toContain("(+5)");
    });

    it("should show delta for deletions only", () => {
      const result = compressor.compress(DELETE_FILE_DIFF, { level: "summary" });
      expect(result.output).toContain("(-3)");
    });

    it("should show rename with arrow notation", () => {
      const result = compressor.compress(RENAME_DIFF, { level: "summary" });
      expect(result.output).toContain("→");
    });
  });

  // ============================================================
  // Full mode specifics
  // ============================================================

  describe("full mode details", () => {
    it("should preserve diff headers in full mode", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF, { level: "full" });
      expect(result.output).toContain("diff --git");
      expect(result.output).toContain("--- a/src/index.ts");
      expect(result.output).toContain("+++ b/src/index.ts");
    });

    it("should preserve context lines in full mode", () => {
      const result = compressor.compress(SIMPLE_MODIFY_DIFF, { level: "full" });
      expect(result.output).toContain('import { foo } from "./foo"');
      expect(result.output).toContain("export function main()");
    });

    it("should separate multiple files with blank lines", () => {
      const result = compressor.compress(MULTI_FILE_DIFF, { level: "full" });
      // There should be a blank line between file blocks
      expect(result.output).toContain("\n\n");
    });
  });

  // ============================================================
  // Priority-based truncation
  // ============================================================

  describe("priority-based truncation", () => {
    it("should prioritize headers and first hunk over rest", () => {
      const result = compressor.compress(MULTI_HUNK_DIFF, { level: "full", maxLines: 12 });
      expect(result.output).toContain("@@");
      expect(result.output).toContain("omitted");
    });

    it("summary mode should truncate large file lists with omitted indicator", () => {
      // Build a diff with many files
      const files = Array.from({ length: 20 }, (_, i) => {
        return `diff --git a/src/file${i}.ts b/src/file${i}.ts
index abc1234..def5678 100644
--- a/src/file${i}.ts
+++ b/src/file${i}.ts
@@ -1,1 +1,1 @@
-const x${i} = 1;
+const x${i} = 2;`;
      }).join("\n");

      const result = compressor.compress(files, { level: "summary", maxLines: 5 });
      expect(result.output).toContain("omitted");
    });
  });
});
