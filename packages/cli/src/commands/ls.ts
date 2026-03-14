import { Command } from "commander";
import { LsCompressor } from "@10iii/air-core";
import { readFileSync } from "node:fs";

function strictParseInt(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) return NaN;
  return Number(value);
}

function parseNonnegativeInt(value: string): number {
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

function requireNonnegativeInteger(
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

export const lsCommand = new Command("ls")
  .description("Compress directory listing output for AI consumption")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--max-depth <n>", "Maximum depth to display", parseNonnegativeInt)
  .option("--group-by-type", "Group files by extension")
  .action(
    (options: {
      maxLines?: number;
      maxTokens?: number;
      maxDepth?: number;
      groupByType?: boolean;
    }) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);
      const maxDepth = requireNonnegativeInteger("max-depth", options.maxDepth);
      const content = readFileSync(0, "utf-8");

      const compressor = new LsCompressor();
      const result = compressor.compress(content, {
        maxLines,
        maxTokens,
        maxDepth,
        groupByType: options.groupByType ?? false,
      });

      process.stdout.write(result.output + "\n");
    }
  );
