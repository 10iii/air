import { describe, it, expect } from "vitest";
import {
  BashCompressor,
  stripAnsiCodes,
  isErrorLine,
  isWarningLine,
  isNoiseLine,
} from "../compressors/bash.js";

// ============================================================
// Tests for exported utility functions
// ============================================================

describe("stripAnsiCodes", () => {
  it("should strip SGR color codes", () => {
    const input = "\x1b[31mERROR\x1b[0m: something failed";
    expect(stripAnsiCodes(input)).toBe("ERROR: something failed");
  });

  it("should strip bold/underline/dim codes", () => {
    const input = "\x1b[1mBold\x1b[22m \x1b[4mUnderline\x1b[24m \x1b[2mDim\x1b[22m";
    expect(stripAnsiCodes(input)).toBe("Bold Underline Dim");
  });

  it("should strip cursor movement sequences", () => {
    const input = "\x1b[2Ahello\x1b[5B";
    expect(stripAnsiCodes(input)).toBe("hello");
  });

  it("should remove carriage returns used for line overwriting", () => {
    const input = "Downloading...\rDownloading... 50%\rDownloading... 100%";
    const result = stripAnsiCodes(input);
    expect(result).not.toContain("\r");
  });

  it("should preserve \\r\\n line endings", () => {
    const input = "line1\r\nline2\r\n";
    expect(stripAnsiCodes(input)).toBe("line1\r\nline2\r\n");
  });

  it("should handle text with no ANSI codes", () => {
    const input = "plain text output";
    expect(stripAnsiCodes(input)).toBe("plain text output");
  });
});

describe("isErrorLine", () => {
  it("should detect 'error:' prefix", () => {
    expect(isErrorLine("error: something went wrong")).toBe(true);
  });

  it("should detect npm ERR!", () => {
    expect(isErrorLine("npm ERR! code ELIFECYCLE")).toBe(true);
  });

  it("should detect stack trace lines", () => {
    expect(isErrorLine("    at Object.<anonymous> (index.js:15:3)")).toBe(true);
  });

  it("should detect Python tracebacks", () => {
    expect(isErrorLine("Traceback (most recent call last)")).toBe(true);
  });

  it("should detect Python exception types", () => {
    expect(isErrorLine("TypeError: unsupported operand type")).toBe(true);
    expect(isErrorLine("ModuleNotFoundError: No module named 'foo'")).toBe(true);
  });

  it("should detect 'permission denied'", () => {
    expect(isErrorLine("bash: /usr/bin/foo: Permission denied")).toBe(true);
  });

  it("should detect 'command not found'", () => {
    expect(isErrorLine("bash: foo: command not found")).toBe(true);
  });

  it("should not flag normal output", () => {
    expect(isErrorLine("Successfully compiled 42 files")).toBe(false);
    expect(isErrorLine("const x = 1;")).toBe(false);
  });
});

describe("isWarningLine", () => {
  it("should detect 'warning:' prefix", () => {
    expect(isWarningLine("warning: unused variable 'x'")).toBe(true);
  });

  it("should detect npm WARN", () => {
    expect(isWarningLine("npm WARN deprecated foo@1.0.0")).toBe(true);
  });

  it("should detect 'deprecated' keyword", () => {
    expect(isWarningLine("This function is deprecated")).toBe(true);
  });

  it("should not flag normal output", () => {
    expect(isWarningLine("Build completed")).toBe(false);
  });
});

describe("isNoiseLine", () => {
  it("should detect progress bars with Unicode blocks", () => {
    expect(isNoiseLine("████████░░░░ 67%")).toBe(true);
  });

  it("should detect progress bars with # characters", () => {
    expect(isNoiseLine("######=====> 45%")).toBe(true);
  });

  it("should detect npm timing lines", () => {
    expect(isNoiseLine("npm timing idealTree Completed in 234ms")).toBe(true);
  });

  it("should detect download progress lines", () => {
    expect(isNoiseLine("Downloading package 45.2 MB / 100 MB")).toBe(true);
  });

  it("should detect fetch/GET lines", () => {
    expect(isNoiseLine("GET https://registry.npmjs.org/express")).toBe(true);
  });

  it("should not flag blank lines as noise", () => {
    expect(isNoiseLine("")).toBe(false);
    expect(isNoiseLine("   ")).toBe(false);
  });

  it("should not flag real output as noise", () => {
    expect(isNoiseLine("Build completed successfully")).toBe(false);
    expect(isNoiseLine("Running tests...")).toBe(false);
  });
});

// ============================================================
// Tests for BashCompressor
// ============================================================

describe("BashCompressor", () => {
  const compressor = new BashCompressor();

  // --- Test 1: ANSI stripping ---
  describe("ANSI code stripping", () => {
    it("should strip ANSI codes from output by default", () => {
      const input = [
        "\x1b[32m✓\x1b[0m Test passed",
        "\x1b[31m✗\x1b[0m Test failed",
        "\x1b[1mBold output\x1b[0m",
      ].join("\n");

      const result = compressor.compress(input);
      expect(result.output).toContain("✓ Test passed");
      expect(result.output).toContain("✗ Test failed");
      expect(result.output).toContain("Bold output");
      expect(result.output).not.toContain("\x1b[");
    });

    it("should preserve ANSI codes when stripAnsi=false", () => {
      const input = "\x1b[31mred text\x1b[0m";
      const result = compressor.compress(input, { stripAnsi: false });
      expect(result.output).toContain("\x1b[31m");
    });
  });

  // --- Test 2: Blank line collapsing ---
  describe("blank line collapsing", () => {
    it("should collapse consecutive blank lines into one", () => {
      const input = "line1\n\n\n\nline2\n\n\nline3";
      const result = compressor.compress(input);
      // No 3+ consecutive blank lines
      expect(result.output).not.toMatch(/\n\n\n/);
      expect(result.output).toContain("line1");
      expect(result.output).toContain("line2");
      expect(result.output).toContain("line3");
    });

    it("should not collapse blanks when collapseBlanks=false", () => {
      const input = "a\n\n\n\nb";
      const result = compressor.compress(input, { collapseBlanks: false });
      const contentBeforeStats = result.output.split("\n--- air:")[0];
      const blanks = contentBeforeStats.split("\n").filter((l) => l === "").length;
      expect(blanks).toBeGreaterThan(1);
    });
  });

  // --- Test 3: Repeated line detection ---
  describe("repeated line collapsing", () => {
    it("should collapse 3+ consecutive similar lines", () => {
      const lines = [];
      for (let i = 0; i < 10; i++) {
        lines.push(`Downloading package-${i}... 100%`);
      }
      lines.push("Done.");
      const input = lines.join("\n");

      const result = compressor.compress(input);
      expect(result.output).toContain("similar lines omitted");
      expect(result.compressedSize).toBeLessThan(result.originalSize);
    });

    it("should NOT collapse 2 or fewer similar lines", () => {
      const input = [
        "Installing package-a... done",
        "Installing package-b... done",
        "Build complete",
      ].join("\n");

      const result = compressor.compress(input, {
        filterNoise: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("Installing package-a... done");
      expect(result.output).toContain("Installing package-b... done");
      expect(result.output).not.toContain("omitted");
    });

    it("should detect structurally similar lines with different numbers", () => {
      const lines = [];
      for (let i = 0; i < 6; i++) {
        lines.push(`Step ${i + 1}: Processing file chunk ${i * 100}..${(i + 1) * 100}`);
      }
      const input = lines.join("\n");

      const result = compressor.compress(input);
      // Numbers are normalized, so these should be detected as similar
      expect(result.output).toContain("similar lines omitted");
    });
  });

  // --- Test 4: Noise filtering ---
  describe("noise filtering", () => {
    it("should filter progress bar lines", () => {
      const input = [
        "Starting build...",
        "████████░░░░ 67%",
        "████████████ 100%",
        "Build complete!",
      ].join("\n");

      const result = compressor.compress(input);
      expect(result.output).toContain("Starting build...");
      expect(result.output).toContain("Build complete!");
      expect(result.output).not.toContain("████████░░░░");
    });

    it("should filter npm timing/verbose lines", () => {
      const input = [
        "npm timing idealTree Completed in 234ms",
        "npm info lifecycle example@1.0.0~install",
        "npm timing buildIdealTree Completed in 1ms",
        "added 42 packages in 3.2s",
      ].join("\n");

      const result = compressor.compress(input);
      expect(result.output).toContain("added 42 packages");
      expect(result.output).not.toContain("npm timing idealTree");
    });

    it("should filter HTTP fetch/GET lines", () => {
      const input = [
        "GET https://registry.npmjs.org/express",
        "GET https://registry.npmjs.org/lodash",
        "GET https://registry.npmjs.org/axios",
        "GET https://registry.npmjs.org/react",
        "npm info ok",
      ].join("\n");

      const result = compressor.compress(input);
      expect(result.output).not.toContain("GET https://");
    });

    it("should not filter when filterNoise=false", () => {
      const input = "npm timing idealTree Completed in 234ms\nDone.";
      const result = compressor.compress(input, { filterNoise: false });
      expect(result.output).toContain("npm timing idealTree");
    });

    it("should add hint for large blocks of filtered noise", () => {
      const lines = ["Starting..."];
      for (let i = 0; i < 10; i++) {
        lines.push(`GET https://registry.npmjs.org/pkg-${i}`);
      }
      lines.push("Complete.");
      const input = lines.join("\n");

      const result = compressor.compress(input);
      expect(result.output).toContain("progress/noise lines filtered");
    });
  });

  // --- Test 5: Error/warning prioritization ---
  describe("error/warning detection in output", () => {
    it("should report error count in metadata", () => {
      const input = [
        "Compiling...",
        "error: cannot find module 'foo'",
        "error: type mismatch",
        "  at Object.<anonymous> (index.js:15:3)",
        "Build failed",
      ].join("\n");

      const result = compressor.compress(input);
      expect(result.metadata).toBeDefined();
      expect((result.metadata as Record<string, unknown>).errorCount).toBeGreaterThanOrEqual(2);
    });

    it("should report warning count in metadata", () => {
      const input = [
        "Compiling...",
        "warning: unused import 'os'",
        "npm WARN deprecated foo@1.0.0",
        "Build succeeded with warnings",
      ].join("\n");

      const result = compressor.compress(input);
      expect(result.metadata).toBeDefined();
      expect((result.metadata as Record<string, unknown>).warningCount).toBeGreaterThanOrEqual(2);
    });

    it("should report noise removal count in metadata", () => {
      const lines = [];
      for (let i = 0; i < 5; i++) {
        lines.push(`GET https://registry.npmjs.org/pkg-${i}`);
      }
      lines.push("Done.");
      const input = lines.join("\n");

      const result = compressor.compress(input);
      expect(result.metadata).toBeDefined();
      expect((result.metadata as Record<string, unknown>).noiseRemoved).toBeGreaterThan(0);
    });
  });

  // --- Test 6: Smart truncation by lines ---
  describe("smart truncation by lines", () => {
    it("should truncate when exceeding maxLines", () => {
      const lines: string[] = [];
      for (let i = 0; i < 100; i++) {
        lines.push(`output line ${i + 1}`);
      }
      const input = lines.join("\n");

      const result = compressor.compress(input, { maxLines: 20 });
      expect(result.output).toContain("output line 1");
      expect(result.output).toContain("output line 100");
      expect(result.output).toContain("lines omitted");
    });

    it("should not truncate content under maxLines", () => {
      const input = "Starting build\nRunning tests\nDeploy complete";
      const result = compressor.compress(input, { maxLines: 50 });
      expect(result.output).not.toContain("omitted");
    });

    it("should prioritize error sections during truncation", () => {
      const lines: string[] = [];
      for (let i = 0; i < 50; i++) lines.push(`normal output ${i}`);
      lines.push("error: compilation failed");
      lines.push("  at main.ts:42:10");
      lines.push("TypeError: cannot read property 'x' of undefined");
      for (let i = 0; i < 50; i++) lines.push(`more normal output ${i}`);
      const input = lines.join("\n");

      const result = compressor.compress(input, { maxLines: 20 });
      // Error lines should be preserved even with aggressive truncation
      expect(result.output).toContain("error: compilation failed");
    });

    it("should keep output within maxLines when preserving error context", () => {
      const lines: string[] = [];
      for (let i = 0; i < 30; i++) lines.push(`head ${i}`);
      lines.push("error: critical failure");
      lines.push("  at build.ts:42:1");
      lines.push("TypeError: boom");
      for (let i = 0; i < 30; i++) lines.push(`tail ${i}`);

      const result = compressor.compress(lines.join("\n"), { maxLines: 12 });
      const content = result.output.split("\n--- air:")[0];

      expect(content.split("\n").length).toBeLessThanOrEqual(12);
      expect(result.output).toContain("error: critical failure");
    });

    it("should enforce maxLines on final output including stats line", () => {
      const input = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
      const result = compressor.compress(input, {
        maxLines: 5,
        collapseRepeats: false,
        filterNoise: false,
        collapseBlanks: false,
      });

      expect(result.output.split("\n").length).toBeLessThanOrEqual(5);
      expect(result.output).toContain("--- air:");
      expect((result.metadata as Record<string, unknown>).statsIncluded).toBe(true);
    });

    it("should omit stats line when maxLines is too small", () => {
      const input = "a\nb\nc\nd";
      const result = compressor.compress(input, {
        maxLines: 1,
        collapseRepeats: false,
        filterNoise: false,
        collapseBlanks: false,
      });

      expect(result.output.split("\n").length).toBeLessThanOrEqual(1);
      expect(result.output).not.toContain("--- air:");
      expect((result.metadata as Record<string, unknown>).statsIncluded).toBe(false);
    });
  });

  // --- Test 7: Smart truncation by tokens ---
  describe("smart truncation by tokens", () => {
    it("should truncate when exceeding maxTokens", () => {
      const lines: string[] = [];
      for (let i = 0; i < 200; i++) {
        lines.push(`const variable${i} = "some value for variable number ${i}";`);
      }
      const input = lines.join("\n");

      const result = compressor.compress(input, { maxTokens: 200 });
      expect(result.output).toContain("lines omitted");
      const approxTokens = Math.ceil(result.output.length / 4);
      expect(approxTokens).toBeLessThan(500); // generous buffer
    });
  });

  // --- Test 8: Statistics output ---
  describe("statistics output", () => {
    it("should include stats footer with correct format", () => {
      const input = "Starting build\nRunning tests\nDeploy complete";
      const result = compressor.compress(input);
      expect(result.output).toMatch(
        /--- air: \d+ lines → \d+ lines \(\d+% saved\) ---/
      );
    });

    it("should report correct format as air-bash", () => {
      const input = "hello world";
      const result = compressor.compress(input);
      expect(result.format).toBe("air-bash");
    });

    it("should include command hint in metadata when provided", () => {
      const input = "packages installed";
      const result = compressor.compress(input, { command: "npm install" });
      expect(result.metadata).toBeDefined();
      expect((result.metadata as Record<string, unknown>).command).toBe("npm install");
    });
  });

  // --- Test 9: Edge cases ---
  describe("edge cases", () => {
    it("should handle empty input", () => {
      const result = compressor.compress("");
      expect(result.output).toContain("--- air:");
      expect(result.originalSize).toBe(1); // single empty line
    });

    it("should handle single line input", () => {
      const result = compressor.compress("Build succeeded.");
      expect(result.output).toContain("Build succeeded.");
      expect(result.output).toContain("--- air:");
    });

    it("should handle input with only blank lines", () => {
      const result = compressor.compress("\n\n\n\n\n");
      const contentBeforeStats = result.output.split("\n--- air:")[0];
      const blankLines = contentBeforeStats.split("\n").filter((l) => l.trim() === "").length;
      expect(blankLines).toBeLessThanOrEqual(2);
    });

    it("should handle input with only errors", () => {
      const input = [
        "error: foo",
        "error: bar",
        "error: baz",
      ].join("\n");

      const result = compressor.compress(input);
      expect(result.output).toContain("error: foo");
      expect(result.output).toContain("error: bar");
      expect(result.output).toContain("error: baz");
      expect((result.metadata as Record<string, unknown>).errorCount).toBe(3);
    });

    it("should handle very long single line", () => {
      const longLine = "x".repeat(10000);
      const result = compressor.compress(longLine);
      expect(result.output).toContain(longLine);
    });

    it("should handle mixed ANSI + errors + noise", () => {
      const input = [
        "\x1b[32m✓\x1b[0m Compiling...",
        "GET https://registry.npmjs.org/foo",
        "\x1b[31merror:\x1b[0m module not found",
        "████████░░░░ 67%",
        "\x1b[33mwarning:\x1b[0m unused import",
        "Build complete",
      ].join("\n");

      const result = compressor.compress(input);
      // ANSI stripped
      expect(result.output).not.toContain("\x1b[");
      // Noise filtered
      expect(result.output).not.toContain("████████░░░░");
      // Errors preserved
      expect(result.output).toContain("error:");
      // Content preserved
      expect(result.output).toContain("Compiling...");
      expect(result.output).toContain("Build complete");
    });

    it("should ignore non-positive maxLines", () => {
      const input = "line 1\nline 2\nline 3";
      const result = compressor.compress(input, { maxLines: 0 });

      expect(result.output).not.toMatch(/\.\.\. \(\d+ lines omitted\) \.\.\./);
      expect(result.output).toContain("line 3");
    });
  });

  // --- Test 10: Option toggling ---
  describe("option toggling", () => {
    it("should disable all compression when all options are false", () => {
      const input = [
        "line 1",
        "",
        "",
        "",
        "line 2",
        "GET https://example.com",
        "\x1b[31mred\x1b[0m",
      ].join("\n");

      const result = compressor.compress(input, {
        stripAnsi: false,
        collapseBlanks: false,
        collapseRepeats: false,
        filterNoise: false,
      });
      // Should preserve multiple blanks
      const contentBeforeStats = result.output.split("\n--- air:")[0];
      expect(contentBeforeStats.split("\n").filter((l) => l === "").length).toBe(3);
      // Should preserve ANSI
      expect(result.output).toContain("\x1b[31m");
      // Should preserve noise
      expect(result.output).toContain("GET https://example.com");
    });
  });

  // --- Test 11: Combined compression (realistic scenario) ---
  describe("combined compression — realistic npm install output", () => {
    it("should effectively compress realistic npm install output", () => {
      const input = [
        "\x1b[2K\x1b[1A\x1b[2K\x1b[G",
        "npm timing idealTree Completed in 4523ms",
        "npm timing buildIdealTree Completed in 1ms",
        "npm info lifecycle example@1.0.0~install",
        "GET https://registry.npmjs.org/express",
        "GET https://registry.npmjs.org/lodash",
        "GET https://registry.npmjs.org/axios",
        "GET https://registry.npmjs.org/react",
        "GET https://registry.npmjs.org/webpack",
        "",
        "",
        "",
        "\x1b[32madded 1542 packages in 12.3s\x1b[0m",
        "",
        "\x1b[33mnpm WARN deprecated foo@1.0.0: Use bar instead\x1b[0m",
        "",
        "85 packages are looking for funding",
        "  run `npm fund` for details",
      ].join("\n");

      const result = compressor.compress(input);

      // Should strip ANSI
      expect(result.output).not.toContain("\x1b[");
      // Should filter noise (timing, GET)
      expect(result.output).not.toContain("npm timing");
      expect(result.output).not.toContain("GET https://");
      // Should collapse blanks
      expect(result.output).not.toMatch(/\n\n\n/);
      // Should keep important info
      expect(result.output).toContain("added 1542 packages in 12.3s");
      expect(result.output).toContain("npm fund");
      // Should report meaningful compression
      expect(result.compressedSize).toBeLessThan(result.originalSize);
      // Stats footer present
      expect(result.output).toMatch(/--- air: \d+ lines → \d+ lines \(\d+% saved\) ---/);
    });
  });

  // --- Test 12: Build failure output ---
  describe("combined compression — build failure output", () => {
    it("should preserve error details while compressing noise", () => {
      const input = [
        "\x1b[1m\x1b[36mCompiling project...\x1b[0m",
        "████████░░░░ 67%",
        "████████████ 100%",
        "",
        "",
        "\x1b[31merror\x1b[0m[E0308]: mismatched types",
        "  --> src/main.rs:42:10",
        "   |",
        "42 |     let x: i32 = \"hello\";",
        "   |            ^^^   ^^^^^^^ expected `i32`, found `&str`",
        "",
        "\x1b[31merror\x1b[0m: aborting due to previous error",
        "",
        "\x1b[31mBuild failed\x1b[0m",
      ].join("\n");

      const result = compressor.compress(input);

      // ANSI stripped
      expect(result.output).not.toContain("\x1b[");
      // Noise removed
      expect(result.output).not.toContain("████");
      // Error details preserved
      expect(result.output).toContain("error");
      expect(result.output).toContain("mismatched types");
      expect(result.output).toContain("Build failed");
      // Error count tracked
      expect((result.metadata as Record<string, unknown>).errorCount).toBeGreaterThanOrEqual(2);
    });
  });
});

// ============================================================
// Tests for code review bug fixes
// ============================================================

describe("Code Review Bug Fixes", () => {
  const compressor = new BashCompressor();

  // CR-04: ReDoS-safe ANSI stripping for OSC sequences
  describe("CR-04: ANSI regex ReDoS safety", () => {
    it("should strip OSC sequences safely without ReDoS", () => {
      // OSC sequence: ESC ] followed by text then BEL
      const input = "\x1b]0;My Terminal Title\x07Normal text";
      const result = stripAnsiCodes(input);
      expect(result).toBe("Normal text");
    });

    it("should handle unterminated OSC sequence without hanging", () => {
      // This is the ReDoS vector: \x1b] followed by many chars with no terminator
      const longInput = "\x1b]" + "A".repeat(1000) + "Normal text";
      const start = Date.now();
      const result = stripAnsiCodes(longInput);
      const elapsed = Date.now() - start;
      // Should complete quickly (< 100ms), not backtrack
      expect(elapsed).toBeLessThan(100);
      // The unterminated sequence won't be stripped (no terminator found),
      // but the function should not hang
      expect(typeof result).toBe("string");
    });
  });

  // CR-09: Hex hash replacement order
  describe("CR-09: hex hash normalization order", () => {
    it("should correctly normalize hex hashes like a1b2c3d4", () => {
      const input = [
        "Compiled: a1b2c3d4e5f6",
        "Compiled: f6e5d4c3b2a1",
        "Compiled: 1a2b3c4d5e6f",
        "Done.",
      ].join("\n");

      const result = compressor.compress(input);
      // Hex hashes should be normalized to H, making lines similar
      // and collapsible
      expect(result.output).toContain("similar lines omitted");
    });
  });

  // CR-10: CRLF normalization in bash compressor
  describe("CR-10: CRLF handling in bash output", () => {
    it("should handle CRLF line endings", () => {
      const input = "Starting\r\nBuild complete\r\nDeploy done\r\n";
      const result = compressor.compress(input, { collapseRepeats: false });
      expect(result.output).not.toContain("\r");
      expect(result.output).toContain("Starting");
      expect(result.output).toContain("Build complete");
      expect(result.output).toContain("Deploy done");
    });
  });
});


// ============================================================
// Tests for R2 code review bug fixes
// ============================================================

describe("R2 Code Review Bug Fixes", () => {
  const compressor = new BashCompressor();

  // R2-01: smartTruncateByTokens critical bestMaxLines default
  describe("R2-01: smartTruncateByTokens returns valid output", () => {
    it("should produce non-empty output when all lines exceed maxTokens", () => {
      // Edge case: many long lines where even sqrt-step search first lands at 0
      const lines: string[] = [];
      for (let i = 0; i < 50; i++) {
        lines.push(`const variable${i} = "${'x'.repeat(200)}";`);
      }
      const input = lines.join("\n");

      // Very small token budget — forces truncation
      const result = compressor.compress(input, { maxTokens: 30 });
      // Must produce output (not crash or return empty)
      expect(result.output.length).toBeGreaterThan(0);
      expect(result.output).toContain("--- air:");
    });

    it("should respect maxTokens budget approximately", () => {
      const lines: string[] = [];
      for (let i = 0; i < 100; i++) {
        lines.push(`output line ${i}: some content here`);
      }
      const input = lines.join("\n");
      const result = compressor.compress(input, { maxTokens: 100 });

      // Rough token estimate: output chars / 4 should be near budget
      const outputChars = result.output.length;
      const approxTokens = Math.ceil(outputChars / 4);
      expect(approxTokens).toBeLessThan(300); // generous but bounded
    });
  });

  // R2-02: Footer should not breach maxLines/maxTokens budget
  describe("R2-02: footer stays within budget", () => {
    it("should stay within maxLines including stats footer", () => {
      const lines: string[] = [];
      for (let i = 0; i < 50; i++) {
        lines.push(`line ${i}`);
      }
      const input = lines.join("\n");
      const result = compressor.compress(input, { maxLines: 10 });
      const totalOutputLines = result.output.split("\n").length;
      // maxLines=10 + 1 for stats footer = 11 maximum
      expect(totalOutputLines).toBeLessThanOrEqual(11);
    });
  });

  // R2-05: require() regex should not match bare require() in function bodies
  // (This is in read compressor / file parser, but we can test import detection indirectly)

  // R2-06: ANSI regex should strip CSI private mode sequences
  describe("R2-06: CSI private mode sequences", () => {
    it("should strip cursor hide/show sequences", () => {
      const input = "\x1b[?25lHello\x1b[?25h";
      const result = stripAnsiCodes(input);
      expect(result).toBe("Hello");
    });

    it("should strip alternate screen buffer sequences", () => {
      const input = "\x1b[?1049hContent\x1b[?1049l";
      const result = stripAnsiCodes(input);
      expect(result).toBe("Content");
    });

    it("should strip private mode with multiple params", () => {
      const input = "\x1b[?25;12lVisible text";
      const result = stripAnsiCodes(input);
      expect(result).toBe("Visible text");
    });
  });

  // R2-02 + R2-01 combined: budgetExceeded metadata field
  describe("R2 metadata: budgetExceeded flag", () => {
    it("should set budgetExceeded=false when within budget", () => {
      const input = "short output";
      const result = compressor.compress(input, { maxTokens: 1000 });
      expect((result.metadata as Record<string, unknown>).budgetExceeded).toBe(false);
    });

    it("should set budgetExceeded=true when even minimal output exceeds budget", () => {
      // A single very long line that exceeds even maxTokens=1
      const input = "x".repeat(100);
      const result = compressor.compress(input, { maxTokens: 1 });
      expect((result.metadata as Record<string, unknown>).budgetExceeded).toBe(true);
    });
  });
});
