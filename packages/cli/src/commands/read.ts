import { Command } from "commander";
import { ReadCompressor } from "@10iii/air-core";
import { readFileSync, statSync } from "node:fs";

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
    process.stderr.write(`Error: --${label} must be a positive integer\n`);
    process.exit(1);
  }
  return Math.floor(value);
}

export const readCommand = new Command("read")
  .description("Compress file content for AI consumption")
  .argument("<file>", "File path to read")
  .option("--line-numbers", "Keep line number prefixes")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--no-collapse-comments", "Don't collapse comment blocks")
  .option("--no-collapse-imports", "Don't collapse import blocks")
  .option("--no-collapse-blanks", "Don't collapse blank lines")
  .option("--mode <mode>", "Output mode: full or skeleton", "full")
  .option("--use-tree-sitter", "Use tree-sitter for skeleton mode (async, requires web-tree-sitter)")
  .action(
    async (
      file: string,
      options: {
        lineNumbers?: boolean;
        maxLines?: number;
        maxTokens?: number;
        collapseComments?: boolean;
        collapseImports?: boolean;
        collapseBlanks?: boolean;
        mode?: string;
        useTreeSitter?: boolean;
      }
    ) => {
      let content: string;
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);

      const mode = options.mode ?? "full";
      if (mode !== "full" && mode !== "skeleton") {
        process.stderr.write(`Error: --mode must be "full" or "skeleton"\n`);
        process.exit(1);
      }

      if (file === "-") {
        content = readFileSync(0, "utf-8");
      } else {
        try {
          const stat = statSync(file);
          if (stat.isDirectory()) {
            process.stderr.write(`Error: '${file}' is a directory, not a file\n`);
            process.exit(1);
          }
          content = readFileSync(file, "utf-8");
        } catch (err: unknown) {
          const e = err as NodeJS.ErrnoException;
          if (e.code === "ENOENT") {
            process.stderr.write(`Error: File not found: ${file}\n`);
          } else if (e.code === "EISDIR") {
            process.stderr.write(`Error: '${file}' is a directory, not a file\n`);
          } else {
            process.stderr.write(`Error reading file: ${e.message}\n`);
          }
          process.exit(1);
        }
      }

      const compressor = new ReadCompressor();
      const compressOpts = {
        lineNumbers: options.lineNumbers ?? false,
        maxLines,
        maxTokens,
        collapseComments: options.collapseComments ?? true,
        collapseImports: options.collapseImports ?? true,
        collapseBlanks: options.collapseBlanks ?? true,
        fileName: file,
        mode: mode as "full" | "skeleton",
        useTreeSitter: options.useTreeSitter ?? false,
      };

      const result = options.useTreeSitter
        ? await compressor.compressAsync(content, compressOpts)
        : compressor.compress(content, compressOpts);

      process.stdout.write(result.output + "\n");
    }
  );
