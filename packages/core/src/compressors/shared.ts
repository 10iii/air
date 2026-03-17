/**
 * Shared utilities for AIR compressors.
 * Internal module — not exported from the package.
 */
import { estimateTokens } from "../utils/index.js";

/**
 * Sanitize a value intended to be a positive integer.
 * Returns undefined for non-finite, non-positive, or non-number values.
 */
export function sanitizePositiveInt(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

/**
 * Smart line truncation: keeps head (60%) and tail (40%) with an omission marker.
 */
export function smartTruncateLines(lines: string[], maxLines: number): string[] {
  if (maxLines <= 0 || lines.length <= maxLines) return lines;
  if (maxLines === 1) {
    return [`... (${lines.length} lines omitted) ...`];
  }

  const availableBudget = maxLines - 1;
  const headCount = Math.max(1, Math.floor(availableBudget * 0.6));
  const tailCount = availableBudget - headCount;

  const tailStart = lines.length - tailCount;
  const omittedCount = tailStart - headCount;

  if (omittedCount <= 0) return lines;

  const result: string[] = [];
  for (let i = 0; i < headCount; i++) {
    result.push(lines[i]);
  }
  result.push(`... (${omittedCount} lines omitted) ...`);
  for (let i = tailStart; i < lines.length; i++) {
    result.push(lines[i]);
  }
  return result;
}

/**
 * Smart token-based truncation using binary search over smartTruncateLines.
 */
export function smartTruncateByTokens(
  lines: string[],
  maxTokens: number,
): { lines: string[]; budgetExceeded: boolean } {
  let totalTokens = 0;
  for (const line of lines) {
    totalTokens += estimateTokens(line + "\n");
  }
  if (totalTokens <= maxTokens) return { lines, budgetExceeded: false };

  let lo = 1;
  let hi = lines.length;
  let bestFit = 1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const truncated = smartTruncateLines(lines, mid);
    const tokens = truncated.reduce(
      (sum, line) => sum + estimateTokens(line + "\n"),
      0,
    );
    if (tokens <= maxTokens) {
      bestFit = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return {
    lines: smartTruncateLines(lines, bestFit),
    budgetExceeded: bestFit === 1 && estimateTokens(lines[0] + "\n") > maxTokens,
  };
}
