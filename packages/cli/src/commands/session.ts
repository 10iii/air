import { Command } from "commander";
import { SessionCompressor } from "@10iii/air-core";
import { readFileSync } from "node:fs";
import { strictParseInt, requirePositiveInteger } from "../utils.js";

function parseStrategy(value: string): string {
  const valid = ["time-decay", "tool-focused", "balanced"];
  if (!valid.includes(value)) {
    process.stderr.write(`Error: --strategy must be one of: ${valid.join(", ")}\n`);
    process.exit(1);
  }
  return value;
}

export const sessionCommand = new Command("session")
  .description("Compress AI chat session/conversation data")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--max-messages <n>", "Maximum messages to include", strictParseInt)
  .option("--strategy <type>", "Compression strategy (time-decay, tool-focused, balanced)", parseStrategy)
  .action(
    (options: {
      maxLines?: number;
      maxTokens?: number;
      maxMessages?: number;
      strategy?: string;
    }) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);
      const maxMessages = requirePositiveInteger("max-messages", options.maxMessages);
      const content = readFileSync(0, "utf-8");

      const compressor = new SessionCompressor();
      const result = compressor.compress(content, {
        maxLines,
        maxTokens,
        maxMessages,
        strategy: options.strategy,
      });

      process.stdout.write(result.output + "\n");
    }
  );
