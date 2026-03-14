import type { CompressResult } from "../types.js";
import { estimateTokens, collapseBlanks } from "../utils/index.js";

export type TestRunner = "pytest" | "jest" | "vitest" | "go" | "cargo";

type RunnerName = TestRunner | "unknown";
type TestStatus = "pass" | "fail" | "unknown";

interface SummaryStats {
  total?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  duration?: string;
}

interface FailureDetail {
  testName: string;
  location?: string;
  error?: string;
  context: string[];
}

interface ParsedTestOutput {
  runner: RunnerName;
  status: TestStatus;
  summary: SummaryStats;
  failures: FailureDetail[];
}

export interface TestOptions {
  maxLines?: number;
  maxTokens?: number;
  runner?: TestRunner;
}

const SUMMARY_BREAK_PATTERNS: RegExp[] = [
  /^Test Suites:/i,
  /^Tests:/i,
  /^Snapshots:/i,
  /^Time:/i,
  /^Test Files/i,
  /^Duration/i,
  /^Start at/i,
  /^Ran all test suites/i,
  /^test result:/i,
];

const FAILURE_LINE_PATTERNS: RegExp[] = [
  /^FAIL\b/i,
  /^✗\b/u,
  /^×\b/u,
  /^\s*at\s+/,
  /^AssertionError[:\s]/i,
  /\bexpected\b/i,
  /\breceived\b/i,
  /\bpanic\b/i,
  /^E\s+/,
  /^Error[:\s]/,
];

function sanitizeLimit(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function normalizeDuration(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

function extractDuration(line: string): string | undefined {
  const patterns = [
    /\bin\s+([0-9]+(?:\.[0-9]+)?\s*(?:ms|s|m|h))\b/i,
    /\bfinished in\s+([0-9]+(?:\.[0-9]+)?\s*(?:ms|s|m|h))\b/i,
    /^\s*Time:\s*([0-9]+(?:\.[0-9]+)?\s*(?:ms|s|m|h))\b/i,
    /^\s*Duration\s+([0-9]+(?:\.[0-9]+)?\s*(?:ms|s|m|h))\b/i,
    /\(([0-9]+(?:\.[0-9]+)?\s*(?:ms|s|m|h))\)\s*$/i,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match?.[1]) {
      return normalizeDuration(match[1]);
    }
  }

  return undefined;
}

function mergeSummary(target: SummaryStats, update: Partial<SummaryStats>): void {
  if (update.total !== undefined) target.total = update.total;
  if (update.passed !== undefined) target.passed = update.passed;
  if (update.failed !== undefined) target.failed = update.failed;
  if (update.skipped !== undefined) target.skipped = update.skipped;
  if (update.duration !== undefined) target.duration = update.duration;
}

function parseCountsFromLine(line: string): Partial<SummaryStats> {
  const counts: Partial<SummaryStats> = {};
  const countPattern =
    /(\d+)\s+(passed|pass(?:ed)?|failed|fail(?:ed)?|errors?|skipped|skip(?:ped)?|ignored|xfailed|xpassed|deselected|total)\b/gi;

  while (true) {
    const match = countPattern.exec(line);
    if (!match) break;

    const value = Number(match[1]);
    const rawLabel = match[2]?.toLowerCase() ?? "";

    if (rawLabel.startsWith("pass")) {
      counts.passed = value;
      continue;
    }
    if (rawLabel.startsWith("fail")) {
      counts.failed = value;
      continue;
    }
    if (rawLabel.startsWith("error")) {
      counts.failed = (counts.failed ?? 0) + value;
      continue;
    }
    if (
      rawLabel.startsWith("skip") ||
      rawLabel === "ignored" ||
      rawLabel === "xfailed" ||
      rawLabel === "xpassed" ||
      rawLabel === "deselected"
    ) {
      counts.skipped = (counts.skipped ?? 0) + value;
      continue;
    }
    if (rawLabel === "total") {
      counts.total = value;
    }
  }

  const runningMatch = line.match(/\brunning\s+(\d+)\s+tests?\b/i);
  if (runningMatch?.[1]) {
    counts.total = Number(runningMatch[1]);
  }

  const parenTotal = line.match(/\((\d+)\)\s*$/);
  if (parenTotal?.[1] && /tests?/i.test(line) && counts.total === undefined) {
    counts.total = Number(parenTotal[1]);
  }

  return counts;
}

function finalizeSummary(summary: SummaryStats): SummaryStats {
  const out: SummaryStats = { ...summary };

  if (out.total === undefined) {
    const parts = [out.passed, out.failed, out.skipped].filter(
      (value): value is number => typeof value === "number"
    );
    if (parts.length > 0) {
      out.total = parts.reduce((sum, value) => sum + value, 0);
    }
  }

  if (out.passed === undefined && out.total !== undefined && out.failed !== undefined) {
    out.passed = Math.max(0, out.total - out.failed - (out.skipped ?? 0));
  }

  if (out.failed === undefined && out.total !== undefined && out.passed !== undefined) {
    out.failed = Math.max(0, out.total - out.passed - (out.skipped ?? 0));
  }

  return out;
}

function normalizeFailureName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function normalizeErrorLine(line: string): string {
  return line.replace(/^E\s+/, "").replace(/^→\s*/, "").trim();
}

function isErrorMessageLine(line: string): boolean {
  return (
    /^AssertionError[:\s]/i.test(line) ||
    /^TypeError[:\s]/i.test(line) ||
    /^ReferenceError[:\s]/i.test(line) ||
    /^SyntaxError[:\s]/i.test(line) ||
    /^Error[:\s]/.test(line) ||
    /^expect\(/.test(line) ||
    /^thread\s+'.+'\s+panicked\s+at\s+/i.test(line) ||
    /^panic[:\s]/i.test(line) ||
    /^E\s+/.test(line)
  );
}

function isContextLine(line: string): boolean {
  return (
    /^Expected[:\s]/i.test(line) ||
    /^Received[:\s]/i.test(line) ||
    /^\d+\s*\|/.test(line) ||
    /^>\s*\d+\s*\|/.test(line) ||
    /^\|/.test(line) ||
    /^[-+]\s/.test(line) ||
    /^left:\s*/i.test(line) ||
    /^right:\s*/i.test(line) ||
    /^assert\b/i.test(line) ||
    /^assertion\b/i.test(line) ||
    /^E\s+/.test(line) ||
    /^→\s*/.test(line) ||
    /^\s*at\s+/.test(line)
  );
}

function extractLocation(line: string): string | undefined {
  const stackParen = line.match(/\(([^()]+:\d+:\d+)\)/);
  if (stackParen?.[1]) {
    return stackParen[1];
  }

  const commonLocation = line.match(
    /([A-Za-z0-9_./\\-]+\.(?:[cm]?[jt]sx?|py|go|rs):\d+(?::\d+)?)/
  );
  if (commonLocation?.[1]) {
    return commonLocation[1];
  }

  const panicLocation = line.match(/\bat\s+([A-Za-z0-9_./\\-]+:\d+:\d+)\b/);
  if (panicLocation?.[1]) {
    return panicLocation[1];
  }

  return undefined;
}

function sanitizeFailure(failure: FailureDetail): FailureDetail {
  const context: string[] = [];
  for (const raw of failure.context) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (context[context.length - 1] === trimmed) continue;
    context.push(trimmed);
  }

  return {
    testName: normalizeFailureName(failure.testName),
    location: failure.location?.trim(),
    error: failure.error?.trim(),
    context,
  };
}

function isFailureEquivalent(a: FailureDetail, b: FailureDetail): boolean {
  const aName = normalizeFailureName(a.testName);
  const bName = normalizeFailureName(b.testName);
  if (aName === bName) return true;

  const aTail = aName.split("::").pop();
  const bTail = bName.split("::").pop();
  if (aTail && bTail && aTail === bTail) return true;

  return aName.includes(bName) || bName.includes(aName);
}

function dedupeFailures(failures: FailureDetail[]): FailureDetail[] {
  const deduped: FailureDetail[] = [];

  for (const failure of failures) {
    const normalized = sanitizeFailure(failure);
    const existing = deduped.find((item) => isFailureEquivalent(item, normalized));

    if (!existing) {
      deduped.push(normalized);
      continue;
    }

    if (existing.testName.length < normalized.testName.length) {
      existing.testName = normalized.testName;
    }
    if (!existing.location && normalized.location) {
      existing.location = normalized.location;
    }
    if (!existing.error && normalized.error) {
      existing.error = normalized.error;
    }

    for (const line of normalized.context) {
      if (!existing.context.includes(line)) {
        existing.context.push(line);
      }
    }
  }

  return deduped;
}

function detectRunner(content: string): RunnerName {
  const hasCargo =
    /test result:\s*(?:ok|FAILED)\./i.test(content) ||
    /^test\s+.+\.\.\.\s+(?:ok|FAILED)$/m.test(content);
  if (hasCargo) return "cargo";

  const hasGo =
    /^---\s+(?:PASS|FAIL|SKIP):/m.test(content) ||
    /^=== RUN\s+/m.test(content) ||
    /^(?:ok|FAIL)\s+\S+\s+\d+(?:\.\d+)?s\b/m.test(content);
  if (hasGo) return "go";

  const hasPytest =
    /short test summary info/i.test(content) ||
    (/^=+/m.test(content) && /\b(?:PASSED|FAILED|ERROR)\b/.test(content) && /pytest|test session starts/i.test(content));
  if (hasPytest) return "pytest";

  const hasVitest =
    /\bvitest\b/i.test(content) ||
    /^\s*Test Files\s+/m.test(content) ||
    /^\s*Duration\s+\d/m.test(content);
  if (hasVitest) return "vitest";

  const hasJest =
    /Test Suites:/i.test(content) ||
    /^\s*(?:PASS|FAIL)\s+/m.test(content) ||
    /\bTests:\s+/i.test(content);
  if (hasJest) return "jest";

  return "unknown";
}

function parsePytest(lines: string[], content: string): ParsedTestOutput {
  const summary: SummaryStats = {};
  const shortSummaryFailures: FailureDetail[] = [];
  const detailedFailures: FailureDetail[] = [];

  for (const line of lines) {
    mergeSummary(summary, parseCountsFromLine(line));
    const duration = extractDuration(line);
    if (duration) summary.duration = duration;
  }

  const shortSummaryIndex = lines.findIndex((line) => /short test summary info/i.test(line));
  if (shortSummaryIndex !== -1) {
    for (let i = shortSummaryIndex + 1; i < lines.length; i++) {
      const trimmed = lines[i]?.trim() ?? "";
      if (!trimmed) continue;
      if (/^=+/.test(trimmed)) break;

      const match = trimmed.match(/^(FAILED|ERROR)\s+(.+?)(?:\s+-\s+(.+))?$/);
      if (!match) continue;

      shortSummaryFailures.push({
        testName: match[2]?.trim() ?? "pytest failure",
        error: match[3]?.trim(),
        context: [],
      });
    }
  }

  const failuresIndex = lines.findIndex((line) => /\bFAILURES\b/.test(line));
  if (failuresIndex !== -1) {
    let current: FailureDetail | null = null;
    const flush = (): void => {
      if (!current) return;
      detailedFailures.push(sanitizeFailure(current));
      current = null;
    };

    for (let i = failuresIndex + 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const trimmed = line.trim();

      if (/short test summary info/i.test(trimmed)) {
        flush();
        break;
      }
      if (/^=+\s*\d+\s+/.test(trimmed) && /(passed|failed|error|skipped)/i.test(trimmed)) {
        flush();
        break;
      }

      const headerMatch = line.match(/^_{2,}\s*(.+?)\s*_{2,}$/);
      if (headerMatch?.[1]) {
        flush();
        current = { testName: headerMatch[1], context: [] };
        continue;
      }

      if (!current) continue;
      if (!trimmed) continue;

      const location = extractLocation(line);
      if (location && !current.location) {
        current.location = location;
      }

      if (!current.error && isErrorMessageLine(trimmed)) {
        current.error = normalizeErrorLine(trimmed);
      }

      if (isContextLine(trimmed)) {
        current.context.push(trimmed);
      }
    }

    flush();
  }

  const failures = dedupeFailures([...detailedFailures, ...shortSummaryFailures]);
  const finalSummary = finalizeSummary(summary);

  if (finalSummary.failed === undefined && failures.length > 0) {
    finalSummary.failed = failures.length;
  }

  const status: TestStatus =
    (finalSummary.failed ?? 0) > 0 || failures.length > 0 || /\bFAILED\b/.test(content)
      ? "fail"
      : finalSummary.passed !== undefined
        ? "pass"
        : "unknown";

  return {
    runner: "pytest",
    status,
    summary: finalizeSummary(finalSummary),
    failures,
  };
}

function parseJestLike(lines: string[], content: string, runner: "jest" | "vitest"): ParsedTestOutput {
  const testsSummary: SummaryStats = {};
  const suitesSummary: SummaryStats = {};

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^Tests?:/i.test(trimmed) || /^Tests\s+/i.test(trimmed)) {
      mergeSummary(testsSummary, parseCountsFromLine(trimmed));
    }

    if (/^Test Suites:/i.test(trimmed) || /^Test Files\s+/i.test(trimmed)) {
      mergeSummary(suitesSummary, parseCountsFromLine(trimmed));
    }

    const duration = extractDuration(trimmed);
    if (duration) {
      testsSummary.duration = duration;
      suitesSummary.duration = duration;
    }
  }

  const summary = finalizeSummary(
    testsSummary.total !== undefined || testsSummary.passed !== undefined || testsSummary.failed !== undefined
      ? testsSummary
      : suitesSummary
  );

  const failures: FailureDetail[] = [];
  let currentFile: string | undefined;
  let active: FailureDetail | null = null;

  const flush = (force = false): void => {
    if (!active) return;
    const normalized = sanitizeFailure(active);

    const isPlaceholder =
      !!currentFile &&
      normalized.testName === currentFile &&
      !normalized.location &&
      !normalized.error &&
      normalized.context.length === 0;

    if (!isPlaceholder || force) {
      failures.push(normalized);
    }
    active = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (SUMMARY_BREAK_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      flush();
      continue;
    }

    const vitestFailHeader = line.match(/^\s*FAIL\s+(.+?)\s+>\s+(.+)$/);
    if (vitestFailHeader?.[1] && vitestFailHeader[2]) {
      flush();
      currentFile = vitestFailHeader[1].trim();
      active = {
        testName: `${currentFile} > ${vitestFailHeader[2].trim()}`,
        context: [],
      };
      continue;
    }

    const failFile = line.match(/^\s*FAIL\s+(.+)$/);
    if (failFile?.[1]) {
      flush();
      currentFile = failFile[1].trim();
      active = { testName: currentFile, context: [] };
      continue;
    }

    const passFile = line.match(/^\s*PASS\s+(.+)$/);
    if (passFile?.[1]) {
      flush();
      currentFile = undefined;
      continue;
    }

    const vitestFileLine = line.match(/^\s*[❯>]\s+(.+\.(?:[cm]?[jt]sx?))\s+\(\d+\)/u);
    if (vitestFileLine?.[1]) {
      currentFile = vitestFileLine[1].trim();
      continue;
    }

    const jestCase = line.match(/^\s*●\s+(.+)$/);
    if (jestCase?.[1]) {
      const parent = currentFile;
      flush();
      active = {
        testName: parent ? `${parent} > ${jestCase[1].trim()}` : jestCase[1].trim(),
        context: [],
      };
      continue;
    }

    const vitestCase = line.match(/^\s*[×✗]\s+(.+)$/u);
    if (vitestCase?.[1]) {
      const parent = currentFile;
      flush();
      active = {
        testName: parent ? `${parent} > ${vitestCase[1].trim()}` : vitestCase[1].trim(),
        context: [],
      };
      continue;
    }

    if (!active && currentFile && isErrorMessageLine(trimmed)) {
      active = {
        testName: currentFile,
        context: [],
      };
    }

    if (!active) continue;

    const location = extractLocation(line);
    if (location && !active.location) {
      active.location = location;
    }

    if (!active.error && isErrorMessageLine(trimmed)) {
      active.error = normalizeErrorLine(trimmed);
    }

    if (isContextLine(trimmed)) {
      active.context.push(trimmed);
    }
  }

  flush(failures.length === 0);

  const dedupedFailures = dedupeFailures(failures);
  if (summary.failed === undefined && dedupedFailures.length > 0) {
    summary.failed = dedupedFailures.length;
  }

  const hasFailMarker = /^\s*FAIL\s+/m.test(content) || /^\s*[×✗]\s/mu.test(content);
  const status: TestStatus =
    (summary.failed ?? 0) > 0 || dedupedFailures.length > 0 || hasFailMarker
      ? "fail"
      : summary.passed !== undefined
        ? "pass"
        : "unknown";

  return {
    runner,
    status,
    summary: finalizeSummary(summary),
    failures: dedupedFailures,
  };
}

function parseGo(lines: string[], content: string): ParsedTestOutput {
  const summary: SummaryStats = {};
  const failures: FailureDetail[] = [];

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  let current: FailureDetail | null = null;
  // Go 1.14+: error lines appear BEFORE `--- FAIL:`, so buffer between `=== RUN` and verdict
  let pendingTestName: string | null = null;
  let pendingLines: string[] = [];

  const flush = (): void => {
    if (!current) return;
    failures.push(sanitizeFailure(current));
    current = null;
  };

  const clearPending = (): void => {
    pendingTestName = null;
    pendingLines = [];
  };

  const attachPendingToFailure = (testName: string): void => {
    current = { testName, context: [] };
    for (const buffered of pendingLines) {
      const bt = buffered.trim();
      if (!bt) continue;

      const location = extractLocation(buffered);
      if (location && !current.location) {
        current.location = location;
      }

      if (!current.error) {
        const goMessage = bt.match(/^[^:\s]+:\d+:\s*(.+)$/);
        if (goMessage?.[1]) {
          current.error = goMessage[1].trim();
        } else if (isErrorMessageLine(bt)) {
          current.error = normalizeErrorLine(bt);
        }
      }

      if (isContextLine(bt)) {
        current.context.push(bt);
      }
    }
    clearPending();
  };

  for (const line of lines) {
    const trimmed = line.trim();

    const runMatch = line.match(/^===\s+RUN\s+(\S+)/);
    if (runMatch?.[1]) {
      flush();
      clearPending();
      pendingTestName = runMatch[1];
      continue;
    }

    const passMatch = line.match(/^---\s+PASS:\s+([^\s(]+)\s+\([^)]+\)$/);
    if (passMatch?.[1]) {
      flush();
      clearPending();
      passed++;
      continue;
    }

    const failMatch = line.match(/^---\s+FAIL:\s+([^\s(]+)\s+\([^)]+\)$/);
    if (failMatch?.[1]) {
      flush();
      failed++;
      attachPendingToFailure(failMatch[1]);
      continue;
    }

    const skipMatch = line.match(/^---\s+SKIP:\s+([^\s(]+)\s+\([^)]+\)$/);
    if (skipMatch?.[1]) {
      flush();
      clearPending();
      skipped++;
      continue;
    }

    const pkgDuration = line.match(/^(?:ok|FAIL)\s+\S+\s+([0-9]+(?:\.[0-9]+)?s)\b/);
    if (pkgDuration?.[1]) {
      summary.duration = normalizeDuration(pkgDuration[1]);
    }

    if (pendingTestName && trimmed) {
      pendingLines.push(line);
    }

    if (!current) continue;
    if (!trimmed) continue;

    if (
      /^FAIL\s*$/.test(trimmed) ||
      /^(?:ok|FAIL)\s+\S+\s+\d+(?:\.\d+)?s\b/.test(trimmed)
    ) {
      flush();
      continue;
    }

    const active = current as FailureDetail;
    const location = extractLocation(line);
    if (location && !active.location) {
      active.location = location;
    }

    if (!active.error) {
      const goMessage = trimmed.match(/^[^:\s]+:\d+:\s*(.+)$/);
      if (goMessage?.[1]) {
        active.error = goMessage[1].trim();
      } else if (isErrorMessageLine(trimmed)) {
        active.error = normalizeErrorLine(trimmed);
      }
    }

    if (isContextLine(trimmed)) {
      active.context.push(trimmed);
    }
  }

  flush();

  summary.passed = passed;
  summary.failed = Math.max(failed, failures.length);
  summary.skipped = skipped;
  if (passed + failed + skipped > 0) {
    summary.total = passed + failed + skipped;
  }

  const hasFailMarker = /^FAIL\s*$/m.test(content) || /^FAIL\s+\S+\s+/m.test(content);
  const hasPassMarker = /^PASS\s*$/m.test(content) || /^ok\s+\S+\s+/m.test(content);

  const status: TestStatus =
    (summary.failed ?? 0) > 0 || failures.length > 0 || hasFailMarker
      ? "fail"
      : hasPassMarker || (summary.passed ?? 0) > 0
        ? "pass"
        : "unknown";

  return {
    runner: "go",
    status,
    summary: finalizeSummary(summary),
    failures: dedupeFailures(failures),
  };
}

function parseCargo(lines: string[], content: string): ParsedTestOutput {
  const summary: SummaryStats = {};
  const failures: FailureDetail[] = [];
  const failedTests = new Set<string>();

  for (const line of lines) {
    const failedTest = line.match(/^test\s+(.+?)\s+\.\.\.\s+FAILED$/);
    if (failedTest?.[1]) {
      failedTests.add(failedTest[1].trim());
    }

    const resultMatch = line.match(
      /^test result:\s*(ok|FAILED)\.\s*(\d+)\s+passed;\s*(\d+)\s+failed;\s*(\d+)\s+ignored;.*finished in\s+([0-9]+(?:\.[0-9]+)?s)/i
    );
    if (resultMatch) {
      summary.passed = Number(resultMatch[2]);
      summary.failed = Number(resultMatch[3]);
      summary.skipped = Number(resultMatch[4]);
      summary.duration = normalizeDuration(resultMatch[5]);
      continue;
    }

    mergeSummary(summary, parseCountsFromLine(line));
    const duration = extractDuration(line);
    if (duration) {
      summary.duration = duration;
    }
  }

  let current: FailureDetail | null = null;
  const flush = (): void => {
    if (!current) return;
    failures.push(sanitizeFailure(current));
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const header = line.match(/^-{4}\s+(.+?)\s+(?:stdout|stderr)\s+-{4}$/);
    if (header?.[1]) {
      flush();
      current = {
        testName: header[1].trim(),
        context: [],
      };
      continue;
    }

    if (!current) continue;
    if (!trimmed) continue;

    if (/^test result:/i.test(trimmed) || /^failures:\s*$/i.test(trimmed)) {
      flush();
      continue;
    }

    const location = extractLocation(line);
    if (location && !current.location) {
      current.location = location;
    }

    if (!current.error) {
      const panicMatch = trimmed.match(/^thread\s+'.+'\s+panicked\s+at\s+(.+)$/i);
      if (panicMatch?.[1]) {
        current.error = panicMatch[1].trim();
      } else if (isErrorMessageLine(trimmed)) {
        current.error = normalizeErrorLine(trimmed);
      }
    }

    if (isContextLine(trimmed)) {
      current.context.push(trimmed);
    }
  }

  flush();

  for (const name of failedTests) {
    if (!failures.some((failure) => normalizeFailureName(failure.testName) === normalizeFailureName(name))) {
      failures.push({ testName: name, context: [] });
    }
  }

  const dedupedFailures = dedupeFailures(failures);
  if (summary.failed === undefined && dedupedFailures.length > 0) {
    summary.failed = dedupedFailures.length;
  }

  const finalSummary = finalizeSummary(summary);
  const status: TestStatus =
    (finalSummary.failed ?? 0) > 0 || /test result:\s*FAILED\./i.test(content)
      ? "fail"
      : /test result:\s*ok\./i.test(content)
        ? "pass"
        : "unknown";

  return {
    runner: "cargo",
    status,
    summary: finalSummary,
    failures: dedupedFailures,
  };
}

function parseUnknown(lines: string[], content: string): ParsedTestOutput {
  const summary: SummaryStats = {};
  const failures: FailureDetail[] = [];

  for (const line of lines) {
    mergeSummary(summary, parseCountsFromLine(line));
    const duration = extractDuration(line);
    if (duration) {
      summary.duration = duration;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    const header = trimmed.match(/^(?:FAIL(?:ED)?|ERROR|✗|×)\s*[:\-]?\s*(.+)?$/iu);
    if (header) {
      failures.push({
        testName: header[1]?.trim() || "failure",
        context: [],
      });
      continue;
    }

    if (isErrorMessageLine(trimmed) || /\bassert\b/i.test(trimmed) || /\bpanic\b/i.test(trimmed)) {
      failures.push({
        testName: "failure",
        error: normalizeErrorLine(trimmed),
        context: [trimmed],
      });
    }
  }

  const dedupedFailures = dedupeFailures(failures);
  const finalSummary = finalizeSummary(summary);
  if (finalSummary.failed === undefined && dedupedFailures.length > 0) {
    finalSummary.failed = dedupedFailures.length;
  }

  const hasFailSignals = /\b(fail(?:ed)?|error|panic)\b/i.test(content);
  const hasPassSignals = /\b(pass(?:ed)?|ok)\b/i.test(content);

  let status: TestStatus = "unknown";
  if ((finalSummary.failed ?? 0) > 0 || dedupedFailures.length > 0 || hasFailSignals) {
    status = "fail";
  } else if ((finalSummary.passed ?? 0) > 0 || hasPassSignals) {
    status = "pass";
  }

  return {
    runner: "unknown",
    status,
    summary: finalSummary,
    failures: dedupedFailures,
  };
}

function parseByRunner(content: string, runner: RunnerName): ParsedTestOutput {
  const lines = content.split("\n");

  switch (runner) {
    case "pytest":
      return parsePytest(lines, content);
    case "jest":
      return parseJestLike(lines, content, "jest");
    case "vitest":
      return parseJestLike(lines, content, "vitest");
    case "go":
      return parseGo(lines, content);
    case "cargo":
      return parseCargo(lines, content);
    default:
      return parseUnknown(lines, content);
  }
}

function formatPassSummary(summary: SummaryStats): string {
  const passed = summary.passed ?? summary.total ?? 0;
  const testWord = passed === 1 ? "test" : "tests";
  const extras: string[] = [];
  if ((summary.skipped ?? 0) > 0) {
    extras.push(`${summary.skipped} skipped`);
  }
  if (summary.duration) {
    extras.push(summary.duration);
  }

  const suffix = extras.length > 0 ? ` (${extras.join(", ")})` : "";
  return `✓ ${passed} ${testWord} passed${suffix}`;
}

function formatFailSummary(summary: SummaryStats, failureCount: number): string {
  const failed = summary.failed ?? failureCount;
  const total = summary.total;

  const base =
    total !== undefined && total > 0
      ? `${failed}/${total} tests failed`
      : `${failed} ${failed === 1 ? "test" : "tests"} failed`;

  const extras: string[] = [];
  if (summary.passed !== undefined) {
    extras.push(`${summary.passed} passed`);
  }
  if ((summary.skipped ?? 0) > 0) {
    extras.push(`${summary.skipped} skipped`);
  }
  if (summary.duration) {
    extras.push(summary.duration);
  }

  return `✗ ${base}${extras.length > 0 ? ` (${extras.join(", ")})` : ""}`;
}

function formatUnknownSummary(summary: SummaryStats, content: string): string {
  if (content.trim() === "") {
    return "? No test output received";
  }

  const fragments: string[] = [];
  if (summary.total !== undefined) fragments.push(`${summary.total} total`);
  if (summary.passed !== undefined) fragments.push(`${summary.passed} passed`);
  if (summary.failed !== undefined) fragments.push(`${summary.failed} failed`);
  if ((summary.skipped ?? 0) > 0) fragments.push(`${summary.skipped} skipped`);
  if (summary.duration) fragments.push(summary.duration);

  if (fragments.length > 0) {
    return `? Unrecognized runner (${fragments.join(", ")})`;
  }

  return "? Unrecognized test output";
}

function formatFailureBlocks(failures: FailureDetail[]): string[] {
  const output: string[] = [];
  const normalized = dedupeFailures(failures);

  for (const failure of normalized) {
    output.push("");
    output.push(`FAIL ${failure.testName}`);

    if (failure.location) {
      output.push(`  at ${failure.location}`);
    }

    if (failure.error) {
      output.push(`  ${failure.error}`);
    }

    for (const contextLine of failure.context.slice(0, 4)) {
      if (failure.error && contextLine === failure.error) continue;
      output.push(`  ${contextLine}`);
    }
  }

  return output;
}

function buildOutputLines(parsed: ParsedTestOutput, content: string): string[] {
  const lines: string[] = [];

  if (parsed.status === "pass") {
    lines.push(formatPassSummary(parsed.summary));
    return collapseBlanks(lines);
  }

  if (parsed.status === "fail") {
    lines.push(formatFailSummary(parsed.summary, parsed.failures.length));
    lines.push(...formatFailureBlocks(parsed.failures));
    return collapseBlanks(lines);
  }

  lines.push(formatUnknownSummary(parsed.summary, content));
  if (parsed.failures.length > 0) {
    lines.push(...formatFailureBlocks(parsed.failures));
  }
  return collapseBlanks(lines);
}

function isFailureLine(line: string): boolean {
  const trimmed = line.trim();
  return FAILURE_LINE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function smartTruncate(lines: string[], maxLines: number): string[] {
  if (maxLines <= 0 || lines.length <= maxLines) return lines;
  if (maxLines === 1) {
    return [`... (${lines.length} lines omitted) ...`];
  }

  const failureIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isFailureLine(lines[i] ?? "")) {
      failureIndices.push(i);
    }
  }

  if (failureIndices.length > 0) {
    const failureStart = Math.max(0, (failureIndices[0] ?? 0) - 2);
    const failureEnd = Math.min(lines.length, (failureIndices[failureIndices.length - 1] ?? 0) + 3);
    const failureSectionSize = failureEnd - failureStart;

    if (failureSectionSize < maxLines * 0.7) {
      const remainingBudget = maxLines - failureSectionSize;
      const contextBudget = Math.max(0, remainingBudget - 2);
      const headCount = Math.min(Math.floor(contextBudget * 0.4), failureStart);
      const tailCount = Math.min(contextBudget - headCount, lines.length - failureEnd);

      const result: string[] = [];
      for (let i = 0; i < headCount; i++) {
        result.push(lines[i] ?? "");
      }

      if (headCount < failureStart) {
        result.push(`... (${failureStart - headCount} lines omitted) ...`);
      }

      for (let i = failureStart; i < failureEnd; i++) {
        result.push(lines[i] ?? "");
      }

      const tailStart = lines.length - tailCount;
      if (failureEnd < tailStart) {
        result.push(`... (${tailStart - failureEnd} lines omitted) ...`);
      }

      for (let i = tailStart; i < lines.length; i++) {
        result.push(lines[i] ?? "");
      }

      return result;
    }
  }

  const headCount = Math.floor(maxLines * 0.4);
  const tailCount = maxLines - headCount - 1;

  const tailStart = lines.length - tailCount;
  const omittedCount = tailStart - headCount;

  if (omittedCount <= 0) return lines;

  const result: string[] = [];
  for (let i = 0; i < headCount; i++) {
    result.push(lines[i] ?? "");
  }
  result.push(`... (${omittedCount} lines omitted) ...`);
  for (let i = tailStart; i < lines.length; i++) {
    result.push(lines[i] ?? "");
  }

  return result;
}

function smartTruncateByTokens(lines: string[], maxTokens: number): { lines: string[]; budgetExceeded: boolean } {
  let totalTokens = 0;
  for (const line of lines) {
    totalTokens += estimateTokens(line + "\n");
  }
  if (totalTokens <= maxTokens) {
    return { lines, budgetExceeded: false };
  }

  const tokenCache = new Map<number, number>();
  const tokensFor = (lineBudget: number): number => {
    const cached = tokenCache.get(lineBudget);
    if (cached !== undefined) return cached;
    const truncated = smartTruncate(lines, lineBudget);
    const tokens = truncated.reduce((sum, line) => sum + estimateTokens(line + "\n"), 0);
    tokenCache.set(lineBudget, tokens);
    return tokens;
  };

  const step = Math.max(1, Math.floor(Math.sqrt(lines.length)));
  let bestMaxLines = 1;
  let firstFit = 0;
  let lastOver = lines.length + 1;

  for (let tryLines = lines.length; tryLines >= 1; tryLines -= step) {
    if (tokensFor(tryLines) <= maxTokens) {
      firstFit = tryLines;
      break;
    }
    lastOver = tryLines;
  }

  if (firstFit === 0) {
    if (tokensFor(1) <= maxTokens) {
      firstFit = 1;
      lastOver = Math.min(lines.length + 1, 1 + step);
    } else {
      return { lines: smartTruncate(lines, 1), budgetExceeded: true };
    }
  }

  bestMaxLines = firstFit;
  const refineTop = Math.min(lines.length, lastOver - 1);
  for (let tryLines = refineTop; tryLines > firstFit; tryLines--) {
    if (tokensFor(tryLines) <= maxTokens) {
      bestMaxLines = tryLines;
      break;
    }
  }

  return {
    lines: smartTruncate(lines, Math.max(1, bestMaxLines)),
    budgetExceeded: false,
  };
}

export class TestCompressor {
  compress(content: string, options?: TestOptions): CompressResult {
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const originalLines = normalized.split("\n");

    const originalLineCount = originalLines.length;
    const originalCharCount = content.length;

    const maxLines = sanitizeLimit(options?.maxLines);
    const maxTokens = sanitizeLimit(options?.maxTokens);

    const detectedRunner = detectRunner(normalized);
    const runner = options?.runner ?? detectedRunner;
    const parsed = parseByRunner(normalized, runner);

    let lines = buildOutputLines(parsed, normalized);

    let budgetExceeded = false;
    const footerEstimatedLines = 1;
    const footerEstimatedTokens = 25;
    let includeStats = true;

    if (maxLines !== undefined && maxLines <= footerEstimatedLines) {
      includeStats = false;
    }
    if (maxTokens !== undefined && maxTokens <= footerEstimatedTokens) {
      includeStats = false;
    }

    const effectiveMaxLines =
      maxLines !== undefined
        ? Math.max(1, maxLines - (includeStats ? footerEstimatedLines : 0))
        : undefined;
    const effectiveMaxTokens =
      maxTokens !== undefined
        ? Math.max(1, maxTokens - (includeStats ? footerEstimatedTokens : 0))
        : undefined;

    if (effectiveMaxLines !== undefined && lines.length > effectiveMaxLines) {
      lines = smartTruncate(lines, effectiveMaxLines);
    }

    if (effectiveMaxTokens !== undefined) {
      const truncated = smartTruncateByTokens(lines, effectiveMaxTokens);
      lines = truncated.lines;
      budgetExceeded = truncated.budgetExceeded;
    }

    const compressedContent = lines.join("\n");
    const compressedLineCount = lines.length;
    const compressedCharCount = compressedContent.length;

    const rawSavedPercent =
      originalCharCount > 0
        ? Math.round((1 - compressedCharCount / originalCharCount) * 100)
        : 0;
    const savedPercent = Math.max(0, rawSavedPercent);
    const statsLine = `--- air: ${originalLineCount} lines → ${compressedLineCount} lines (${savedPercent}% saved) ---`;

    const output = includeStats ? `${compressedContent}\n${statsLine}` : compressedContent;
    const summary = finalizeSummary(parsed.summary);

    return {
      output,
      originalSize: originalLineCount,
      compressedSize: compressedLineCount,
      ratio: originalLineCount > 0 ? compressedLineCount / originalLineCount : 1,
      format: "air-test",
      metadata: {
        originalLines: originalLineCount,
        compressedLines: compressedLineCount,
        savedPercent,
        runner: parsed.runner,
        detectedRunner,
        status: parsed.status,
        total: summary.total,
        passed: summary.passed,
        failed: summary.failed,
        skipped: summary.skipped,
        duration: summary.duration,
        failureCount: parsed.failures.length,
        budgetExceeded,
        statsIncluded: includeStats,
      },
    };
  }
}
