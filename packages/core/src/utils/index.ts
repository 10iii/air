/**
 * Shared utility functions for AIR compressors.
 * CR-05 + CR-06: Extracted from read.ts and bash.ts to eliminate duplication.
 */

/** Estimate token count from text (chars / 4 heuristic). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Collapse consecutive blank lines into a single blank line.
 */
export function collapseBlanks(lines: string[]): string[] {
  const result: string[] = [];
  let prevBlank = false;

  for (const line of lines) {
    const isBlank = line.trim() === "";
    if (isBlank) {
      if (!prevBlank) {
        result.push("");
      }
      prevBlank = true;
    } else {
      result.push(line);
      prevBlank = false;
    }
  }

  return result;
}
