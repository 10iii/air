import { Command } from "commander";
import { TestCompressor } from "@10iii/air-core";
import type { TestRunner } from "@10iii/air-core";
import { readFileSync, existsSync } from "node:fs";
import { isatty } from "node:tty";
import { spawnSync } from "node:child_process";

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
  .description("Run test command and compress output, or compress piped test output")
  .argument("[command...]", "Test command to execute (e.g., npm test, pytest)")
  .allowUnknownOption()
  .passThroughOptions()
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--runner <name>", "Force test runner parser", parseRunner)
  .action(
    (
      command: string[],
      options: { maxLines?: number; maxTokens?: number; runner?: TestRunner }
    ) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);

      let input: string;
      let detectedRunner: TestRunner | undefined = options.runner;

      if (command.length > 0) {
        const cmdStr = command.join(" ");
        
        if (!detectedRunner) {
          if (cmdStr.includes("pytest") || cmdStr.includes("python -m pytest")) {
            detectedRunner = "pytest";
          } else if (cmdStr.includes("jest")) {
            detectedRunner = "jest";
          } else if (cmdStr.includes("vitest")) {
            detectedRunner = "vitest";
          } else if (cmdStr.includes("go test")) {
            detectedRunner = "go";
          } else if (cmdStr.includes("cargo test")) {
            detectedRunner = "cargo";
          }
        }

        const proc = command.length === 1
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
        input = stdout + (stderr ? "\n" + stderr : "");
        
        if (proc.error) {
          input = input
            ? `${input}\n${proc.error.message}`
            : `Command execution failed: ${proc.error.message}`;
        }
        if (!input.trim()) {
          input = proc.status !== null
            ? `Test command exited with code ${proc.status}`
            : "Test command produced no output";
        }
      } else if (!isatty(0)) {
        input = readFileSync(0, "utf-8");
      } else {
        process.stderr.write("Usage: air test <command> [options]\n");
        process.stderr.write("       npm test | air test [options]\n");
        process.exit(1);
      }

      const compressor = new TestCompressor();
      const result = compressor.compress(input, {
        maxLines,
        maxTokens,
        runner: detectedRunner,
      });

      process.stdout.write(result.output + "\n");
    }
  );
