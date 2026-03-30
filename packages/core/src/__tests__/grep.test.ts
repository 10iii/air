import { describe, it, expect } from "vitest";
import { GrepCompressor } from "../compressors/grep.js";

function buildInput(lines: string[]): string {
  return lines.join("\n");
}

describe("GrepCompressor", () => {
  const compressor = new GrepCompressor();

  describe("basic parsing", () => {
    it("parses standard grep format", () => {
      const input = buildInput(["src/a.ts:10:const a = 1;"]);
      const result = compressor.compress(input);
      expect(result.output).toContain("1 match in 1 file");
      expect(result.output).toContain("src/a.ts (1 match):");
      expect(result.output).toContain("  :10 const a = 1;");
    });

    it("parses colon-dash format", () => {
      const input = buildInput(["src/a.ts:10-const a = 1;"]);
      const result = compressor.compress(input);
      expect(result.output).toContain("src/a.ts (1 match):");
      expect(result.output).toContain("  :10 const a = 1;");
    });

    it("parses dash format", () => {
      const input = buildInput(["src-a-ts-10-const a = 1;"]);
      const result = compressor.compress(input);
      expect(result.output).toContain("src-a-ts (1 match):");
      expect(result.output).toContain("  :10 const a = 1;");
    });

    it("parses ripgrep line with column", () => {
      const input = buildInput(["src/a.ts:10:5:const a = 1;"]);
      const result = compressor.compress(input);
      expect(result.output).toContain("src/a.ts (1 match):");
      expect(result.output).toContain("  :10:5 const a = 1;");
    });

    it("parses mixed format lines together", () => {
      const input = buildInput([
        "src/a.ts:10:alpha",
        "src/a.ts:12-beta",
        "src-b-ts-20-gamma",
        "src/c.ts:30:9:delta",
      ]);
      const result = compressor.compress(input);
      expect(result.output).toContain("4 matches in 3 files");
      expect(result.output).toContain("a.ts (2 matches)");
      expect(result.output).toContain("b-ts (1 match):");
      expect(result.output).toContain("c.ts (1 match):");
    });

    it("ignores invalid lines", () => {
      const input = buildInput([
        "not a grep line",
        "src/a.ts:not-a-line:content",
        "src/a.ts:10:valid",
      ]);
      const result = compressor.compress(input);
      expect(result.output).toContain("1 match in 1 file");
      expect((result.metadata as Record<string, unknown>).ignoredLines).toBe(2);
    });

    it("keeps content containing colons", () => {
      const input = buildInput(["src/a.ts:10:const map = { key: value: 1 };"]);
      const result = compressor.compress(input);
      expect(result.output).toContain("const map = { key: value: 1 };");
    });

    it("parses windows path with grep format", () => {
      const input = buildInput([String.raw`C:\repo\src\a.ts:10:hello`]);
      const result = compressor.compress(input);
      expect(result.output).toContain("a.ts (1 match):");
      expect(result.output).toContain("  :10 hello");
    });

    it("parses windows path with ripgrep column format", () => {
      const input = buildInput([String.raw`C:\repo\src\a.ts:10:3:hello`]);
      const result = compressor.compress(input);
      expect(result.output).toContain("a.ts (1 match):");
      expect(result.output).toContain("  :10:3 hello");
    });

    it("handles blank input lines", () => {
      const input = buildInput(["", "src/a.ts:1:alpha", "", ""]);
      const result = compressor.compress(input);
      expect(result.output).toContain("1 match in 1 file");
      expect((result.metadata as Record<string, unknown>).ignoredLines).toBe(3);
    });
  });

  describe("grouping and ordering", () => {
    it("groups multiple matches under one file header", () => {
      const input = buildInput([
        "src/a.ts:1:alpha",
        "src/a.ts:10:beta",
        "src/a.ts:20:gamma",
      ]);
      const result = compressor.compress(input, { mergeDistance: 0 });
      const headerCount = (result.output.match(/src\/a\.ts \(3 matches\):/g) ?? []).length;
      expect(headerCount).toBe(1);
    });

    it("handles duplicate line matches", () => {
      const input = buildInput([
        "src/a.ts:10:alpha",
        "src/a.ts:10:beta",
      ]);
      const result = compressor.compress(input, { mergeDistance: 0 });
      expect(result.output).toContain(":10 (2 matches)");
      expect(result.output).toContain("    :10 alpha");
      expect(result.output).toContain("    :10 beta");
    });

    it("counts per-file match totals", () => {
      const input = buildInput([
        "src/a.ts:1:a",
        "src/a.ts:2:b",
        "src/b.ts:1:c",
      ]);
      const result = compressor.compress(input, { mergeDistance: 0 });
      expect(result.output).toContain("a.ts (2 matches):");
      expect(result.output).toContain("b.ts (1 match):");
    });

    it("orders files by match count descending", () => {
      const input = buildInput([
        "src/a.ts:1:a",
        "src/a.ts:2:b",
        "src/a.ts:3:c",
        "src/b.ts:1:d",
      ]);
      const result = compressor.compress(input, { mergeDistance: 0 });
      const aIndex = result.output.indexOf("a.ts (3 matches):");
      const bIndex = result.output.indexOf("b.ts (1 match):");
      expect(aIndex).toBeGreaterThan(-1);
      expect(bIndex).toBeGreaterThan(-1);
      expect(aIndex).toBeLessThan(bIndex);
    });

    it("uses lexicographic path order for ties", () => {
      const input = buildInput([
        "src/b.ts:1:b",
        "src/a.ts:1:a",
      ]);
      const result = compressor.compress(input, { mergeDistance: 0 });
      const aIndex = result.output.indexOf("a.ts (1 match):");
      const bIndex = result.output.indexOf("b.ts (1 match):");
      expect(aIndex).toBeLessThan(bIndex);
    });

    it("reports summary counts for matches and files", () => {
      const input = buildInput([
        "src/a.ts:1:a",
        "src/b.ts:1:b",
        "src/b.ts:2:c",
      ]);
      const result = compressor.compress(input);
      expect(result.output).toContain("3 matches in 2 files");
    });

    it("reports singular summary when one match and one file", () => {
      const input = buildInput(["src/a.ts:1:a"]);
      const result = compressor.compress(input);
      expect(result.output).toContain("1 match in 1 file");
    });
  });

  describe("common prefix compression", () => {
    it("strips unix common prefix", () => {
      const input = buildInput([
        "/repo/src/auth/a.ts:1:a",
        "/repo/src/auth/b.ts:2:b",
      ]);
      const result = compressor.compress(input, { mergeDistance: 0 });
      expect(result.output).toContain("a.ts (1 match):");
      expect(result.output).toContain("b.ts (1 match):");
      expect(result.output).not.toContain("/repo/src/auth/a.ts (1 match):");
    });

    it("strips windows common prefix", () => {
      const input = buildInput([
        String.raw`C:\repo\src\auth\a.ts:1:a`,
        String.raw`C:\repo\src\auth\b.ts:2:b`,
      ]);
      const result = compressor.compress(input, { mergeDistance: 0 });
      expect(result.output).toContain("a.ts (1 match):");
      expect(result.output).toContain("b.ts (1 match):");
    });

    it("does not strip when no separator-bounded prefix exists", () => {
      const input = buildInput([
        "srcA/file.ts:1:a",
        "srcB/file.ts:1:b",
      ]);
      const result = compressor.compress(input, { mergeDistance: 0 });
      expect(result.output).toContain("srcA/file.ts (1 match):");
      expect(result.output).toContain("srcB/file.ts (1 match):");
    });

    it("keeps full path when only one file exists", () => {
      const input = buildInput(["/repo/src/file.ts:1:a"]);
      const result = compressor.compress(input);
      expect(result.output).toContain("/repo/src/file.ts (1 match):");
    });

    it("exposes common prefix in metadata", () => {
      const input = buildInput([
        "/repo/src/a.ts:1:a",
        "/repo/src/b.ts:1:b",
      ]);
      const result = compressor.compress(input);
      expect((result.metadata as Record<string, unknown>).commonPathPrefix).toBe("/repo/src/");
    });
  });

  describe("merge distance behavior", () => {
    it("merges nearby matches with default distance", () => {
      const input = buildInput([
        "src/a.ts:10:alpha",
        "src/a.ts:12:beta",
      ]);
      const result = compressor.compress(input);
      expect(result.output).toContain(":10-12 (2 matches)");
    });

    it("merges when exactly at distance boundary", () => {
      const input = buildInput([
        "src/a.ts:10:alpha",
        "src/a.ts:13:beta",
      ]);
      const result = compressor.compress(input, { mergeDistance: 3 });
      expect(result.output).toContain(":10-13 (2 matches)");
    });

    it("does not merge when outside distance", () => {
      const input = buildInput([
        "src/a.ts:10:alpha",
        "src/a.ts:14:beta",
      ]);
      const result = compressor.compress(input, { mergeDistance: 3 });
      expect(result.output).not.toContain(":10-14 (2 matches)");
      expect(result.output).toContain("  :10 alpha");
      expect(result.output).toContain("  :14 beta");
    });

    it("supports mergeDistance zero", () => {
      const input = buildInput([
        "src/a.ts:10:alpha",
        "src/a.ts:11:beta",
      ]);
      const result = compressor.compress(input, { mergeDistance: 0 });
      expect(result.output).not.toContain(":10-11");
      expect(result.output).toContain("  :10 alpha");
      expect(result.output).toContain("  :11 beta");
    });

    it("keeps sorted order by line in merged block", () => {
      const input = buildInput([
        "src/a.ts:30:gamma",
        "src/a.ts:10:alpha",
        "src/a.ts:20:beta",
      ]);
      const result = compressor.compress(input, { mergeDistance: 20 });
      const alphaIndex = result.output.indexOf(":10 alpha");
      const betaIndex = result.output.indexOf(":20 beta");
      const gammaIndex = result.output.indexOf(":30 gamma");
      expect(alphaIndex).toBeLessThan(betaIndex);
      expect(betaIndex).toBeLessThan(gammaIndex);
    });

    it("collapses large merged blocks with nearby summary", () => {
      const input = buildInput([
        "src/a.ts:10:a",
        "src/a.ts:11:b",
        "src/a.ts:12:c",
        "src/a.ts:13:d",
        "src/a.ts:14:e",
      ]);
      const result = compressor.compress(input, { mergeDistance: 10 });
      expect(result.output).toContain("more nearby matches");
    });

    it("retains column information in merged blocks", () => {
      const input = buildInput([
        "src/a.ts:10:2:alpha",
        "src/a.ts:11:8:beta",
      ]);
      const result = compressor.compress(input, { mergeDistance: 3 });
      expect(result.output).toContain(":10:2 alpha");
      expect(result.output).toContain(":11:8 beta");
    });
  });

  describe("maxFiles and filesOnly mode", () => {
    it("limits files with default maxFiles=20", () => {
      const lines = Array.from({ length: 21 }, (_, i) => `src/f${i + 1}.ts:1:x${i + 1}`);
      const result = compressor.compress(buildInput(lines), { mergeDistance: 0 });
      expect(result.output).toContain("... and 1 more file (1 match)");
      expect((result.metadata as Record<string, unknown>).displayedFiles).toBe(20);
    });

    it("respects custom maxFiles", () => {
      const input = buildInput([
        "src/a.ts:1:a",
        "src/b.ts:1:b",
        "src/c.ts:1:c",
        "src/d.ts:1:d",
      ]);
      const result = compressor.compress(input, { maxFiles: 2, mergeDistance: 0 });
      expect(result.output).toContain("... and 2 more files (2 matches)");
      expect((result.metadata as Record<string, unknown>).displayedFiles).toBe(2);
      expect((result.metadata as Record<string, unknown>).hiddenFiles).toBe(2);
    });

    it("does not add hidden-file summary when under maxFiles", () => {
      const input = buildInput([
        "src/a.ts:1:a",
        "src/b.ts:1:b",
      ]);
      const result = compressor.compress(input, { maxFiles: 5 });
      expect(result.output).not.toContain("more files");
    });

    it("filesOnly prints only file lines and counts", () => {
      const input = buildInput([
        "src/a.ts:1:a",
        "src/a.ts:2:b",
        "src/b.ts:5:c",
      ]);
      const result = compressor.compress(input, { filesOnly: true });
      expect(result.output).toContain("a.ts (2 matches)");
      expect(result.output).toContain("b.ts (1 match)");
      expect(result.output).not.toMatch(/(^|\n)\s*:\d+/);
    });

    it("filesOnly still includes global summary line", () => {
      const input = buildInput([
        "src/a.ts:1:a",
        "src/b.ts:1:b",
      ]);
      const result = compressor.compress(input, { filesOnly: true });
      expect(result.output).toContain("2 matches in 2 files");
    });

    it("filesOnly works with maxFiles truncation", () => {
      const input = buildInput([
        "src/a.ts:1:a",
        "src/b.ts:1:b",
        "src/c.ts:1:c",
      ]);
      const result = compressor.compress(input, {
        filesOnly: true,
        maxFiles: 1,
      });
      expect(result.output).toContain("... and 2 more files (2 matches)");
    });

    it("filesOnly applies path prefix compression", () => {
      const input = buildInput([
        "/repo/src/a.ts:1:a",
        "/repo/src/b.ts:1:b",
      ]);
      const result = compressor.compress(input, { filesOnly: true });
      expect(result.output).toContain("a.ts (1 match)");
      expect(result.output).toContain("b.ts (1 match)");
      expect(result.output).not.toContain("/repo/src/a.ts");
    });

    it("handles filesOnly with empty parsed result", () => {
      const result = compressor.compress("not-parseable", { filesOnly: true });
      expect(result.output).toContain("0 matches in 0 files");
    });
  });

  describe("budgets and stats", () => {
    it("truncates by maxLines", () => {
      const input = buildInput(Array.from({ length: 40 }, (_, i) => `src/a.ts:${i + 1}:line-${i + 1}`));
      const result = compressor.compress(input, { maxLines: 8, mergeDistance: 0 });
      expect(result.output).toContain("lines omitted");
      expect(result.output.split("\n").length).toBeLessThanOrEqual(8);
    });

    it("omits stats when maxLines too small", () => {
      const input = buildInput(["src/a.ts:1:a", "src/a.ts:2:b"]);
      const result = compressor.compress(input, { maxLines: 1, mergeDistance: 0 });
      expect(result.output).not.toContain("--- air:");
      expect((result.metadata as Record<string, unknown>).statsIncluded).toBe(false);
    });

    it("truncates by maxTokens", () => {
      const input = buildInput(
        Array.from({ length: 50 }, (_, i) => `src/a.ts:${i + 1}:const value${i} = "${"x".repeat(40)}";`)
      );
      const result = compressor.compress(input, { maxTokens: 120, mergeDistance: 0 });
      expect(result.output).toContain("lines omitted");
      expect(Math.ceil(result.output.length / 4)).toBeLessThan(350);
    });

    it("omits stats when maxTokens too small", () => {
      const input = buildInput(["src/a.ts:1:alpha"]);
      const result = compressor.compress(input, { maxTokens: 10 });
      expect(result.output).not.toContain("--- air:");
      expect((result.metadata as Record<string, unknown>).statsIncluded).toBe(false);
    });

    it("sets budgetExceeded=true when token budget cannot fit minimal output", () => {
      const input = buildInput([
        "src/a.ts:1:alpha",
        "src/a.ts:2:beta",
      ]);
      const result = compressor.compress(input, { maxTokens: 1 });
      expect((result.metadata as Record<string, unknown>).budgetExceeded).toBe(true);
    });

    it("sets budgetExceeded=false when within token budget", () => {
      const input = buildInput(["src/a.ts:1:alpha"]);
      const result = compressor.compress(input, { maxTokens: 1000 });
      expect((result.metadata as Record<string, unknown>).budgetExceeded).toBe(false);
    });

    it("includes stats footer with required format", () => {
      const input = buildInput(["src/a.ts:1:alpha", "src/b.ts:2:beta"]);
      const result = compressor.compress(input);
      expect(result.output).toMatch(/--- air: \d+ lines → \d+ lines \(\d+% saved\) ---/);
    });

    it("reports air-grep format and ratio", () => {
      const input = buildInput(["src/a.ts:1:alpha"]);
      const result = compressor.compress(input);
      expect(result.format).toBe("air-grep");
      expect(result.ratio).toBeGreaterThan(0);
      expect(Number.isFinite(result.ratio)).toBe(true);
    });

    it("never reports negative savedPercent", () => {
      const input = "a";
      const result = compressor.compress(input);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.savedPercent).toBeGreaterThanOrEqual(0);
      expect(result.output).toContain("(0% saved)");
    });
  });

  describe("edge scenarios", () => {
    it("handles empty input", () => {
      const result = compressor.compress("");
      expect(result.output).toContain("0 matches in 0 files");
      expect(result.originalSize).toBe(1);
      expect(result.format).toBe("air-grep");
    });

    it("handles single file with many matches", () => {
      const input = buildInput(Array.from({ length: 10 }, (_, i) => `src/a.ts:${i + 1}:line${i + 1}`));
      const result = compressor.compress(input, { mergeDistance: 0 });
      expect(result.output).toContain("10 matches in 1 file");
      expect(result.output).toContain("a.ts (10 matches):");
    });

    it("handles many files with one match each", () => {
      const input = buildInput(Array.from({ length: 15 }, (_, i) => `src/f${i + 1}.ts:1:x`));
      const result = compressor.compress(input);
      expect(result.output).toContain("15 matches in 15 files");
    });

    it("handles ripgrep and invalid lines mixed", () => {
      const input = buildInput([
        "src/a.ts:1:1:alpha",
        "garbage-line",
        "src/b.ts:2:2:beta",
      ]);
      const result = compressor.compress(input);
      expect(result.output).toContain("2 matches in 2 files");
      expect((result.metadata as Record<string, unknown>).ignoredLines).toBe(1);
    });

    it("exposes file truncation metadata", () => {
      const input = buildInput([
        "src/a.ts:1:a",
        "src/b.ts:1:b",
        "src/c.ts:1:c",
      ]);
      const result = compressor.compress(input, { maxFiles: 1 });
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.hiddenFiles).toBe(2);
      expect(meta.hiddenMatches).toBe(2);
    });

    it("normalizes CRLF input", () => {
      const input = "src/a.ts:1:alpha\r\nsrc/a.ts:2:beta\r\n";
      const result = compressor.compress(input, { mergeDistance: 0 });
      expect(result.output).not.toContain("\r");
      expect(result.output).toContain("  :1 alpha");
      expect(result.output).toContain("  :2 beta");
    });
  });

  describe("OpenCode format", () => {
    it("parses OC grep format with 'Found N matches' header", () => {
      const input = buildInput([
        "Found 3 matches",
        "/home/user/project/src/index.ts:",
        "  Line 10: function hello() {",
        "  Line 11:   return 'world';",
        "  Line 12: }",
      ]);
      const result = compressor.compress(input);
      expect(result.output).toContain("3 matches in 1 file");
      expect(result.output).toContain("src/index.ts (3 matches):");
      // Note: consecutive lines are merged into a block with 4-space indent
      expect(result.output).toContain(":10 function hello() {");
      expect(result.output).toContain(":11 return 'world';");
      expect(result.output).toContain(":12 }");
    });

    it("parses OC grep format with multiple files", () => {
      const input = buildInput([
        "Found 4 matches",
        "/home/user/project/src/a.ts:",
        "  Line 5: const a = 1;",
        "  Line 10: const b = 2;",
        "/home/user/project/src/b.ts:",
        "  Line 20: export const c = 3;",
        "  Line 30: export const d = 4;",
      ]);
      const result = compressor.compress(input);
      expect(result.output).toContain("4 matches in 2 files");
      expect(result.output).toContain("a.ts (2 matches):");
      expect(result.output).toContain("b.ts (2 matches):");
    });

    it("handles OC format with 'Found N matches in M files' header", () => {
      const input = buildInput([
        "Found 2 matches in 2 files",
        "/project/foo.ts:",
        "  Line 1: alpha",
        "/project/bar.ts:",
        "  Line 2: beta",
      ]);
      const result = compressor.compress(input);
      expect(result.output).toContain("2 matches in 2 files");
      expect(result.output).toContain("foo.ts (1 match):");
      expect(result.output).toContain("bar.ts (1 match):");
    });

    it("handles OC format with 'Found 0 matches'", () => {
      const input = buildInput(["Found 0 matches"]);
      const result = compressor.compress(input);
      expect(result.output).toContain("0 matches in 0 files");
    });

    it("handles OC format with 'Found 1 match' (singular)", () => {
      const input = buildInput([
        "Found 1 match",
        "/src/test.ts:",
        "  Line 42: const answer = 42;",
      ]);
      const result = compressor.compress(input);
      expect(result.output).toContain("1 match in 1 file");
      expect(result.output).toContain("test.ts (1 match):");
      expect(result.output).toContain("  :42 const answer = 42;");
    });

    it("handles OC format with empty lines between files", () => {
      const input = buildInput([
        "Found 2 matches",
        "",
        "/src/a.ts:",
        "  Line 1: first",
        "",
        "/src/b.ts:",
        "  Line 2: second",
        "",
      ]);
      const result = compressor.compress(input);
      expect(result.output).toContain("2 matches in 2 files");
    });

    it("handles OC format without 'Line ' prefix (just line number)", () => {
      const input = buildInput([
        "Found 2 matches",
        "/src/test.ts:",
        "  42: const x = 1;",
        "  43: const y = 2;",
      ]);
      const result = compressor.compress(input);
      expect(result.output).toContain("2 matches in 1 file");
      expect(result.output).toContain("  :42 const x = 1;");
      expect(result.output).toContain("  :43 const y = 2;");
    });
  });
});
