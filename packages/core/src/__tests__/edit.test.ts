import { describe, it, expect } from "vitest";
import { EditCompressor } from "../compressors/edit.js";
import type { EditOptions } from "../compressors/edit.js";

// ============================================================
// Tests for EditCompressor (compressors/edit.ts)
// ============================================================

describe("EditCompressor", () => {
  const compressor = new EditCompressor();

  // --- Test 1: Basic edits ---
  describe("basic edits", () => {
    it("should apply a single-line replacement", () => {
      const content = [
        "const x = 1;",
        "const y = 2;",
        "const z = 3;",
      ].join("\n");

      const result = compressor.compress(content, {
        edits: [{ search: "const y = 2;", replace: "const y = 42;" }],
      });

      expect(result.format).toBe("air-edit");
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      expect(meta.total).toBe(1);
      expect(meta.status).toBe("success");
      // Modified content should have the replacement
      expect(meta.modifiedContent).toContain("const y = 42;");
      expect(meta.modifiedContent).not.toContain("const y = 2;");
    });

    it("should apply a multi-line replacement", () => {
      const content = [
        "function greet() {",
        "  console.log('hello');",
        "  console.log('world');",
        "}",
      ].join("\n");

      const result = compressor.compress(content, {
        edits: [{
          search: "  console.log('hello');\n  console.log('world');",
          replace: "  console.log('hello world');",
        }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      expect(meta.status).toBe("success");
      expect(meta.modifiedContent).toContain("console.log('hello world')");
      expect(meta.modifiedContent).not.toContain("console.log('hello');");
    });

    it("should insert lines via empty search (append)", () => {
      const content = "line1\nline2\n";

      const result = compressor.compress(content, {
        edits: [{ search: "", replace: "line3\n" }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      expect(meta.status).toBe("success");
      // Empty search → append at end
      expect(meta.modifiedContent).toContain("line3");
    });

    it("should delete lines via empty replace", () => {
      const content = [
        "const a = 1;",
        "console.log('debug');",
        "const b = 2;",
      ].join("\n");

      const result = compressor.compress(content, {
        edits: [{ search: "console.log('debug');\n", replace: "" }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      expect(meta.status).toBe("success");
      expect(meta.modifiedContent).not.toContain("console.log('debug')");
      expect(meta.modifiedContent).toContain("const a = 1;");
      expect(meta.modifiedContent).toContain("const b = 2;");
    });
  });

  // --- Test 2: Line number handling ---
  describe("line number handling", () => {
    it("should apply multiple sequential edits with accumulating line shifts", () => {
      // Each edit runs on the result of the previous one (accumulative execution)
      const content = [
        "line 1",
        "line 2",
        "line 3",
        "line 4",
        "line 5",
      ].join("\n");

      const result = compressor.compress(content, {
        edits: [
          // First edit: insert a line after line 2 (replace "line 2" with "line 2\nnew line")
          { search: "line 2", replace: "line 2\nnew line A" },
          // Second edit: operates on result of first, "line 4" still findable
          { search: "line 4", replace: "line 4\nnew line B" },
        ],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(2);
      expect(meta.total).toBe(2);
      expect(meta.status).toBe("success");
      expect(meta.modifiedContent).toContain("new line A");
      expect(meta.modifiedContent).toContain("new line B");
    });

    it("should report correct line numbers in change metadata", () => {
      const content = "aaa\nbbb\nccc\n";

      const result = compressor.compress(content, {
        edits: [{ search: "bbb", replace: "BBB" }],
      });

      const meta = result.metadata as Record<string, unknown>;
      const changes = meta.changes as Array<{ line: number }>;
      // "bbb" is on line 2
      expect(changes[0].line).toBe(2);
    });
  });

  // --- Test 3: Fuzzy matching (Levenshtein) ---
  describe("fuzzy matching", () => {
    it("should match via Levenshtein when exact match fails and context is provided", () => {
      // Simulate a typo/slight difference: search has minor difference from actual content
      const content = [
        "function calculate() {",
        "  const result = valeu + 10;",  // typo: 'valeu' in file
        "  return result;",
        "}",
      ].join("\n");

      const result = compressor.compress(content, {
        edits: [{
          search: "  const result = value + 10;",   // search has correct spelling
          replace: "  const result = value + 20;",
          context: "function calculate() {",         // context required for Levenshtein
        }],
        enableFuzzyMatch: true,
        fuzzyThreshold: 0.1,
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      const changes = meta.changes as Array<{ method: string; confidence: number }>;
      expect(changes[0].method).toBe("levenshtein");
      expect(changes[0].confidence).toBeGreaterThanOrEqual(0.5);
    });

    it("should not use fuzzy matching when enableFuzzyMatch is false", () => {
      const content = "  const x  =  1;";  // extra spaces

      const result = compressor.compress(content, {
        edits: [{ search: "const x = 1;", replace: "const x = 2;" }],
        enableFuzzyMatch: false,
      });

      const meta = result.metadata as Record<string, unknown>;
      // Exact match fails (extra spaces), fuzzy disabled → error
      expect(meta.applied).toBe(0);
      expect(meta.status).toBe("error");
    });
  });

  // --- Test 4: Hash-based matching ---
  describe("hash matching", () => {
    it("should match via line-hash when exact match fails but trimmed content matches", () => {
      // Content has different indentation than search
      const content = [
        "function foo() {",
        "    const a = 1;",    // 4-space indent
        "    const b = 2;",    // 4-space indent
        "}",
      ].join("\n");

      const result = compressor.compress(content, {
        edits: [{
          search: "  const a = 1;\n  const b = 2;",  // 2-space indent (different whitespace)
          replace: "  const a = 10;\n  const b = 20;",
        }],
        enableFuzzyMatch: true,
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      const changes = meta.changes as Array<{ method: string }>;
      // Should match via line-hash (trimmed content matches) or whitespace-normalized
      expect(["line-hash", "whitespace-normalized"]).toContain(changes[0].method);
    });

    it("should match via line-hash for reindented code blocks", () => {
      const content = [
        "class Foo {",
        "        doThing() {",       // 8-space indent
        "            return 42;",    // 12-space indent
        "        }",
        "}",
      ].join("\n");

      const result = compressor.compress(content, {
        edits: [{
          search: "doThing() {\n    return 42;\n}",  // different indentation
          replace: "doThing() {\n    return 99;\n}",
        }],
        enableFuzzyMatch: true,
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      const changes = meta.changes as Array<{ method: string; confidence: number }>;
      expect(changes[0].confidence).toBeGreaterThan(0);
    });
  });

  // --- Test 5: Edge cases ---
  describe("edge cases", () => {
    it("should handle empty file with append", () => {
      const result = compressor.compress("", {
        edits: [{ search: "", replace: "new content\n" }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      expect(meta.status).toBe("success");
      expect(meta.modifiedContent).toContain("new content");
    });

    it("should handle empty file with non-empty search (error)", () => {
      const result = compressor.compress("", {
        edits: [{ search: "nonexistent", replace: "something" }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(0);
      expect(meta.status).toBe("error");
      const errors = meta.errors as Array<{ reason: string }>;
      expect(errors.length).toBe(1);
    });

    it("should handle single-line file", () => {
      const result = compressor.compress("only line", {
        edits: [{ search: "only line", replace: "replaced line" }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      expect(meta.modifiedContent).toBe("replaced line");
    });

    it("should handle edit at very start of file", () => {
      const content = "first\nsecond\nthird";

      const result = compressor.compress(content, {
        edits: [{ search: "first", replace: "FIRST" }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      const changes = meta.changes as Array<{ line: number }>;
      expect(changes[0].line).toBe(1);
      expect(meta.modifiedContent).toMatch(/^FIRST/);
    });

    it("should handle edit at very end of file", () => {
      const content = "first\nsecond\nthird";

      const result = compressor.compress(content, {
        edits: [{ search: "third", replace: "THIRD" }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      expect(meta.modifiedContent).toMatch(/THIRD$/);
    });

    it("should handle overlapping edits via accumulative execution", () => {
      // Second edit modifies content created by first edit
      const content = "AAA\nBBB\nCCC";

      const result = compressor.compress(content, {
        edits: [
          { search: "BBB", replace: "XXX" },
          { search: "XXX", replace: "YYY" },  // operates on result of edit 1
        ],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(2);
      expect(meta.status).toBe("success");
      expect(meta.modifiedContent).toContain("YYY");
      expect(meta.modifiedContent).not.toContain("BBB");
      expect(meta.modifiedContent).not.toContain("XXX");
    });

    it("should treat search === replace as no-op success", () => {
      const content = "const x = 1;";

      const result = compressor.compress(content, {
        edits: [{ search: "const x = 1;", replace: "const x = 1;" }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      expect(meta.status).toBe("success");
      expect(meta.modifiedContent).toBe("const x = 1;");
    });
  });

  // --- Test 6: Encoding ---
  describe("encoding", () => {
    it("should handle CRLF line endings in content", () => {
      const content = "line1\r\nline2\r\nline3\r\n";

      const result = compressor.compress(content, {
        edits: [{ search: "line2", replace: "LINE2" }],
        lineEnding: "auto",
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      expect(meta.modifiedContent).toContain("LINE2");
    });

    it("should match across CRLF/LF differences in search vs content", () => {
      const content = "aaa\r\nbbb\r\nccc";
      // Search uses LF but content uses CRLF — auto mode should normalize
      const result = compressor.compress(content, {
        edits: [{ search: "aaa\nbbb", replace: "AAA\nBBB" }],
        lineEnding: "auto",
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      expect(meta.status).toBe("success");
    });

    it("should preserve line endings when lineEnding='preserve'", () => {
      const content = "alpha\r\nbeta\r\ngamma";

      const result = compressor.compress(content, {
        edits: [{ search: "beta", replace: "BETA" }],
        lineEnding: "preserve",
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
    });

    it("should handle BOM (byte order mark) in content", () => {
      const bom = "\uFEFF";
      const content = `${bom}const x = 1;\nconst y = 2;`;

      const result = compressor.compress(content, {
        edits: [{ search: "const y = 2;", replace: "const y = 99;" }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      expect(meta.modifiedContent).toContain("const y = 99;");
    });

    it("should handle unicode content in search and replace", () => {
      const content = "const greeting = '你好世界';\nconst emoji = '🚀';";

      const result = compressor.compress(content, {
        edits: [{ search: "const greeting = '你好世界';", replace: "const greeting = 'こんにちは';" }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      expect(meta.modifiedContent).toContain("こんにちは");
      expect(meta.modifiedContent).toContain("🚀");
    });
  });

  // --- Test 7: Error cases ---
  describe("error cases", () => {
    it("should report error when search string is not found", () => {
      const content = "const x = 1;";

      const result = compressor.compress(content, {
        edits: [{ search: "nonexistent code", replace: "replacement" }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(0);
      expect(meta.status).toBe("error");
      const errors = meta.errors as Array<{ edit: number; reason: string }>;
      expect(errors[0].edit).toBe(1);
      expect(errors[0].reason).toContain("NO_MATCH");
    });

    it("should isolate failures: partial success when some edits fail", () => {
      const content = "aaa\nbbb\nccc";

      const result = compressor.compress(content, {
        edits: [
          { search: "aaa", replace: "AAA" },          // succeeds
          { search: "nonexistent", replace: "XXX" },   // fails
          { search: "ccc", replace: "CCC" },           // succeeds
        ],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(2);
      expect(meta.total).toBe(3);
      expect(meta.status).toBe("partial");
      const errors = meta.errors as Array<{ edit: number }>;
      expect(errors[0].edit).toBe(2);  // second edit failed
    });

    it("should handle occurrence=0 as invalid (no match)", () => {
      const content = "foo\nfoo\nfoo";

      const result = compressor.compress(content, {
        edits: [{ search: "foo", replace: "bar", occurrence: 0 }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(0);
      expect(meta.status).toBe("error");
    });

    it("should handle out-of-range positive occurrence", () => {
      const content = "foo\nbar";

      const result = compressor.compress(content, {
        edits: [{ search: "foo", replace: "baz", occurrence: 99 }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(0);
      expect(meta.status).toBe("error");
    });

    it("should handle out-of-range negative occurrence", () => {
      const content = "foo\nbar";

      const result = compressor.compress(content, {
        edits: [{ search: "foo", replace: "baz", occurrence: -99 }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(0);
      expect(meta.status).toBe("error");
    });

    it("should handle edits array being empty", () => {
      const content = "some content";

      const result = compressor.compress(content, {
        edits: [],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(0);
      expect(meta.total).toBe(0);
      // No edits requested → trivially "success" (0/0)
      expect(meta.status).toBe("success");
    });
  });

  // --- Test 8: Compression quality ---
  describe("compression quality", () => {
    it("should produce output shorter than raw edit description", () => {
      // A realistic multi-edit scenario: output summary should be compact
      const content = Array.from({ length: 50 }, (_, i) => `line ${i + 1} content here`).join("\n");

      const result = compressor.compress(content, {
        fileName: "big-file.ts",
        edits: [
          { search: "line 10 content here", replace: "line 10 MODIFIED" },
          { search: "line 25 content here", replace: "line 25 MODIFIED" },
          { search: "line 40 content here", replace: "line 40 MODIFIED" },
        ],
      });

      // The compressed output (summary) should be much shorter than the original content
      expect(result.output.length).toBeLessThan(content.length);
      expect(result.compressedSize).toBeLessThan(result.originalSize);
    });

    it("should include air stats footer in output", () => {
      const content = "const x = 1;\nconst y = 2;\n";

      const result = compressor.compress(content, {
        fileName: "test.ts",
        edits: [{ search: "const x = 1;", replace: "const x = 99;" }],
      });

      // Stats footer format: --- air: N lines → M lines (P% saved) ---
      expect(result.output).toMatch(/--- air: \d+ lines → \d+ lines \(\d+% saved\) ---/);
    });

    it("should report accurate originalSize and compressedSize", () => {
      const content = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");

      const result = compressor.compress(content, {
        edits: [{ search: "line 5", replace: "CHANGED" }],
      });

      // originalSize is the original content line count
      expect(result.originalSize).toBe(20);
      // compressedSize is the summary output line count (should be small)
      expect(result.compressedSize).toBeGreaterThan(0);
      expect(result.compressedSize).toBeLessThan(result.originalSize);
    });

    it("should have correct format in result", () => {
      const result = compressor.compress("hello", {
        edits: [{ search: "hello", replace: "world" }],
      });

      expect(result.format).toBe("air-edit");
    });

    it("should report correct ratio (lower = more compressed)", () => {
      const content = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n");

      const result = compressor.compress(content, {
        edits: [{ search: "line 50", replace: "MODIFIED" }],
      });

      // ratio = compressedSize / originalSize, should be < 1
      expect(result.ratio).toBeGreaterThan(0);
      expect(result.ratio).toBeLessThan(1);
    });
  });

  // --- Test 9: Occurrence selection ---
  describe("occurrence selection", () => {
    it("should replace the first occurrence by default", () => {
      const content = "foo\nbar\nfoo\nbaz\nfoo";

      const result = compressor.compress(content, {
        edits: [{ search: "foo", replace: "FIRST" }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      const modified = meta.modifiedContent as string;
      // First "foo" replaced, others remain
      expect(modified).toMatch(/^FIRST/);
      expect(modified).toContain("foo");  // other occurrences still exist
    });

    it("should replace the Nth positive occurrence", () => {
      const content = "foo\nbar\nfoo\nbaz\nfoo";

      const result = compressor.compress(content, {
        edits: [{ search: "foo", replace: "SECOND", occurrence: 2 }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      const modified = meta.modifiedContent as string;
      const lines = modified.split("\n");
      // Second occurrence is at line 3
      expect(lines[0]).toBe("foo");      // first unchanged
      expect(lines[2]).toBe("SECOND");   // second replaced
      expect(lines[4]).toBe("foo");      // third unchanged
    });

    it("should replace last occurrence with occurrence=-1", () => {
      const content = "foo\nbar\nfoo\nbaz\nfoo";

      const result = compressor.compress(content, {
        edits: [{ search: "foo", replace: "LAST", occurrence: -1 }],
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      const modified = meta.modifiedContent as string;
      // Last "foo" replaced
      expect(modified).toMatch(/LAST$/);
    });
  });

  // --- Test 10: Dry run ---
  describe("dry run", () => {
    it("should not modify content when dryRun=true", () => {
      const content = "const x = 1;";

      const result = compressor.compress(content, {
        edits: [{ search: "const x = 1;", replace: "const x = 99;" }],
        dryRun: true,
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      expect(meta.status).toBe("success");
      // In dry run, modifiedContent should be the original
      expect(meta.modifiedContent).toBe("const x = 1;");
    });
  });

  // --- Test 11: Whitespace-normalized matching ---
  describe("whitespace-normalized matching", () => {
    it("should match when only whitespace differs", () => {
      const content = "const   x  =   1;";  // extra spaces

      const result = compressor.compress(content, {
        edits: [{ search: "const x = 1;", replace: "const x = 2;" }],
        enableFuzzyMatch: true,
      });

      const meta = result.metadata as Record<string, unknown>;
      expect(meta.applied).toBe(1);
      const changes = meta.changes as Array<{ method: string }>;
      expect(changes[0].method).toBe("whitespace-normalized");
    });
  });

  // --- Test 12: Output summary format ---
  describe("output summary format", () => {
    it("should include success icon and change count in output", () => {
      const content = "aaa\nbbb\nccc";

      const result = compressor.compress(content, {
        fileName: "test.ts",
        edits: [
          { search: "aaa", replace: "AAA" },
          { search: "ccc", replace: "CCC" },
        ],
      });

      // Output should contain success icon and count
      expect(result.output).toContain("2/2");
      expect(result.output).toContain("test.ts");
    });

    it("should include error details in output for failed edits", () => {
      const content = "aaa\nbbb";

      const result = compressor.compress(content, {
        fileName: "fail.ts",
        edits: [
          { search: "aaa", replace: "AAA" },
          { search: "nonexistent", replace: "X" },
        ],
      });

      // Should show partial status and error info
      expect(result.output).toContain("1/2");
      expect(result.output).toContain("fail.ts");
    });

    it("should include change summaries with line numbers", () => {
      const content = "alpha\nbeta\ngamma";

      const result = compressor.compress(content, {
        fileName: "summary.ts",
        edits: [{ search: "beta", replace: "BETA" }],
      });

      // Output should mention the line where change occurred
      expect(result.output).toMatch(/Line \d+/);
    });
  });
});