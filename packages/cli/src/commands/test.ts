import { Command } from "commander";
import { TestCompressor } from "@10iii/air-core";
import type { TestRunner } from "@10iii/air-core";
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

function parseRunner(value: string): TestRunner {
  const normalized = value.toLowerCase();
  if (
    normalized === "pytest" ||
    normalized === "jest" ||
    normalized === "vitest" ||
    normalized === "go" ||
    normalized === "cargo"
  ) {
    return normalized;
  }

  process.stderr.write(
    "Error: --runner must be one of: pytest, jest, vitest, go, cargo\n"
  );
  process.exit(1);
}

export const testCommand = new Command("test")
  .description("Compress test runner output for AI consumption")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--runner <name>", "Force test runner parser", parseRunner)
  .action(
    (options: { maxLines?: number; maxTokens?: number; runner?: TestRunner }) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);

      const input = readFileSync(0, "utf-8");

      const compressor = new TestCompressor();
      const result = compressor.compress(input, {
        maxLines,
        maxTokens,
        runner: options.runner,
      });

      process.stdout.write(result.output + "\n");
    }
  );
