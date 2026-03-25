import { Command } from "commander";
import { BashCompressor } from "@10iii/air-core";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { COMMAND_HELP, showHelpAndExit } from "../help.js";

// R2-03: Strict positive integer parser — rejects '10foo', '1e3', etc.
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
    showHelpAndExit("bash", `--${label} must be a positive integer`);
  }
  return Math.floor(value);
}

const helpText = COMMAND_HELP.bash?.fullHelp ?? "";

/**
 * `air bash` - Compress bash/terminal output for AI consumption.
 *
 * Two modes:
 * 1. Execute a command and compress its output: `air bash "npm install"`
 * 2. Pipe existing output via stdin: `npm install 2>&1 | air bash`
 */
export const bashCommand = new Command("bash")
  .description("Compress bash/terminal output for AI consumption")
  .argument("[command...]", "Command to execute and compress output")
  .allowUnknownOption()
  .passThroughOptions()
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--no-strip-ansi", "Don't strip ANSI escape codes")
  .option("--no-collapse-blanks", "Don't collapse blank lines")
  .option("--no-collapse-repeats", "Don't collapse repeated lines")
  .option("--no-filter-noise", "Don't filter noise patterns")
  .configureHelp({ formatHelp: () => helpText })
  .action(
    (
      command: string[],
      options: {
        maxLines?: number;
        maxTokens?: number;
        stripAnsi?: boolean;
        collapseBlanks?: boolean;
        collapseRepeats?: boolean;
        filterNoise?: boolean;
      }
    ) => {
      let content: string;
      let commandHint: string | undefined;
      let commandExitCode: number | undefined;

      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);

      if (command.length === 0) {
        content = readFileSync(0, "utf-8");
      } else {
        commandHint = command.join(" ");
        const proc =
          command.length === 1
            ? spawnSync(command[0], {
                encoding: "utf-8" as const,
                stdio: ["inherit", "pipe", "pipe"],
                maxBuffer: 50 * 1024 * 1024,
                shell: true,
              })
            : spawnSync(command[0], command.slice(1), {
                encoding: "utf-8" as const,
                stdio: ["inherit", "pipe", "pipe"],
                maxBuffer: 50 * 1024 * 1024,
                shell: false,
              });

        const stdout = proc.stdout ?? "";
        const stderr = proc.stderr ?? "";

        content = stdout + (stderr ? "\n" + stderr : "");
        if (proc.error) {
          content = content
            ? `${content}\n${proc.error.message}`
            : `Command execution failed: ${proc.error.message}`;
        }
        if (!content.trim()) {
          if (proc.status !== null) {
            content = `Command exited with code ${proc.status}`;
          } else {
            content = "Command produced no output";
          }
        }

        // R2-04: Handle signal-killed processes (proc.status is null when killed by signal)
        commandExitCode = proc.status ?? (proc.signal ? 128 : proc.error ? 1 : 0);
      }

      const compressor = new BashCompressor();
      const result = compressor.compress(content, {
        maxLines,
        maxTokens,
        stripAnsi: options.stripAnsi ?? true,
        collapseBlanks: options.collapseBlanks ?? true,
        collapseRepeats: options.collapseRepeats ?? true,
        filterNoise: options.filterNoise ?? true,
        command: commandHint,
      });

      process.stdout.write(result.output + "\n");

      if (commandExitCode !== undefined) {
        process.exitCode = commandExitCode;
      }
    }
  );
