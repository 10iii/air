import { Command } from "commander";
import { DiffCompressor } from "@10iii/air-core";
import { readFileSync } from "node:fs";

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

export const diffCommand = new Command("diff")
  .description("Compress git diff output for AI consumption")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--level <level>", "Detail level: summary, compact, or full", "compact")
  .action(
    (options: {
      maxLines?: number;
      maxTokens?: number;
      level?: string;
    }) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);

      const validLevels = ["summary", "compact", "full"];
      if (options.level && !validLevels.includes(options.level)) {
        process.stderr.write(
          `Error: --level must be one of: ${validLevels.join(", ")}\n`
        );
        process.exit(1);
      }

      const content = readFileSync(0, "utf-8");

      const compressor = new DiffCompressor();
      const result = compressor.compress(content, {
        maxLines,
        maxTokens,
        level: (options.level as "summary" | "compact" | "full") ?? "compact",
      });

      process.stdout.write(result.output + "\n");
    }
  );
