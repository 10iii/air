import { Command } from "commander";
import { LsCompressor } from "@10iii/air-core";
import { readFileSync, fstatSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { COMMAND_HELP, showHelpAndExit } from "../help.js";

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
    showHelpAndExit("ls", `--${label} must be a positive integer`);
  }
  return Math.floor(value);
}

function requireNonnegativeInteger(
  label: string,
  value: number | undefined
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    showHelpAndExit("ls", `--${label} must be a non-negative integer`);
  }
  return Math.floor(value);
}

const helpText = COMMAND_HELP.ls?.fullHelp ?? "";

/**
 * `air ls` - Compress directory listing output for AI consumption.
 *
 * Two modes:
 * 1. Execute ls and compress output: `air ls <path>`
 * 2. Pipe existing output via stdin: `ls -la | air ls`
 */
export const lsCommand = new Command("ls")
  .description("Compress directory listing output for AI consumption")
  .argument("[path]", "Path to list (executes ls if provided)")
  .allowUnknownOption()
  .passThroughOptions()
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--max-depth <n>", "Maximum depth to display", parseNonnegativeInt)
  .option("--group-by-type", "Group files by extension")
  .configureHelp({ formatHelp: () => helpText })
  .action(
    (
      path: string | undefined,
      options: {
        maxLines?: number;
        maxTokens?: number;
        maxDepth?: number;
        groupByType?: boolean;
      }
    ) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);
      const maxDepth = requireNonnegativeInteger("max-depth", options.maxDepth);

      let content: string;

      if (isStdinPipe()) {
        // Pipe mode: read from stdin
        content = readFileSync(0, "utf-8");
      } else {
        // Direct mode: execute ls
        const targetPath = path ?? ".";
        const args = ["-la", targetPath];
        const result = spawnSync("ls", args, {
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
          content = `Directory ${targetPath} is empty or does not exist`;
        }
      }

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
