import { Command } from "commander";
import { GrepCompressor } from "@10iii/air-core";
import { readFileSync } from "node:fs";

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

export const grepCommand = new Command("grep")
  .description("Compress grep/ripgrep output for AI consumption")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--max-files <n>", "Maximum files to show", strictParseInt)
  .option("--merge-distance <n>", "Merge matches within N lines", strictParseNonNegativeInt)
  .option("--files-only", "Show only filenames and match counts")
  .action(
    (options: {
      maxLines?: number;
      maxTokens?: number;
      maxFiles?: number;
      mergeDistance?: number;
      filesOnly?: boolean;
    }) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);
      const maxFiles = requirePositiveInteger("max-files", options.maxFiles);
      const mergeDistance = requireNonNegativeInteger("merge-distance", options.mergeDistance);
      const content = readFileSync(0, "utf-8");

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
