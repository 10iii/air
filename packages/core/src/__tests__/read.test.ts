import { describe, it, expect } from "vitest";
import { ReadCompressor } from "../compressors/read.js";
import { detectLanguage, isLineComment, isImportLine } from "../parsers/file.js";

// ============================================================
// Tests for file type detection (parsers/file.ts)
// ============================================================

describe("detectLanguage", () => {
  it("should detect TypeScript from .ts extension", () => {
    const lang = detectLanguage("src/index.ts");
    expect(lang.language).toBe("typescript");
    expect(lang.lineComment).toContain("//");
  });

  it("should detect Python from .py extension", () => {
    const lang = detectLanguage("script.py");
    expect(lang.language).toBe("python");
    expect(lang.lineComment).toContain("#");
    expect(lang.docString).toBeDefined();
  });

  it("should detect Go from .go extension", () => {
    const lang = detectLanguage("main.go");
    expect(lang.language).toBe("go");
  });

  it("should detect Rust from .rs extension", () => {
    const lang = detectLanguage("lib.rs");
    expect(lang.language).toBe("rust");
  });

  it("should detect shell from .sh extension", () => {
    const lang = detectLanguage("run.sh");
    expect(lang.language).toBe("shell");
    expect(lang.lineComment).toContain("#");
  });

  it("should detect markdown from .md extension", () => {
    const lang = detectLanguage("README.md");
    expect(lang.language).toBe("markdown");
    expect(lang.blockComment.length).toBeGreaterThan(0);
  });

  it("should return unknown for unrecognized extensions", () => {
    const lang = detectLanguage("data.xyz");
    expect(lang.language).toBe("unknown");
  });

  it("should detect Makefile as shell (extensionless file detection)", () => {
    const lang = detectLanguage("Makefile");
    expect(lang.language).toBe("shell");
  });

  it("should detect Makefile as shell", () => {
    const lang = detectLanguage("Makefile");
    expect(lang.language).toBe("shell");
  });

  it("should detect C++ from .cpp extension", () => {
    const lang = detectLanguage("main.cpp");
    expect(lang.language).toBe("cpp");
  });

  it("should detect Java from .java extension", () => {
    const lang = detectLanguage("App.java");
    expect(lang.language).toBe("java");
  });

  it("should detect Ruby from .rb extension", () => {
    const lang = detectLanguage("app.rb");
    expect(lang.language).toBe("ruby");
  });

  it("should detect JSON from .json extension", () => {
    const lang = detectLanguage("package.json");
    expect(lang.language).toBe("json");
  });

  it("should detect YAML from .yml and .yaml", () => {
    expect(detectLanguage("config.yml").language).toBe("yaml");
    expect(detectLanguage("config.yaml").language).toBe("yaml");
  });

  it("should detect TOML from .toml extension", () => {
    expect(detectLanguage("pyproject.toml").language).toBe("toml");
  });
});

describe("isLineComment", () => {
  it("should identify // comments in TypeScript", () => {
    const lang = detectLanguage("file.ts");
    expect(isLineComment("  // this is a comment", lang)).toBe(true);
    expect(isLineComment("  const x = 1; // inline", lang)).toBe(false);
    expect(isLineComment("const x = 1;", lang)).toBe(false);
  });

  it("should identify # comments in Python", () => {
    const lang = detectLanguage("file.py");
    expect(isLineComment("# comment", lang)).toBe(true);
    expect(isLineComment("  # indented comment", lang)).toBe(true);
    expect(isLineComment("x = 1", lang)).toBe(false);
  });
});

describe("isImportLine", () => {
  it("should detect TypeScript imports", () => {
    const lang = detectLanguage("file.ts");
    expect(isImportLine("import { foo } from 'bar';", lang)).toBe(true);
    expect(isImportLine("export { x } from 'y';", lang)).toBe(true);
    expect(isImportLine("const x = 1;", lang)).toBe(false);
  });

  it("should detect Python imports", () => {
    const lang = detectLanguage("file.py");
    expect(isImportLine("import os", lang)).toBe(true);
    expect(isImportLine("from pathlib import Path", lang)).toBe(true);
    expect(isImportLine("x = 1", lang)).toBe(false);
  });

  it("should detect C/C++ includes", () => {
    const lang = detectLanguage("file.c");
    expect(isImportLine("#include <stdio.h>", lang)).toBe(true);
    expect(isImportLine("int main() {", lang)).toBe(false);
  });

  it("should detect Rust use statements", () => {
    const lang = detectLanguage("file.rs");
    expect(isImportLine("use std::io;", lang)).toBe(true);
    expect(isImportLine("fn main() {", lang)).toBe(false);
  });
});

// ============================================================
// Tests for ReadCompressor (compressors/read.ts)
// ============================================================

describe("ReadCompressor", () => {
  const compressor = new ReadCompressor();

  // --- Test 1: Line number removal ---
  describe("line number removal", () => {
    it("should strip line number prefixes by default", () => {
      const input = [
        "1: import { foo } from 'bar';",
        "2: ",
        "3: const x = 1;",
        "4: const y = 2;",
        "5: const z = 3;",
        "6: export { x, y, z };",
        "7: ",
        "8: function test() {",
        "9:   return true;",
        "10:   // done",
        "11: }",
      ].join("\n");

      const result = compressor.compress(input, {
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });
      // Should NOT contain line-number prefixes
      expect(result.output).not.toMatch(/^\d+:\s/m);
      expect(result.output).toContain("import { foo } from 'bar';");
      expect(result.output).toContain("const x = 1;");
    });

    it("should keep line numbers when lineNumbers=true", () => {
      const input = "const x = 1;\nconst y = 2;\n";
      const result = compressor.compress(input, {
        lineNumbers: true,
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("1: const x = 1;");
      expect(result.output).toContain("2: const y = 2;");
    });

    it("should handle pipe-style line numbers (123|content)", () => {
      const input = [
        "  1|import os",
        "  2|import sys",
        "  3|",
        "  4|def main():",
        "  5|    pass",
        "  6|",
        "  7|# entry",
        "  8|main()",
        "  9|# done",
        " 10|# end",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "script.py",
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).not.toMatch(/^\s*\d+\|/m);
      expect(result.output).toContain("import os");
    });

  });

  // --- Test 2: Consecutive blank line merging ---
  describe("blank line collapsing", () => {
    it("should merge consecutive blank lines into one", () => {
      const input = "line1\n\n\n\nline2\n\n\nline3\n";
      const result = compressor.compress(input, {
        collapseComments: false,
        collapseImports: false,
      });
      // Should not have 2+ consecutive blank lines
      expect(result.output).not.toMatch(/\n\n\n/);
      expect(result.output).toContain("line1");
      expect(result.output).toContain("line2");
      expect(result.output).toContain("line3");
    });

    it("should not collapse blanks when collapseBlanks=false", () => {
      const input = "a\n\n\n\nb\n";
      const result = compressor.compress(input, {
        collapseBlanks: false,
        collapseComments: false,
        collapseImports: false,
      });
      // The raw content (before stats line) should still have multiple blanks
      const contentBeforeStats = result.output.split("\n--- air:")[0];
      expect(contentBeforeStats.split("\n").filter((l) => l === "").length).toBeGreaterThan(1);
    });
  });

  // --- Test 3: Comment block collapsing (// style) ---
  describe("comment block collapsing — single-line comments", () => {
    it("should collapse 3+ consecutive // comments", () => {
      const input = [
        "// Comment line 1",
        "// Comment line 2",
        "// Comment line 3",
        "// Comment line 4",
        "const x = 1;",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("// Comment line 1");
      expect(result.output).toContain("// ... (3 more comment lines)");
      expect(result.output).not.toContain("// Comment line 4");
    });

    it("should NOT collapse 2 or fewer consecutive comments", () => {
      const input = [
        "// Comment line 1",
        "// Comment line 2",
        "const x = 1;",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("// Comment line 1");
      expect(result.output).toContain("// Comment line 2");
    });

    it("should collapse # comments in Python", () => {
      const input = [
        "# This is a Python module",
        "# It does many things",
        "# Including amazing stuff",
        "# And more",
        "def func():",
        "    pass",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.py",
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("# This is a Python module");
      expect(result.output).toMatch(/\.\.\. \(\d+ more comment lines\)/);
      expect(result.output).not.toContain("# And more");
    });
  });

  // --- Test 4: Block comment collapsing (/* */ style) ---
  describe("comment block collapsing — block comments", () => {
    it("should collapse multi-line /* */ comments", () => {
      const input = [
        "/**",
        " * This is a JSDoc comment",
        " * with multiple lines",
        " * describing the function",
        " * @param x - the value",
        " */",
        "function foo(x: number) {}",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("/**");
      expect(result.output).toMatch(/\.\.\. \(\d+ more comment lines\)/);
      expect(result.output).toContain("function foo(x: number) {}");
    });

    it("should collapse HTML <!-- --> comments", () => {
      const input = [
        "<!-- ",
        "  This is a long HTML comment",
        "  spanning multiple lines",
        "  with various content",
        "-->",
        "<div>Hello</div>",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.html",
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("<!-- ");
      expect(result.output).toMatch(/\.\.\. \(\d+ more comment lines\)/);
      expect(result.output).toContain("<div>Hello</div>");
    });
  });

  // --- Test 5: Python docstring collapsing ---
  describe("Python docstring collapsing", () => {
    it("should collapse multi-line triple-quote docstrings", () => {
      const input = [
        'def func():',
        '    """',
        '    This is a docstring.',
        '    It has many lines.',
        '    With detailed docs.',
        '    And examples.',
        '    """',
        '    return 42',
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.py",
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain('"""');
      expect(result.output).toMatch(/\.\.\. \(\d+ more docstring lines\)/);
      expect(result.output).toContain("return 42");
    });

    it("should keep single-line docstrings as-is", () => {
      const input = [
        'def func():',
        '    """Single line docstring."""',
        '    return 42',
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.py",
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain('"""Single line docstring."""');
    });
  });

  // --- Test 6: Import block collapsing ---
  describe("import block collapsing", () => {
    it("should collapse 4+ consecutive imports", () => {
      const input = [
        "import { a } from 'a';",
        "import { b } from 'b';",
        "import { c } from 'c';",
        "import { d } from 'd';",
        "import { e } from 'e';",
        "",
        "const x = 1;",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        collapseComments: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("import { a } from 'a';");
      expect(result.output).toContain("// ... (3 more imports)");
      expect(result.output).toContain("import { e } from 'e';");
      expect(result.output).not.toContain("import { c } from 'c';");
    });

    it("should NOT collapse 3 or fewer imports", () => {
      const input = [
        "import { a } from 'a';",
        "import { b } from 'b';",
        "import { c } from 'c';",
        "",
        "const x = 1;",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        collapseComments: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("import { a } from 'a';");
      expect(result.output).toContain("import { b } from 'b';");
      expect(result.output).toContain("import { c } from 'c';");
    });

    it("should collapse Python imports", () => {
      const input = [
        "import os",
        "import sys",
        "import json",
        "import pathlib",
        "from collections import defaultdict",
        "",
        "def main():",
        "    pass",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.py",
        collapseComments: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("import os");
      expect(result.output).toContain("# ... (3 more imports)");
      expect(result.output).toContain("from collections import defaultdict");
    });
  });

  // --- Test 7: Smart truncation ---
  describe("smart truncation", () => {
    it("should truncate long content with head + tail + marker", () => {
      const lines: string[] = [];
      for (let i = 0; i < 100; i++) {
        lines.push(`line ${i + 1} content`);
      }
      const input = lines.join("\n");

      const result = compressor.compress(input, {
        maxLines: 20,
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });

      expect(result.output).toContain("line 1 content");
      expect(result.output).toContain("line 100 content");
      expect(result.output).toMatch(/\.\.\. \(\d+ lines omitted\) \.\.\./);
    });

    it("should not truncate content under maxLines", () => {
      const input = "line 1\nline 2\nline 3\n";
      const result = compressor.compress(input, {
        maxLines: 10,
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).not.toContain("omitted");
    });

    it("should truncate by token count", () => {
      const lines: string[] = [];
      for (let i = 0; i < 200; i++) {
        lines.push(`const variable${i} = "some value for variable number ${i}";`);
      }
      const input = lines.join("\n");

      const result = compressor.compress(input, {
        maxTokens: 200,
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });

      // Should be truncated
      expect(result.output).toMatch(/\.\.\. \(\d+ lines omitted\) \.\.\./);
      // Should be within rough token budget (give or take stats footer)
      const approxTokens = Math.ceil(result.output.length / 4);
      expect(approxTokens).toBeLessThan(400); // generous buffer for stats line
    });

    it("should honor tiny maxLines budgets without overflow", () => {
      const input = ["a", "b", "c", "d", "e", "f"].join("\n");
      const result = compressor.compress(input, {
        maxLines: 2,
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });

      const content = result.output.split("\n--- air:")[0];
      expect(content.split("\n").length).toBeLessThanOrEqual(2);
    });

    it("should enforce maxLines on final output including stats line", () => {
      const input = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
      const result = compressor.compress(input, {
        maxLines: 5,
        collapseComments: false,
        collapseImports: false,
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
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });

      expect(result.output.split("\n").length).toBeLessThanOrEqual(1);
      expect(result.output).not.toContain("--- air:");
      expect((result.metadata as Record<string, unknown>).statsIncluded).toBe(false);
    });
  });

  // --- Test 8: Statistics output ---
  describe("statistics output", () => {
    it("should include stats footer with correct format", () => {
      const input = "line 1\nline 2\nline 3\n";
      const result = compressor.compress(input, {
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toMatch(
        /--- air: \d+ lines → \d+ lines \(\d+% saved\) ---/
      );
    });

    it("should report correct compression metadata", () => {
      const lines: string[] = [];
      for (let i = 0; i < 10; i++) {
        lines.push("// comment " + i);
      }
      lines.push("const x = 1;");
      const input = lines.join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        collapseImports: false,
      });

      expect(result.format).toBe("air-read");
      expect(result.metadata).toBeDefined();
      expect((result.metadata as Record<string, unknown>).originalLines).toBe(11);
      // Should be compressed (10 comments → 2 lines)
      expect(result.compressedSize).toBeLessThan(result.originalSize);
    });
  });

  // --- Test 9: Edge cases ---
  describe("edge cases", () => {
    it("should handle empty file", () => {
      const result = compressor.compress("", {
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("--- air:");
      expect(result.originalSize).toBe(1); // single empty line
    });

    it("should handle single line file", () => {
      const result = compressor.compress("const x = 1;", {
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("const x = 1;");
      expect(result.output).toContain("--- air:");
    });

    it("should handle file with only comments", () => {
      const input = [
        "// comment 1",
        "// comment 2",
        "// comment 3",
        "// comment 4",
        "// comment 5",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        collapseImports: false,
      });
      expect(result.output).toContain("// comment 1");
      expect(result.output).toMatch(/\.\.\. \(\d+ more comment lines\)/);
      // Should be compressed
      expect(result.compressedSize).toBeLessThan(result.originalSize);
    });

    it("should handle file with only blank lines", () => {
      const input = "\n\n\n\n\n";
      const result = compressor.compress(input, {
        collapseComments: false,
        collapseImports: false,
      });
      // Multiple blanks collapsed to one
      const content = result.output.split("\n--- air:")[0];
      const blankLines = content.split("\n").filter((l) => l.trim() === "");
      expect(blankLines.length).toBeLessThanOrEqual(2);
    });

    it("should ignore non-positive maxLines", () => {
      const input = "line 1\nline 2\nline 3";
      const result = compressor.compress(input, {
        maxLines: -5,
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });

      expect(result.output).not.toContain("lines omitted");
      expect(result.output).toContain("line 3");
    });
  });

  // --- Test 10: Multi-language support ---
  describe("multi-language support", () => {
    it("should collapse Go imports", () => {
      const input = [
        'import (',
        '    "fmt"',
        '    "os"',
        '    "path/filepath"',
        '    "strings"',
        '    "encoding/json"',
        ')',
        '',
        'func main() {}',
      ].join("\n");

      // Go's `import (` block is a single import statement followed by indented strings
      // The import pattern matches the first line `import (`
      const result = compressor.compress(input, {
        fileName: "main.go",
        collapseComments: false,
        collapseBlanks: false,
      });
      // Should contain the file content and stats
      expect(result.output).toContain("func main() {}");
      expect(result.output).toContain("--- air:");
    });

    it("should handle C includes", () => {
      const input = [
        "#include <stdio.h>",
        "#include <stdlib.h>",
        "#include <string.h>",
        "#include <math.h>",
        "#include <ctype.h>",
        "",
        "int main() {",
        "    return 0;",
        "}",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "main.c",
        collapseComments: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("#include <stdio.h>");
      expect(result.output).toContain("// ... (3 more imports)");
      expect(result.output).toContain("#include <ctype.h>");
    });

    it("should handle Ruby requires", () => {
      const input = [
        "require 'json'",
        "require 'net/http'",
        "require 'uri'",
        "require 'openssl'",
        "",
        "class App",
        "end",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "app.rb",
        collapseComments: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("require 'json'");
      expect(result.output).toContain("# ... (2 more imports)");
      expect(result.output).toContain("require 'openssl'");
    });
  });

  // --- Test 11: Disable individual features ---
  describe("option toggling", () => {
    it("should not collapse comments when collapseComments=false", () => {
      const input = [
        "// line 1",
        "// line 2",
        "// line 3",
        "// line 4",
        "code();",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("// line 1");
      expect(result.output).toContain("// line 2");
      expect(result.output).toContain("// line 3");
      expect(result.output).toContain("// line 4");
    });

    it("should not collapse imports when collapseImports=false", () => {
      const input = [
        "import { a } from 'a';",
        "import { b } from 'b';",
        "import { c } from 'c';",
        "import { d } from 'd';",
        "import { e } from 'e';",
        "code();",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("import { a } from 'a';");
      expect(result.output).toContain("import { b } from 'b';");
      expect(result.output).toContain("import { c } from 'c';");
      expect(result.output).toContain("import { d } from 'd';");
      expect(result.output).toContain("import { e } from 'e';");
    });
  });

  // --- Test 12: Combined compression ---
  describe("combined compression", () => {
    it("should apply all compressions together for realistic file", () => {
      const input = [
        "1: import { Request } from 'express';",
        "2: import { Response } from 'express';",
        "3: import { Database } from '../db';",
        "4: import { Logger } from '../utils';",
        "5: import { Config } from '../config';",
        "6: ",
        "7: /**",
        "8:  * AuthService handles authentication.",
        "9:  * It provides login, logout, and token management.",
        "10:  * @module auth",
        "11:  */",
        "12: ",
        "13: ",
        "14: ",
        "15: export class AuthService {",
        "16:   // Private members",
        "17:   // for internal use only",
        "18:   // do not access directly",
        "19:   // from outside",
        "20:   private db: Database;",
        "21: ",
        "22:   constructor(db: Database) {",
        "23:     this.db = db;",
        "24:   }",
        "25: }",
      ].join("\n");

      const result = compressor.compress(input, { fileName: "auth.ts" });

      // Line numbers should be stripped
      expect(result.output).not.toMatch(/^\d+:\s/m);
      // Imports should be collapsed (5 imports)
      expect(result.output).toContain("// ... (3 more imports)");
      // Block comment collapsed
      expect(result.output).toMatch(/\.\.\. \(\d+ more comment lines\)/);
      // Multiple blanks collapsed
      expect(result.output).not.toMatch(/\n\n\n/);
      // Code preserved
      expect(result.output).toContain("export class AuthService {");
      // Stats present
      expect(result.output).toMatch(/--- air: 25 lines → \d+ lines \(\d+% saved\) ---/);
      // Meaningful compression
      expect(result.compressedSize).toBeLessThan(result.originalSize);
    });
  });
});

// ============================================================
// Tests for code review bug fixes
// ============================================================

describe("Code Review Bug Fixes", () => {
  const compressor = new ReadCompressor();

  // CR-01: Unclosed block comment should NOT consume all remaining lines
  describe("CR-01: unclosed block comment handling", () => {
    it("should not consume all lines when block comment is unclosed", () => {
      const input = [
        "/* This comment is never closed",
        "const x = 1;",
        "const y = 2;",
        "function foo() {}",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        collapseImports: false,
        collapseBlanks: false,
      });
      // Code after the unclosed comment should still be present
      expect(result.output).toContain("function foo() {}");
    });

    it("should not consume trailing code when docstring is unclosed", () => {
      const input = [
        "def fn():",
        '    """unclosed',
        "    x = 1",
        "    return x",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.py",
        collapseImports: false,
        collapseBlanks: false,
      });

      expect(result.output).toContain("return x");
      expect(result.output).not.toContain("more docstring lines");
    });
  });

  // CR-02: Language-appropriate comment prefix in line comment collapse hints
  describe("CR-02: language-appropriate comment prefix in hints", () => {
    it("should use # prefix for Python comment collapse hints", () => {
      const input = [
        "# Comment 1",
        "# Comment 2",
        "# Comment 3",
        "# Comment 4",
        "x = 1",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.py",
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("# ... (3 more comment lines)");
      expect(result.output).not.toContain("// ...");
    });
  });

  // CR-10: CRLF normalization
  describe("CR-10: CRLF line ending handling", () => {
    it("should handle Windows CRLF line endings", () => {
      const input = "line1\r\nline2\r\nline3\r\n";
      const result = compressor.compress(input, {
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).not.toContain("\r");
      expect(result.output).toContain("line1");
      expect(result.output).toContain("line2");
      expect(result.output).toContain("line3");
    });

    it("should handle structural boundary detection with CRLF", () => {
      const input = "function foo() {\r\n  return 1;\r\n}\r\n";
      const result = compressor.compress(input, {
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("function foo() {");
      expect(result.output).toContain("}");
      expect(result.output).not.toContain("\r");
    });
  });

  // CR-12: Import collapse single blank line tolerance
  describe("CR-12: import collapse blank line tolerance", () => {
    it("should not swallow code between import groups separated by multiple blanks", () => {
      const input = [
        "import { a } from 'a';",
        "import { b } from 'b';",
        "",
        "",
        "",
        "import { c } from 'c';",
        "import { d } from 'd';",
        "const code = 1;",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        collapseComments: false,
        collapseBlanks: false,
      });
      // Multiple blank lines should break the import block
      // Both import groups should remain as separate blocks
      expect(result.output).toContain("import { a } from 'a';");
      expect(result.output).toContain("import { c } from 'c';");
      expect(result.output).toContain("const code = 1;");
    });
  });

  // CR-14: Import collapse hint uses language-appropriate comment prefix
  describe("CR-14: import collapse hint uses correct comment prefix", () => {
    it("should use # prefix for Python import collapse hints", () => {
      const input = [
        "import os",
        "import sys",
        "import json",
        "import pathlib",
        "from collections import defaultdict",
        "",
        "def main():",
        "    pass",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.py",
        collapseComments: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("# ... (3 more imports)");
      expect(result.output).not.toContain("// ... (3 more imports)");
    });
  });

  // CR-15: Filename detection for extensionless files
  describe("CR-15: extensionless filename detection", () => {
    it("should detect Makefile as shell", () => {
      const lang = detectLanguage("Makefile");
      expect(lang.language).toBe("shell");
    });

    it("should detect Dockerfile as shell", () => {
      const lang = detectLanguage("Dockerfile");
      expect(lang.language).toBe("shell");
    });

    it("should detect Rakefile as ruby", () => {
      const lang = detectLanguage("Rakefile");
      expect(lang.language).toBe("ruby");
    });
  });
});


// ============================================================
// R2-05: require() regex tightening
// ============================================================

describe("R2-05: import detection for require()", () => {
  it("should detect 'const x = require(...)' as import", () => {
    const lang = detectLanguage("app.js");
    expect(isImportLine("const express = require('express');", lang)).toBe(true);
  });

  it("should detect 'let x = require(...)' as import", () => {
    const lang = detectLanguage("app.js");
    expect(isImportLine("let foo = require('foo');", lang)).toBe(true);
  });

  it("should detect 'var x = require(...)' as import", () => {
    const lang = detectLanguage("app.js");
    expect(isImportLine("var bar = require('bar');", lang)).toBe(true);
  });

  it("should NOT detect bare require() in function body as import", () => {
    const lang = detectLanguage("app.js");
    // This is the bug: bare require() in code should NOT be treated as import
    expect(isImportLine("  require('./setup');", lang)).toBe(false);
    expect(isImportLine("require('./polyfill');", lang)).toBe(false);
  });

  it("should still detect ES import statements", () => {
    const lang = detectLanguage("app.js");
    expect(isImportLine("import express from 'express';", lang)).toBe(true);
    expect(isImportLine("import { foo } from 'bar';", lang)).toBe(true);
  });

  it("should detect re-export statements", () => {
    const lang = detectLanguage("app.js");
    expect(isImportLine("export { default } from './module';", lang)).toBe(true);
  });
});

describe("Finding 8: savedPercent clamp", () => {
  const compressor = new ReadCompressor();

  it("should never report negative savedPercent when output expands", () => {
    const result = compressor.compress("x", {
      collapseComments: false,
      collapseImports: false,
      collapseBlanks: false,
    });

    const meta = result.metadata as Record<string, unknown>;
    expect(meta.savedPercent).toBeGreaterThanOrEqual(0);
    expect(result.output).toContain("(0% saved)");
  });
});

describe("skeleton mode", () => {
  const compressor = new ReadCompressor();
  const skeletonOpts = (fileName: string) => ({
    fileName,
    mode: "skeleton" as const,
    collapseComments: false,
    collapseImports: false,
    collapseBlanks: false,
  });

  describe("TypeScript/JavaScript", () => {
    it("should collapse function body", () => {
      const input = [
        "function hello(name: string) {",
        "  const greeting = `Hello, ${name}`;",
        "  console.log(greeting);",
        "  return greeting;",
        "  // extra line",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.ts"));
      expect(result.output).toContain("function hello(name: string) {");
      expect(result.output).toMatch(/\.\.\. \(\d+ lines collapsed\)/);
      expect(result.output).toContain("}");
      expect(result.output).not.toContain("console.log");
    });

    it("should collapse arrow function assigned to const", () => {
      const input = [
        "const greet = (name: string) => {",
        "  const msg = `Hi ${name}`;",
        "  console.log(msg);",
        "  return msg;",
        "};",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.ts"));
      expect(result.output).toContain("const greet = (name: string) => {");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse async function", () => {
      const input = [
        "async function fetchData(url: string) {",
        "  const response = await fetch(url);",
        "  const data = await response.json();",
        "  return data;",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.ts"));
      expect(result.output).toContain("async function fetchData(url: string) {");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse class body", () => {
      const input = [
        "class UserService {",
        "  private db: Database;",
        "  constructor(db: Database) {",
        "    this.db = db;",
        "  }",
        "  async getUser(id: string) {",
        "    return this.db.find(id);",
        "  }",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.ts"));
      expect(result.output).toContain("class UserService {");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse interface", () => {
      const input = [
        "interface Config {",
        "  host: string;",
        "  port: number;",
        "  debug: boolean;",
        "  timeout: number;",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.ts"));
      expect(result.output).toContain("interface Config {");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse enum", () => {
      const input = [
        "enum Status {",
        "  Active = 'active',",
        "  Inactive = 'inactive',",
        "  Pending = 'pending',",
        "  Deleted = 'deleted',",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.ts"));
      expect(result.output).toContain("enum Status {");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse export function", () => {
      const input = [
        "export function processData(data: string[]) {",
        "  const filtered = data.filter(Boolean);",
        "  const mapped = filtered.map(x => x.trim());",
        "  return mapped;",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.ts"));
      expect(result.output).toContain("export function processData(data: string[]) {");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse export default function", () => {
      const input = [
        "export default function main() {",
        "  init();",
        "  run();",
        "  cleanup();",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.ts"));
      expect(result.output).toContain("export default function main() {");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse generator function", () => {
      const input = [
        "function* generateIds() {",
        "  let id = 0;",
        "  while (true) {",
        "    yield id++;",
        "  }",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.ts"));
      expect(result.output).toContain("function* generateIds() {");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse JavaScript function", () => {
      const input = [
        "function validate(input) {",
        "  if (!input) return false;",
        "  const rules = getRules();",
        "  return rules.every(r => r(input));",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.js"));
      expect(result.output).toContain("function validate(input) {");
      expect(result.output).toMatch(/lines collapsed/);
    });
  });

  describe("Python", () => {
    it("should collapse def function", () => {
      const input = [
        "def process(data):",
        "    result = []",
        "    for item in data:",
        "        result.append(transform(item))",
        "    return result",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.py"));
      expect(result.output).toContain("def process(data):");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse class", () => {
      const input = [
        "class DataProcessor:",
        "    def __init__(self, config):",
        "        self.config = config",
        "        self.cache = {}",
        "",
        "    def process(self, data):",
        "        return self._transform(data)",
        "",
        "    def _transform(self, data):",
        "        return [x * 2 for x in data]",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.py"));
      expect(result.output).toContain("class DataProcessor:");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse async def", () => {
      const input = [
        "async def fetch_data(url):",
        "    async with aiohttp.ClientSession() as session:",
        "        response = await session.get(url)",
        "        return await response.json()",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.py"));
      expect(result.output).toContain("async def fetch_data(url):");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should preserve top-level code between functions", () => {
      const input = [
        "import os",
        "",
        "CONFIG = 'prod'",
        "",
        "def main():",
        "    data = load()",
        "    result = process(data)",
        "    save(result)",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.py"));
      expect(result.output).toContain("import os");
      expect(result.output).toContain("CONFIG = 'prod'");
      expect(result.output).toContain("def main():");
      expect(result.output).toMatch(/lines collapsed/);
    });
  });

  describe("Go", () => {
    it("should collapse func", () => {
      const input = [
        "func processItems(items []string) error {",
        "\tfor _, item := range items {",
        "\t\tif err := validate(item); err != nil {",
        "\t\t\treturn err",
        "\t\t}",
        "\t}",
        "\treturn nil",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("main.go"));
      expect(result.output).toContain("func processItems(items []string) error {");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse type struct", () => {
      const input = [
        "type Config struct {",
        "\tHost     string",
        "\tPort     int",
        "\tDebug    bool",
        "\tTimeout  time.Duration",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("main.go"));
      expect(result.output).toContain("type Config struct {");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse method with receiver", () => {
      const input = [
        "func (s *Server) Start() error {",
        "\tlistener, err := net.Listen(\"tcp\", s.addr)",
        "\tif err != nil {",
        "\t\treturn err",
        "\t}",
        "\treturn s.serve(listener)",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("main.go"));
      expect(result.output).toMatch(/lines collapsed/);
    });
  });

  describe("Rust", () => {
    it("should collapse fn", () => {
      const input = [
        "fn process(data: &[u8]) -> Result<Vec<u8>> {",
        "    let mut result = Vec::new();",
        "    for byte in data {",
        "        result.push(transform(*byte));",
        "    }",
        "    Ok(result)",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("lib.rs"));
      expect(result.output).toContain("fn process");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse impl block", () => {
      const input = [
        "impl Parser {",
        "    pub fn new() -> Self {",
        "        Parser { pos: 0 }",
        "    }",
        "",
        "    pub fn parse(&mut self, input: &str) -> Result<AST> {",
        "        let tokens = self.tokenize(input)?;",
        "        self.build_ast(tokens)",
        "    }",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("lib.rs"));
      expect(result.output).toContain("impl Parser {");
      expect(result.output).toMatch(/lines collapsed/);
    });
  });

  describe("Java", () => {
    it("should collapse class with methods", () => {
      const input = [
        "public class UserService {",
        "    private final UserRepo repo;",
        "",
        "    public UserService(UserRepo repo) {",
        "        this.repo = repo;",
        "    }",
        "",
        "    public User findById(String id) {",
        "        return repo.findById(id)",
        "            .orElseThrow(() -> new NotFoundException(id));",
        "    }",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("App.java"));
      expect(result.output).toContain("public class UserService {");
      expect(result.output).toMatch(/lines collapsed/);
    });
  });

  describe("C#", () => {
    it("should collapse class with methods", () => {
      const input = [
        "public class OrderService {",
        "    private readonly ILogger _logger;",
        "",
        "    public OrderService(ILogger logger) {",
        "        _logger = logger;",
        "    }",
        "",
        "    public async Task<Order> ProcessAsync(OrderRequest req) {",
        "        _logger.LogInformation(\"Processing order\");",
        "        var order = MapToOrder(req);",
        "        await _db.SaveAsync(order);",
        "        return order;",
        "    }",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("Service.cs"));
      expect(result.output).toContain("public class OrderService {");
      expect(result.output).toMatch(/lines collapsed/);
    });
  });

  describe("Ruby", () => {
    it("should collapse class with methods", () => {
      const input = [
        "class Calculator",
        "  def add(a, b)",
        "    validate(a)",
        "    validate(b)",
        "    result = a + b",
        "    log(result)",
        "    result",
        "  end",
        "",
        "  def subtract(a, b)",
        "    a - b",
        "  end",
        "end",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("calc.rb"));
      expect(result.output).toContain("class Calculator");
      expect(result.output).toMatch(/lines collapsed/);
      expect(result.output).toContain("end");
    });

    it("should collapse standalone def", () => {
      const input = [
        "def greet(name)",
        "  msg = \"Hello #{name}\"",
        "  puts msg",
        "  log(msg)",
        "  msg",
        "end",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("app.rb"));
      expect(result.output).toContain("def greet(name)");
      expect(result.output).toMatch(/lines collapsed/);
      expect(result.output).toContain("end");
    });
  });

  describe("general behavior", () => {
    it("mode: full (default) should NOT collapse function bodies", () => {
      const input = [
        "function hello() {",
        "  console.log('hello');",
        "  console.log('world');",
        "  return true;",
        "}",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toContain("console.log('hello')");
      expect(result.output).toContain("console.log('world')");
      expect(result.output).not.toContain("collapsed");
    });

    it("mode: skeleton with empty file should work", () => {
      const result = compressor.compress("", skeletonOpts("file.ts"));
      expect(result.output).toContain("--- air:");
    });

    it("mode: skeleton combined with collapseComments + collapseImports", () => {
      const input = [
        "import { a } from 'a';",
        "import { b } from 'b';",
        "import { c } from 'c';",
        "import { d } from 'd';",
        "import { e } from 'e';",
        "",
        "// comment 1",
        "// comment 2",
        "// comment 3",
        "// comment 4",
        "",
        "function process() {",
        "  const x = 1;",
        "  const y = 2;",
        "  return x + y;",
        "}",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        mode: "skeleton",
        collapseComments: true,
        collapseImports: true,
      });
      expect(result.output).toContain("// ... (3 more imports)");
      expect(result.output).toMatch(/more comment lines/);
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("mode: skeleton with maxLines should truncate after skeleton", () => {
      const funcs: string[] = [];
      for (let i = 0; i < 20; i++) {
        funcs.push(
          `function func${i}() {`,
          `  line1_${i};`,
          `  line2_${i};`,
          `  line3_${i};`,
          `  line4_${i};`,
          `}`,
          "",
        );
      }
      const input = funcs.join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        mode: "skeleton",
        maxLines: 10,
        collapseComments: false,
        collapseImports: false,
      });

      const totalLines = result.output.split("\n").length;
      expect(totalLines).toBeLessThanOrEqual(10);
    });

    it("mode: skeleton with lineNumbers should add numbers after skeleton", () => {
      const input = [
        "function hello() {",
        "  console.log('a');",
        "  console.log('b');",
        "  console.log('c');",
        "}",
      ].join("\n");

      const result = compressor.compress(input, {
        fileName: "file.ts",
        mode: "skeleton",
        lineNumbers: true,
        collapseComments: false,
        collapseImports: false,
        collapseBlanks: false,
      });
      expect(result.output).toMatch(/^\d+: function hello/m);
      expect(result.output).toMatch(/collapsed/);
    });

    it("metadata should include mode info", () => {
      const input = "function foo() { return 1; }";
      const result = compressor.compress(input, skeletonOpts("file.ts"));
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.mode).toBe("skeleton");
    });

    it("metadata should include full mode by default", () => {
      const input = "const x = 1;";
      const result = compressor.compress(input, { fileName: "file.ts" });
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.mode).toBe("full");
    });

    it("unknown language should pass through unchanged", () => {
      const input = [
        "BLOCK START",
        "  line 1",
        "  line 2",
        "  line 3",
        "  line 4",
        "BLOCK END",
      ].join("\n");

      const result = compressor.compress(input, {
        ...skeletonOpts("file.xyz"),
      });
      expect(result.output).toContain("line 1");
      expect(result.output).toContain("line 4");
      expect(result.output).not.toContain("collapsed");
    });

    it("should preserve top-level variable declarations", () => {
      const input = [
        "const CONFIG = 'production';",
        "let counter = 0;",
        "",
        "function increment() {",
        "  counter++;",
        "  console.log(counter);",
        "  return counter;",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.ts"));
      expect(result.output).toContain("const CONFIG = 'production';");
      expect(result.output).toContain("let counter = 0;");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should keep small function bodies (< 3 lines) as-is", () => {
      const input = [
        "function add(a: number, b: number) {",
        "  return a + b;",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.ts"));
      expect(result.output).toContain("return a + b;");
      expect(result.output).not.toContain("collapsed");
    });
  });

  describe("control flow keywords should NOT be treated as functions", () => {
    it("should not collapse if/for/while/switch as separate functions in TypeScript", () => {
      const input = [
        "function realFunction() {",
        "  if (condition) {",
        "    doA();",
        "    doB();",
        "    doC();",
        "  }",
        "  for (let i = 0; i < 10; i++) {",
        "    step1();",
        "    step2();",
        "    step3();",
        "  }",
        "  while (running) {",
        "    tick();",
        "    tock();",
        "    check();",
        "  }",
        "  switch (value) {",
        "    case 1:",
        "      handleOne();",
        "      break;",
        "    case 2:",
        "      handleTwo();",
        "      break;",
        "  }",
        "  return result;",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.ts"));
      expect(result.output).toContain("function realFunction()");
      expect(result.output).toMatch(/lines collapsed/);
      const collapseCount = (result.output.match(/lines collapsed/g) || []).length;
      expect(collapseCount).toBe(1);
    });

    it("should not collapse if/for/while/switch as separate functions in JavaScript", () => {
      const input = [
        "function realFunction() {",
        "  if (condition) {",
        "    doA();",
        "    doB();",
        "    doC();",
        "  }",
        "  for (let i = 0; i < 10; i++) {",
        "    step1();",
        "    step2();",
        "    step3();",
        "  }",
        "  while (running) {",
        "    tick();",
        "    tock();",
        "    check();",
        "  }",
        "  switch (value) {",
        "    case 1:",
        "      handleOne();",
        "      break;",
        "    case 2:",
        "      handleTwo();",
        "      break;",
        "  }",
        "  return result;",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("file.js"));
      expect(result.output).toContain("function realFunction()");
      expect(result.output).toMatch(/lines collapsed/);
      const collapseCount = (result.output.match(/lines collapsed/g) || []).length;
      expect(collapseCount).toBe(1);
    });
  });

  describe("additional language coverage", () => {
    it("should collapse PHP function body", () => {
      const input = [
        "<?php",
        "function processOrder($order) {",
        "    $total = 0;",
        '    foreach ($order->items as $item) {',
        "        $total += $item->price;",
        "    }",
        "    return $total;",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("app.php"));
      expect(result.output).toContain("function processOrder");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse Kotlin function body", () => {
      const input = [
        "fun processItems(items: List<String>) {",
        '    val filtered = items.filter { it.isNotEmpty() }',
        "    val mapped = filtered.map { it.uppercase() }",
        '    val result = mapped.joinToString(", ")',
        "    println(result)",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("main.kt"));
      expect(result.output).toContain("fun processItems");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse Swift function body", () => {
      const input = [
        "func processData(input: [Int]) -> Int {",
        "    var sum = 0",
        "    for value in input {",
        "        sum += value",
        "    }",
        "    return sum",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("main.swift"));
      expect(result.output).toContain("func processData");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse C function body", () => {
      const input = [
        "int calculate_sum(int* arr, int len) {",
        "    int sum = 0;",
        "    for (int i = 0; i < len; i++) {",
        "        sum += arr[i];",
        "    }",
        "    return sum;",
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("main.c"));
      expect(result.output).toContain("int calculate_sum");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse C++ method body", () => {
      const input = [
        "class Calculator {",
        "public:",
        "    int add(int a, int b) {",
        "        int result = a + b;",
        "        log(result);",
        "        validate(result);",
        "        return result;",
        "    }",
        "};",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("calc.cpp"));
      expect(result.output).toContain("class Calculator");
      expect(result.output).toMatch(/lines collapsed/);
    });

    it("should collapse Shell function body", () => {
      const input = [
        "process_data() {",
        '    echo "step 1"',
        '    echo "step 2"',
        '    echo "step 3"',
        '    echo "step 4"',
        "}",
      ].join("\n");

      const result = compressor.compress(input, skeletonOpts("script.sh"));
      expect(result.output).toContain("process_data()");
      expect(result.output).toMatch(/lines collapsed/);
    });
  });
});
