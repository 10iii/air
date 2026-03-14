import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const CLI = join(process.cwd(), "packages/cli/dist/cli.js");
const ROOT = process.cwd();

function run(args: string[], opts: { input?: string; expectFail?: boolean } = {}) {
  try {
    const result = execFileSync(
      process.execPath,
      [CLI, ...args],
      {
        encoding: "utf-8",
        cwd: ROOT,
        input: opts.input,
        stdio: opts.input !== undefined ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
        timeout: 15_000,
      }
    );
    return { stdout: result, stderr: "", exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    if (!opts.expectFail) throw err;
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: e.status ?? 1,
    };
  }
}

// ============================================================
// Shared fixtures
// ============================================================

let tmpDir: string;
let sampleTS: string;
let samplePY: string;
let sampleJSON: string;
let largeSample: string;

beforeAll(() => {
  tmpDir = join(tmpdir(), `air-e2e-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  // TypeScript sample with imports, comments, code
  sampleTS = join(tmpDir, "sample.ts");
  writeFileSync(
    sampleTS,
    [
      "import { foo } from 'foo';",
      "import { bar } from 'bar';",
      "import { baz } from 'baz';",
      "import { qux } from 'qux';",
      "import { quux } from 'quux';",
      "",
      "/**",
      " * A function that does something.",
      " * It has a long JSDoc comment.",
      " * With many lines.",
      " * And more details.",
      " */",
      "export function doSomething(): void {",
      "  // step 1",
      "  // step 2",
      "  // step 3",
      "  // step 4",
      "  console.log('hello');",
      "}",
      "",
      "export function doAnother(): number {",
      "  return 42;",
      "}",
      "",
    ].join("\n")
  );

  // Python sample
  samplePY = join(tmpDir, "sample.py");
  writeFileSync(
    samplePY,
    [
      "import os",
      "import sys",
      "import json",
      "import pathlib",
      "from typing import Dict",
      "",
      '"""',
      "Module docstring with details.",
      "Spanning multiple lines.",
      "With examples and notes.",
      '"""',
      "",
      "# Configuration section",
      "# defines defaults",
      "# for the application",
      "# behavior settings",
      "DEFAULT_VALUE = 42",
      "",
      "def main():",
      "    pass",
      "",
    ].join("\n")
  );

  // JSON sample
  sampleJSON = join(tmpDir, "sample.json");
  writeFileSync(
    sampleJSON,
    JSON.stringify({ name: "test", version: "1.0.0", scripts: { build: "tsc" } }, null, 2)
  );

  // Large file for truncation tests
  largeSample = join(tmpDir, "large.ts");
  const largeLines = Array.from({ length: 200 }, (_, i) => `const x${i} = ${i};`);
  writeFileSync(largeSample, largeLines.join("\n"));
});

afterAll(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

// ============================================================
// 1. air read <file> — file path reading
// ============================================================

describe("air read <file>", () => {
  it("should compress a TypeScript file", () => {
    const { stdout } = run(["read", sampleTS]);
    expect(stdout).toMatch(/--- air: \d+ lines → \d+ lines \(\d+% saved\) ---/);
    expect(stdout).toContain("export function doSomething(): void {");
    // Imports collapsed (5 → first + hint + last)
    expect(stdout).toContain("// ... (3 more imports)");
  });

  it("should compress a Python file with docstrings and comments", () => {
    const { stdout } = run(["read", samplePY]);
    expect(stdout).toMatch(/--- air: \d+ lines → \d+ lines/);
    expect(stdout).toContain("# ... (3 more imports)");
    expect(stdout).toMatch(/\.\.\. \(\d+ more docstring lines\)/);
  });

  it("should handle JSON files (no compression expected)", () => {
    const { stdout } = run(["read", sampleJSON]);
    expect(stdout).toMatch(/--- air:/);
    expect(stdout).toContain('"name"');
  });

  it("should read a real project file", () => {
    const realFile = join(ROOT, "package.json");
    const { stdout } = run(["read", realFile]);
    expect(stdout).toContain("air-monorepo");
    expect(stdout).toMatch(/--- air:/);
  });
});

// ============================================================
// 2. air read - (stdin mode)
// ============================================================

describe("air read - (stdin)", () => {
  it("should read from stdin when file is -", () => {
    const input = "line 1\nline 2\nline 3\n";
    const { stdout } = run(["read", "-"], { input });
    expect(stdout).toContain("line 1");
    expect(stdout).toContain("line 2");
    expect(stdout).toContain("line 3");
    expect(stdout).toMatch(/--- air: \d+ lines/);
  });

  it("should handle multi-line code via stdin", () => {
    const input = [
      "import { a } from 'a';",
      "import { b } from 'b';",
      "import { c } from 'c';",
      "import { d } from 'd';",
      "import { e } from 'e';",
      "",
      "const x = 1;",
    ].join("\n");
    const { stdout } = run(["read", "-"], { input });
    expect(stdout).toMatch(/--- air:/);
  });
});

// ============================================================
// 3. air read --line-numbers
// ============================================================

describe("air read --line-numbers", () => {
  it("should output with line number prefixes", () => {
    const { stdout } = run(["read", "--line-numbers", sampleTS]);
    // Should have "N: content" format
    expect(stdout).toMatch(/^\d+: /m);
    // First line should be "1: import..."
    const firstContentLine = stdout.split("\n")[0];
    expect(firstContentLine).toMatch(/^1: /);
  });

  it("should still include stats footer", () => {
    const { stdout } = run(["read", "--line-numbers", sampleTS]);
    expect(stdout).toMatch(/--- air:/);
  });
});

// ============================================================
// 4. air read --max-lines
// ============================================================

describe("air read --max-lines", () => {
  it("should truncate to 10 lines", () => {
    const { stdout } = run(["read", "--max-lines", "10", largeSample]);
    const lines = stdout.trim().split("\n");
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(stdout).toMatch(/\.\.\. \(\d+ lines omitted\) \.\.\./);
  });

  it("should truncate to 5 lines", () => {
    const { stdout } = run(["read", "--max-lines", "5", largeSample]);
    const lines = stdout.trim().split("\n");
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it("should handle max-lines=1", () => {
    const { stdout } = run(["read", "--max-lines", "1", largeSample]);
    const lines = stdout.trim().split("\n");
    expect(lines.length).toBeLessThanOrEqual(1);
  });

  it("should not truncate when content fits within limit", () => {
    const { stdout } = run(["read", "--max-lines", "500", sampleTS]);
    expect(stdout).not.toContain("lines omitted");
  });
});

// ============================================================
// 5. Error handling
// ============================================================

describe("error handling", () => {
  it("should error for nonexistent file", () => {
    const { stderr, exitCode } = run(
      ["read", "nonexistent_file_abc123.ts"],
      { expectFail: true }
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/error|not found/i);
  });

  it("should error for directory path", () => {
    const { stderr, exitCode } = run(
      ["read", tmpDir],
      { expectFail: true }
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/directory/i);
  });

  it("should reject invalid --max-lines value", () => {
    const { stderr, exitCode } = run(
      ["read", "--max-lines", "abc", sampleTS],
      { expectFail: true }
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/positive integer/i);
  });

  it("should reject invalid --max-tokens value", () => {
    const { stderr, exitCode } = run(
      ["read", "--max-tokens", "xyz", sampleTS],
      { expectFail: true }
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/positive integer/i);
  });
});

// ============================================================
// 6. air bash (stdin mode)
// ============================================================

describe("air bash (stdin)", () => {
  it("should compress repeated lines in piped output", () => {
    const input = [
      "added 1 package in 2s",
      "added 1 package in 1s",
      "added 1 package in 3s",
      "added 1 package in 2s",
      "added 1 package in 1s",
      "",
      "done",
    ].join("\n");
    const { stdout } = run(["bash"], { input });
    expect(stdout).toMatch(/--- air: \d+ lines → \d+ lines/);
    expect(stdout).toMatch(/similar lines omitted/);
  });

  it("should preserve error lines in output", () => {
    const input = [
      "Building project...",
      "Compiling src/index.ts",
      "error: Cannot find module 'missing'",
      "Build failed",
    ].join("\n");
    const { stdout } = run(["bash"], { input });
    expect(stdout).toContain("error: Cannot find module 'missing'");
  });

  it("should strip ANSI codes by default", () => {
    const input = "\x1b[31merror\x1b[0m: something failed\nnormal line\n";
    const { stdout } = run(["bash"], { input });
    expect(stdout).not.toContain("\x1b[");
    expect(stdout).toContain("error");
  });

  it("should handle empty input", () => {
    const { stdout } = run(["bash"], { input: "" });
    expect(stdout).toMatch(/--- air:/);
  });
});

// ============================================================
// 7. air --help
// ============================================================

describe("air --help", () => {
  it("should display help text with commands", () => {
    const { stdout } = run(["--help"]);
    expect(stdout).toMatch(/air/i);
    expect(stdout).toMatch(/read/i);
    expect(stdout).toMatch(/bash/i);
    expect(stdout).toMatch(/web/i);
  });

  it("should display read subcommand help", () => {
    const { stdout } = run(["read", "--help"]);
    expect(stdout).toContain("--line-numbers");
    expect(stdout).toContain("--max-lines");
    expect(stdout).toContain("--max-tokens");
    expect(stdout).toContain("--no-collapse-comments");
  });

  it("should display bash subcommand help", () => {
    const { stdout } = run(["bash", "--help"]);
    expect(stdout).toContain("--max-lines");
    expect(stdout).toContain("--no-strip-ansi");
    expect(stdout).toContain("--no-collapse-repeats");
    expect(stdout).toContain("--no-filter-noise");
  });

  it("should display web subcommand help", () => {
    const { stdout } = run(["web", "--help"]);
    expect(stdout).toContain("--url");
    expect(stdout).toContain("--max-lines");
    expect(stdout).toContain("--max-tokens");
    expect(stdout).toContain("--format");
    expect(stdout).toContain("--code-only");
    expect(stdout).toContain("--score");
  });
});

// ============================================================
// 8. air --version
// ============================================================

describe("air --version", () => {
  it("should display version number", () => {
    const { stdout } = run(["--version"]);
    expect(stdout.trim()).toBe("0.1.0");
  });
});

// ============================================================
// 9. Option combinations & edge cases
// ============================================================

describe("option combinations", () => {
  it("--no-collapse-comments should keep all comments", () => {
    const { stdout } = run(["read", "--no-collapse-comments", sampleTS]);
    // Block comments should NOT be collapsed
    expect(stdout).toContain("* A function that does something.");
    expect(stdout).toContain("* With many lines.");
    // But imports should still be collapsed
    expect(stdout).toContain("// ... (3 more imports)");
  });

  it("--no-collapse-imports should keep all imports", () => {
    const { stdout } = run(["read", "--no-collapse-imports", sampleTS]);
    expect(stdout).toContain("import { foo } from 'foo';");
    expect(stdout).toContain("import { bar } from 'bar';");
    expect(stdout).toContain("import { baz } from 'baz';");
    expect(stdout).toContain("import { qux } from 'qux';");
    expect(stdout).toContain("import { quux } from 'quux';");
  });

  it("--no-collapse-blanks should preserve blank lines", () => {
    const input = "a\n\n\n\nb\n";
    const { stdout } = run(["read", "--no-collapse-blanks", "-"], { input });
    // Multiple blank lines should be preserved
    const contentBeforeStats = stdout.split("--- air:")[0];
    const blankCount = contentBeforeStats.split("\n").filter((l) => l === "").length;
    expect(blankCount).toBeGreaterThan(1);
  });

  it("--line-numbers + --max-lines combined", () => {
    const { stdout } = run(["read", "--line-numbers", "--max-lines", "10", largeSample]);
    const lines = stdout.trim().split("\n");
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(stdout).toMatch(/^\d+: /m);
  });

  it("bash --no-collapse-repeats should keep repeated lines", () => {
    const input = [
      "added 1 package in 2s",
      "added 1 package in 1s",
      "added 1 package in 3s",
      "added 1 package in 2s",
      "added 1 package in 1s",
    ].join("\n");
    const { stdout } = run(["bash", "--no-collapse-repeats"], { input });
    expect(stdout).not.toContain("similar lines omitted");
  });
});

describe("air web (stdin)", () => {
  it("should extract article content from piped HTML", () => {
    const input = `
      <html><body>
        <nav>menu links</nav>
        <article>
          <h1>CLI Web Title</h1>
          <p>Main CLI web content paragraph.</p>
        </article>
        <footer>footer area</footer>
      </body></html>`;
    const { stdout } = run(["web"], { input });
    expect(stdout).toContain("CLI Web Title");
    expect(stdout).toContain("Main CLI web content");
    expect(stdout).not.toContain("menu links");
    expect(stdout).toMatch(/--- air: \d+ chars → \d+ chars/);
  });

  it("should support --format text", () => {
    const input = "<html><body><article><h1>Text Format</h1><p>Paragraph body.</p></article></body></html>";
    const { stdout } = run(["web", "--format", "text"], { input });
    expect(stdout).toContain("Text Format");
    expect(stdout).toContain("Paragraph body.");
    expect(stdout).not.toContain("# Text Format");
  });

  it("should support --code-only", () => {
    const input = "<html><body><article><p>desc</p><pre><code>echo cli</code></pre></article></body></html>";
    const { stdout } = run(["web", "--code-only"], { input });
    expect(stdout).toContain("echo cli");
    expect(stdout).toContain("```");
    expect(stdout).not.toContain("desc");
  });

  it("should support --score", () => {
    const input = "<html><body><article><h2>Score</h2><p>Density line check.</p></article></body></html>";
    const { stdout } = run(["web", "--score"], { input });
    expect(stdout).toContain("--- score:");
  });

  it("should support max-lines truncation", () => {
    const body = Array.from({ length: 80 }, (_, i) => `<p>line ${i}</p>`).join("");
    const input = `<html><body><article>${body}</article></body></html>`;
    const { stdout } = run(["web", "--format", "text", "--max-lines", "8"], { input });
    expect(stdout.trim().split("\n").length).toBeLessThanOrEqual(8);
  });

  it("should support max-tokens truncation", () => {
    const body = Array.from({ length: 120 }, (_, i) => `<p>tokenized content ${i} repeated words repeated words repeated words</p>`).join("");
    const input = `<html><body><article>${body}</article></body></html>`;
    const { stdout } = run(["web", "--format", "text", "--max-tokens", "80"], { input });
    expect(stdout.length).toBeGreaterThan(0);
  });

  it("should reject invalid format", () => {
    const input = "<html><body><article><p>x</p></article></body></html>";
    const { stderr, exitCode } = run(["web", "--format", "xml"], { input, expectFail: true });
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/format must be either/i);
  });

  it("should reject invalid --max-lines", () => {
    const input = "<html><body><article><p>x</p></article></body></html>";
    const { stderr, exitCode } = run(["web", "--max-lines", "bad"], { input, expectFail: true });
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/positive integer/i);
  });

  it("should reject invalid --max-tokens", () => {
    const input = "<html><body><article><p>x</p></article></body></html>";
    const { stderr, exitCode } = run(["web", "--max-tokens", "0"], { input, expectFail: true });
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/positive integer/i);
  });
});
