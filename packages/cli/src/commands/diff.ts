import { Command } from "commander";
import { DiffCompressor } from "@10iii/air-core";
import { readFileSync, fstatSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * Check if stdin is a pipe (has data being piped in)
 */
function isStdinPipe(): boolean {
  try {
    return fstatSync(0).isFIFO();
  } catch {
    return false;
  }
}

function strictParseInt(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) return NaN;
  return Number(value);
}

function requirePositiveInteger(
  label: string,
  value: number | undefined
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0) {
    process.stderr.write(`Error: --${label} must be a positive integer\n`);
    process.exit(1);
  }
  return Math.floor(value);
}

/**
 * `air diff` - Compress git diff output for AI consumption.
 *
 * Two modes:
 * 1. Execute git diff and compress: `air diff [ref]` (e.g., `air diff HEAD~3`)
 * 2. Pipe existing output via stdin: `git diff | air diff`
 */
export const diffCommand = new Command("diff")
  .description("Compress git diff output for AI consumption")
  .argument("[ref]", "Git ref to diff against (e.g., HEAD~3, main, commit-hash)")
  .allowUnknownOption()
  .passThroughOptions()
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--level <level>", "Detail level: summary, compact, or full", "compact")
  .action(
    (
      ref: string | undefined,
      options: {
        maxLines?: number;
        maxTokens?: number;
        level?: string;
      }
    ) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);

      const validLevels = ["summary", "compact", "full"];
      if (options.level && !validLevels.includes(options.level)) {
        process.stderr.write(
          `Error: --level must be one of: ${validLevels.join(", ")}\n`
        );
        process.exit(1);
      }

      let content: string;

      if (isStdinPipe()) {
        // Pipe mode: read from stdin
        content = readFileSync(0, "utf-8");
      } else {
        // Direct mode: execute git diff
        const args = ref ? ["diff", ref] : ["diff"];
        const result = spawnSync("git", args, {
          encoding: "utf-8",
          stdio: ["inherit", "pipe", "pipe"],
          maxBuffer: 50 * 1024 * 1024,
        });

        content = (result.stdout ?? "") + (result.stderr ?? "");
        if (result.error) {
          process.stderr.write(`Error: ${result.error.message}\n`);
          process.exit(1);
        }
        if (!content.trim()) {
          content = "No changes";
        }
      }

      const compressor = new DiffCompressor();
      const result = compressor.compress(content, {
        maxLines,
        maxTokens,
        level: (options.level as "summary" | "compact" | "full") ?? "compact",
      });

      process.stdout.write(result.output + "\n");
    }
  );
