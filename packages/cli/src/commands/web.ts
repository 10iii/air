import { Command } from "commander";
import { WebCompressor } from "@10iii/air-core";
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

function parseFormat(value: string): "markdown" | "text" {
  if (value === "markdown" || value === "text") {
    return value;
  }
  process.stderr.write("Error: --format must be either 'markdown' or 'text'\n");
  process.exit(1);
}

export const webCommand = new Command("web")
  .description("Compress HTML content into clean article-focused output")
  .option("--url <url>", "Page URL used for extraction context")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--format <type>", "Output format: markdown|text", parseFormat)
  .option("--code-only", "Extract only fenced code blocks")
  .option("--score", "Include content density score line")
  .action(
    (options: {
      url?: string;
      maxLines?: number;
      maxTokens?: number;
      format?: "markdown" | "text";
      codeOnly?: boolean;
      score?: boolean;
    }) => {
      const input = readFileSync(0, "utf-8");
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);

      const compressor = new WebCompressor();
      const result = compressor.compress(input, {
        url: options.url,
        maxLines,
        maxTokens,
        format: options.format ?? "markdown",
        codeOnly: options.codeOnly ?? false,
        score: options.score ?? false,
      });

      process.stdout.write(result.output + "\n");
    }
  );
