import { Command } from "commander";
import { GrepCompressor } from "@10iii/air-core";
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

function strictParseNonNegativeInt(value: string): number {
  if (!/^\d+$/.test(value)) return NaN;
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

function requireNonNegativeInteger(
  label: string,
  value: number | undefined
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    process.stderr.write(`Error: --${label} must be a non-negative integer\n`);
    process.exit(1);
  }
  return Math.floor(value);
}

/**
 * `air grep` - Compress grep/ripgrep output for AI consumption.
 *
 * Two modes:
 * 1. Execute a search and compress output: `air grep "pattern" [path]`
 * 2. Pipe existing output via stdin: `rg "pattern" | air grep`
 */
export const grepCommand = new Command("grep")
  .description("Compress grep/ripgrep output for AI consumption")
  .argument("[pattern]", "Pattern to search for")
  .argument("[path]", "Path to search in (default: current directory)")
  .allowUnknownOption()
  .passThroughOptions()
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--max-files <n>", "Maximum files to show", strictParseInt)
  .option("--merge-distance <n>", "Merge matches within N lines", strictParseNonNegativeInt)
  .option("--files-only", "Show only filenames and match counts")
  .action(
    (
      pattern: string | undefined,
      path: string | undefined,
      options: {
        maxLines?: number;
        maxTokens?: number;
        maxFiles?: number;
        mergeDistance?: number;
        filesOnly?: boolean;
      }
    ) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);
      const maxFiles = requirePositiveInteger("max-files", options.maxFiles);
      const mergeDistance = requireNonNegativeInteger("merge-distance", options.mergeDistance);

      let content: string;

      if (isStdinPipe()) {
        // Pipe mode: read from stdin
        content = readFileSync(0, "utf-8");
      } else if (!pattern) {
        // No pattern and no pipe - error
        process.stderr.write("Error: pattern required for direct mode. Usage: air grep <pattern> [path]\n");
        process.exit(1);
      } else {
        // Direct mode: execute rg or grep
        const searchPath = path || ".";
        
        // Try rg first, fall back to grep
        const rgResult = spawnSync("rg", ["--line-number", pattern, searchPath], {
          encoding: "utf-8",
          stdio: ["inherit", "pipe", "pipe"],
          maxBuffer: 50 * 1024 * 1024,
        });

        if (rgResult.error && (rgResult.error as NodeJS.ErrnoException).code === "ENOENT") {
          // rg not found, try grep
          const grepResult = spawnSync("grep", ["-rn", pattern, searchPath], {
            encoding: "utf-8",
            stdio: ["inherit", "pipe", "pipe"],
            maxBuffer: 50 * 1024 * 1024,
          });

          if (grepResult.error) {
            process.stderr.write(`Error: Neither rg nor grep available: ${grepResult.error.message}\n`);
            process.exit(1);
          }
          content = (grepResult.stdout ?? "") + (grepResult.stderr ?? "");
        } else {
          content = (rgResult.stdout ?? "") + (rgResult.stderr ?? "");
        }

        if (!content.trim()) {
          content = `No matches found for "${pattern}" in ${searchPath}`;
        }
      }

      const compressor = new GrepCompressor();
      const result = compressor.compress(content, {
        maxLines,
        maxTokens,
        maxFiles,
        mergeDistance,
        filesOnly: options.filesOnly ?? false,
      });

      process.stdout.write(result.output + "\n");
    }
  );
