import { Command } from "commander";
import { SessionCompressor } from "@10iii/air-core";
import { readFileSync, existsSync } from "node:fs";
import { isatty } from "node:tty";
import { strictParseInt, requirePositiveInteger } from "../utils.js";
import { COMMAND_HELP, showHelpAndExit } from "../help.js";

function parseStrategy(value: string): string {
  const valid = ["time-decay", "tool-focused", "balanced"];
  if (!valid.includes(value)) {
    showHelpAndExit("session", `--strategy must be one of: ${valid.join(", ")}`);
  }
  return value;
}

const helpText = COMMAND_HELP.session?.fullHelp ?? "";

export const sessionCommand = new Command("session")
  .description("Compress AI chat session/conversation data")
  .argument("[file]", "Session JSON file to read (if not provided, reads from stdin)")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--max-messages <n>", "Maximum messages to include", strictParseInt)
  .option("--strategy <type>", "Compression strategy (time-decay, tool-focused, balanced)", parseStrategy)
  .configureHelp({ formatHelp: () => helpText })
  .action(
    (
      fileArg: string | undefined,
      options: {
        maxLines?: number;
        maxTokens?: number;
        maxMessages?: number;
        strategy?: string;
      }
    ) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);
      const maxMessages = requirePositiveInteger("max-messages", options.maxMessages);

      let content: string;

      if (fileArg) {
        if (!existsSync(fileArg)) {
          showHelpAndExit("session", `File not found: ${fileArg}`);
        }
        content = readFileSync(fileArg, "utf-8");
      } else if (!isatty(0)) {
        content = readFileSync(0, "utf-8");
      } else {
        showHelpAndExit("session");
      }

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
