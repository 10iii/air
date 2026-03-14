import { describe, it, expect } from "vitest";
import { TestCompressor } from "../compressors/test.js";

const compressor = new TestCompressor();

function content(output: string): string {
  return output.split("\n--- air:")[0] ?? output;
}

function metadata(result: ReturnType<TestCompressor["compress"]>): Record<string, unknown> {
  return (result.metadata ?? {}) as Record<string, unknown>;
}

function pytestPassOutput(): string {
  return [
    "============================= test session starts =============================",
    "platform darwin -- Python 3.12.0, pytest-8.4.0",
    "collected 3 items",
    "",
    "tests/test_math.py::test_add PASSED",
    "tests/test_math.py::test_sub PASSED",
    "tests/test_math.py::test_mul PASSED",
    "",
    "============================== 3 passed in 0.12s ==============================",
  ].join("\n");
}

function pytestFailOutput(): string {
  return [
    "============================= test session starts =============================",
    "platform darwin -- Python 3.12.0, pytest-8.4.0",
    "collected 3 items",
    "",
    "tests/test_math.py::test_add PASSED",
    "tests/test_math.py::test_sub FAILED",
    "tests/test_math.py::test_mul PASSED",
    "",
    "=================================== FAILURES ===================================",
    "___________________________________ test_sub ___________________________________",
    "tests/test_math.py:14: in test_sub",
    "    assert subtract(3, 1) == 1",
    "E   AssertionError: assert 2 == 1",
    "",
    "=========================== short test summary info ============================",
    "FAILED tests/test_math.py::test_sub - AssertionError: assert 2 == 1",
    "==================== 1 failed, 2 passed, 1 skipped in 0.44s ====================",
  ].join("\n");
}

function jestPassOutput(): string {
  return [
    "PASS src/sum.test.ts",
    "  ✓ adds numbers (2 ms)",
    "  ✓ subtracts numbers (1 ms)",
    "",
    "Test Suites: 1 passed, 1 total",
    "Tests:       2 passed, 2 total",
    "Snapshots:   0 total",
    "Time:        0.45 s",
    "Ran all test suites.",
  ].join("\n");
}

function jestFailOutput(): string {
  return [
    "FAIL src/sum.test.ts",
    "  ● sum › adds numbers",
    "",
    "    expect(received).toBe(expected)",
    "",
    "    Expected: 3",
    "    Received: 2",
    "",
    "      at Object.<anonymous> (src/sum.test.ts:7:22)",
    "",
    "Test Suites: 1 failed, 1 total",
    "Tests:       1 failed, 1 passed, 2 total",
    "Time:        0.67 s",
    "Ran all test suites.",
  ].join("\n");
}

function vitestPassOutput(): string {
  return [
    " RUN  v2.1.8 /repo",
    "",
    " ✓ src/math.test.ts (3)",
    "   ✓ adds",
    "   ✓ subtracts",
    "   ✓ multiplies",
    "",
    " Test Files  1 passed (1)",
    "      Tests  3 passed (3)",
    "   Duration  512ms",
  ].join("\n");
}

function vitestFailOutput(): string {
  return [
    " RUN  v2.1.8 /repo",
    "",
    " ❯ src/math.test.ts (2)",
    "   ✓ adds",
    "   × subtracts",
    "     AssertionError: expected 2 to be 3",
    "     → expected 2 to be 3",
    "     at src/math.test.ts:9:14",
    "",
    " Test Files  1 failed (1)",
    "      Tests  1 failed | 1 passed (2)",
    "   Duration  488ms",
  ].join("\n");
}

function goPassOutput(): string {
  return [
    "=== RUN   TestAdd",
    "--- PASS: TestAdd (0.00s)",
    "=== RUN   TestSub",
    "--- PASS: TestSub (0.00s)",
    "PASS",
    "ok  github.com/acme/math  0.013s",
  ].join("\n");
}

function goFailOutput(): string {
  return [
    "=== RUN   TestAdd",
    "--- PASS: TestAdd (0.00s)",
    "=== RUN   TestSub",
    "    math_test.go:27: expected 3, got 2",
    "--- FAIL: TestSub (0.00s)",
    "FAIL",
    "FAIL    github.com/acme/math  0.018s",
  ].join("\n");
}

function cargoPassOutput(): string {
  return [
    "running 3 tests",
    "test tests::add ... ok",
    "test tests::sub ... ok",
    "test tests::mul ... ok",
    "",
    "test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.03s",
  ].join("\n");
}

function cargoFailOutput(): string {
  return [
    "running 3 tests",
    "test tests::add ... ok",
    "test tests::sub ... FAILED",
    "test tests::mul ... ok",
    "",
    "failures:",
    "",
    "---- tests::sub stdout ----",
    "thread 'tests::sub' panicked at src/lib.rs:22:9:",
    "assertion `left == right` failed",
    "  left: 2",
    " right: 3",
    "",
    "test result: FAILED. 2 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.03s",
  ].join("\n");
}

describe("TestCompressor runner detection", () => {
  it("detects pytest", () => {
    const result = compressor.compress(pytestPassOutput());
    expect(metadata(result).runner).toBe("pytest");
    expect(metadata(result).detectedRunner).toBe("pytest");
  });

  it("detects jest", () => {
    const result = compressor.compress(jestPassOutput());
    expect(metadata(result).runner).toBe("jest");
    expect(metadata(result).detectedRunner).toBe("jest");
  });

  it("detects vitest", () => {
    const result = compressor.compress(vitestPassOutput());
    expect(metadata(result).runner).toBe("vitest");
    expect(metadata(result).detectedRunner).toBe("vitest");
  });

  it("detects go test", () => {
    const result = compressor.compress(goPassOutput());
    expect(metadata(result).runner).toBe("go");
    expect(metadata(result).detectedRunner).toBe("go");
  });

  it("detects cargo test", () => {
    const result = compressor.compress(cargoPassOutput());
    expect(metadata(result).runner).toBe("cargo");
    expect(metadata(result).detectedRunner).toBe("cargo");
  });

  it("falls back to unknown for unrecognized output", () => {
    const result = compressor.compress("random text without test markers");
    expect(metadata(result).runner).toBe("unknown");
    expect(metadata(result).detectedRunner).toBe("unknown");
  });

  it("respects forced runner option", () => {
    const result = compressor.compress(jestPassOutput(), { runner: "pytest" });
    expect(metadata(result).detectedRunner).toBe("jest");
    expect(metadata(result).runner).toBe("pytest");
  });
});

describe("TestCompressor pass summaries", () => {
  it("formats pytest all-pass as one content line", () => {
    const result = compressor.compress(pytestPassOutput());
    const body = content(result.output);
    expect(body.split("\n")).toHaveLength(1);
    expect(body).toContain("✓ 3 tests passed");
    expect(body).toContain("0.12s");
    expect(metadata(result).status).toBe("pass");
  });

  it("formats jest all-pass as one content line", () => {
    const result = compressor.compress(jestPassOutput());
    const body = content(result.output);
    expect(body.split("\n")).toHaveLength(1);
    expect(body).toContain("✓ 2 tests passed");
    expect(body).toContain("0.45s");
    expect(metadata(result).status).toBe("pass");
  });

  it("formats vitest all-pass as one content line", () => {
    const result = compressor.compress(vitestPassOutput());
    const body = content(result.output);
    expect(body.split("\n")).toHaveLength(1);
    expect(body).toContain("✓ 3 tests passed");
    expect(body).toContain("512ms");
    expect(metadata(result).status).toBe("pass");
  });

  it("formats go all-pass as one content line", () => {
    const result = compressor.compress(goPassOutput());
    const body = content(result.output);
    expect(body.split("\n")).toHaveLength(1);
    expect(body).toContain("✓ 2 tests passed");
    expect(body).toContain("0.013s");
    expect(metadata(result).status).toBe("pass");
  });

  it("formats cargo all-pass as one content line", () => {
    const result = compressor.compress(cargoPassOutput());
    const body = content(result.output);
    expect(body.split("\n")).toHaveLength(1);
    expect(body).toContain("✓ 3 tests passed");
    expect(body).toContain("0.03s");
    expect(metadata(result).status).toBe("pass");
  });

  it("includes skipped count in pass summary when present", () => {
    const output = [
      "============================= test session starts =============================",
      "collected 4 items",
      "tests/test_api.py::test_ok PASSED",
      "tests/test_api.py::test_skip SKIPPED",
      "tests/test_api.py::test_more PASSED",
      "tests/test_api.py::test_done PASSED",
      "======================= 3 passed, 1 skipped in 0.20s ========================",
    ].join("\n");
    const result = compressor.compress(output);
    const body = content(result.output);
    expect(body).toContain("3 tests passed");
    expect(body).toContain("1 skipped");
  });

  it("uses singular test word for 1 passed test", () => {
    const output = [
      "Test Suites: 1 passed, 1 total",
      "Tests:       1 passed, 1 total",
      "Time:        0.21 s",
    ].join("\n");
    const result = compressor.compress(output);
    const body = content(result.output);
    expect(body).toContain("✓ 1 test passed");
  });
});

describe("TestCompressor failure extraction", () => {
  it("extracts pytest failure name", () => {
    const result = compressor.compress(pytestFailOutput());
    const body = content(result.output);
    expect(body).toContain("✗ 1/4 tests failed");
    expect(body).toContain("FAIL tests/test_math.py::test_sub");
    expect(metadata(result).status).toBe("fail");
  });

  it("extracts pytest location and error", () => {
    const result = compressor.compress(pytestFailOutput());
    const body = content(result.output);
    expect(body).toContain("tests/test_math.py:14");
    expect(body).toContain("AssertionError");
  });

  it("extracts jest failure test title", () => {
    const result = compressor.compress(jestFailOutput());
    const body = content(result.output);
    expect(body).toContain("FAIL src/sum.test.ts > sum › adds numbers");
  });

  it("extracts jest failure location", () => {
    const result = compressor.compress(jestFailOutput());
    const body = content(result.output);
    expect(body).toContain("src/sum.test.ts:7:22");
  });

  it("extracts vitest failure test title", () => {
    const result = compressor.compress(vitestFailOutput());
    const body = content(result.output);
    expect(body).toContain("FAIL src/math.test.ts > subtracts");
  });

  it("extracts vitest assertion context", () => {
    const result = compressor.compress(vitestFailOutput());
    const body = content(result.output);
    expect(body).toContain("AssertionError: expected 2 to be 3");
    expect(body).toContain("expected 2 to be 3");
  });

  it("extracts go failure details", () => {
    const result = compressor.compress(goFailOutput());
    const body = content(result.output);
    expect(body).toContain("✗ 1/2 tests failed");
    expect(body).toContain("FAIL TestSub");
    expect(body).toContain("expected 3, got 2");
  });

  it("extracts go failure location", () => {
    const result = compressor.compress(goFailOutput());
    const body = content(result.output);
    expect(body).toContain("math_test.go:27");
  });

  it("extracts cargo failure name", () => {
    const result = compressor.compress(cargoFailOutput());
    const body = content(result.output);
    expect(body).toContain("✗ 1/3 tests failed");
    expect(body).toContain("FAIL tests::sub");
  });

  it("extracts cargo panic details", () => {
    const result = compressor.compress(cargoFailOutput());
    const body = content(result.output);
    expect(body).toContain("src/lib.rs:22:9");
    expect(body).toContain("left: 2");
    expect(body).toContain("right: 3");
  });

  it("keeps mixed pass/fail summaries from jest", () => {
    const result = compressor.compress(jestFailOutput());
    const meta = metadata(result);
    expect(meta.total).toBe(2);
    expect(meta.passed).toBe(1);
    expect(meta.failed).toBe(1);
  });

  it("keeps mixed pass/fail/skipped summaries from pytest", () => {
    const result = compressor.compress(pytestFailOutput());
    const meta = metadata(result);
    expect(meta.total).toBe(4);
    expect(meta.passed).toBe(2);
    expect(meta.failed).toBe(1);
    expect(meta.skipped).toBe(1);
  });

  it("keeps mixed pass/fail summaries from cargo", () => {
    const result = compressor.compress(cargoFailOutput());
    const meta = metadata(result);
    expect(meta.total).toBe(3);
    expect(meta.passed).toBe(2);
    expect(meta.failed).toBe(1);
  });
});

describe("TestCompressor truncation and budgets", () => {
  it("applies maxLines truncation with omission marker", () => {
    const verbose = [
      "FAIL src/huge.test.ts",
      "  ● huge case",
      ...Array.from({ length: 60 }, (_, i) => `    context line ${i + 1}`),
      "Test Suites: 1 failed, 1 total",
      "Tests:       1 failed, 1 total",
      "Time:        1.00 s",
    ].join("\n");

    const result = compressor.compress(verbose, { maxLines: 10 });
    const body = content(result.output);
    expect(body).toContain("✗ 1/1 tests failed");
    expect(result.output.split("\n").length).toBeLessThanOrEqual(10);
  });

  it("preserves failure lines when maxLines truncates", () => {
    const verbose = [
      "FAIL src/huge.test.ts",
      "  ● huge case",
      "    Error: boom",
      ...Array.from({ length: 80 }, (_, i) => `    frame ${i + 1}`),
      "Test Suites: 1 failed, 1 total",
      "Tests:       1 failed, 1 total",
      "Time:        1.00 s",
    ].join("\n");

    const result = compressor.compress(verbose, { maxLines: 11 });
    const body = content(result.output);
    expect(body).toContain("FAIL src/huge.test.ts");
  });

  it("omits stats line when maxLines is too small", () => {
    const result = compressor.compress(jestFailOutput(), { maxLines: 1 });
    expect(result.output).not.toContain("--- air:");
    expect(metadata(result).statsIncluded).toBe(false);
  });

  it("applies maxTokens truncation", () => {
    const verbose = [
      jestFailOutput(),
      ...Array.from({ length: 120 }, (_, i) => `stack frame ${i} with verbose payload ${"x".repeat(40)}`),
    ].join("\n");

    const result = compressor.compress(verbose, { maxTokens: 80 });
    const approxTokens = Math.ceil(content(result.output).length / 4);
    expect(approxTokens).toBeLessThan(250);
  });

  it("flags budgetExceeded when token budget is impossible", () => {
    const result = compressor.compress(jestFailOutput(), { maxTokens: 1 });
    expect(metadata(result).budgetExceeded).toBe(true);
  });

  it("sets budgetExceeded false under normal token budget", () => {
    const result = compressor.compress(jestFailOutput(), { maxTokens: 400 });
    expect(metadata(result).budgetExceeded).toBe(false);
  });

  it("omits stats when maxTokens too small for footer reservation", () => {
    const result = compressor.compress(jestFailOutput(), { maxTokens: 10 });
    expect(result.output).not.toContain("--- air:");
    expect(metadata(result).statsIncluded).toBe(false);
  });
});

describe("TestCompressor metadata and output format", () => {
  it("includes stats footer with expected format", () => {
    const result = compressor.compress(jestPassOutput());
    expect(result.output).toMatch(/--- air: \d+ lines → \d+ lines \(\d+% saved\) ---/);
  });

  it("returns air-test format", () => {
    const result = compressor.compress(jestPassOutput());
    expect(result.format).toBe("air-test");
  });

  it("includes runner, status and summary metadata fields", () => {
    const result = compressor.compress(jestFailOutput());
    const meta = metadata(result);
    expect(meta.runner).toBe("jest");
    expect(meta.status).toBe("fail");
    expect(meta.total).toBe(2);
    expect(meta.failed).toBe(1);
    expect(meta.passed).toBe(1);
    expect(meta.duration).toBe("0.67s");
  });

  it("tracks failure count in metadata", () => {
    const result = compressor.compress(cargoFailOutput());
    expect(metadata(result).failureCount).toBe(1);
  });
});

describe("TestCompressor edge cases", () => {
  it("handles empty output", () => {
    const result = compressor.compress("");
    const body = content(result.output);
    expect(body).toBe("? No test output received");
    expect(result.originalSize).toBe(1);
  });

  it("handles unknown runner with generic pass/fail stats", () => {
    const result = compressor.compress("summary: 10 passed, 2 failed in 3.1s");
    const body = content(result.output);
    expect(body).toContain("2/12 tests failed");
    expect(metadata(result).runner).toBe("unknown");
  });

  it("handles partial output with only fail summary", () => {
    const partial = [
      "Test Suites: 2 failed, 10 total",
      "Tests:       2 failed, 54 passed, 56 total",
      "Time:        3.2 s",
    ].join("\n");
    const result = compressor.compress(partial);
    const body = content(result.output);
    expect(body).toContain("2/56 tests failed");
  });

  it("handles partial output with fail marker and no stats", () => {
    const result = compressor.compress("FAIL src/basic.test.ts\nError: boom");
    const body = content(result.output);
    expect(body).toContain("failed");
    expect(body).toContain("FAIL src/basic.test.ts");
  });

  it("handles forced pytest parser on partial summary line", () => {
    const partial = "==================== 2 failed, 5 passed in 0.45s ====================";
    const result = compressor.compress(partial, { runner: "pytest" });
    const body = content(result.output);
    expect(body).toContain("2/7 tests failed");
    expect(metadata(result).runner).toBe("pytest");
  });

  it("deduplicates failures from detailed and short summary sections", () => {
    const result = compressor.compress(pytestFailOutput());
    const body = content(result.output);
    const matches = body.match(/FAIL tests\/test_math\.py::test_sub/g) ?? [];
    expect(matches.length).toBe(1);
    expect(metadata(result).failureCount).toBe(1);
  });

  it("ignores non-positive maxLines", () => {
    const result = compressor.compress(jestFailOutput(), { maxLines: 0 });
    expect(result.output).toContain("--- air:");
  });

  it("ignores non-positive maxTokens", () => {
    const result = compressor.compress(jestFailOutput(), { maxTokens: 0 });
    expect(result.output).toContain("--- air:");
  });

  it("normalizes CRLF input", () => {
    const crlf = jestPassOutput().replace(/\n/g, "\r\n");
    const result = compressor.compress(crlf);
    expect(result.output).not.toContain("\r");
    expect(content(result.output)).toContain("tests passed");
  });

  it("prefers cargo parser when cargo and go tokens both exist", () => {
    const hybrid = [cargoFailOutput(), "--- FAIL: TestMaybeGo (0.00s)"].join("\n");
    const result = compressor.compress(hybrid);
    expect(metadata(result).detectedRunner).toBe("cargo");
  });

  it("keeps output ratio values sane", () => {
    const result = compressor.compress(jestFailOutput());
    expect(result.ratio).toBeGreaterThan(0);
    expect(result.compressedSize).toBeGreaterThan(0);
    expect(result.originalSize).toBeGreaterThan(0);
  });
});
