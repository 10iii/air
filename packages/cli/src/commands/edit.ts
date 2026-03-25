import { Command } from "commander";
import { EditCompressor } from "@10iii/air-core";
import { readFileSync, existsSync } from "node:fs";
import { isatty } from "node:tty";

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

interface EditInput {
  content: string;
  edits: Array<{
    search: string;
    replace: string;
    context?: string;
    occurrence?: number;
  }>;
}

function parseEditInput(raw: string): EditInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    process.stderr.write(
      'Error: stdin must be valid JSON with { "content": "...", "edits": [...] }\n'
    );
    process.exit(1);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("content" in parsed) ||
    !("edits" in parsed) ||
    typeof (parsed as EditInput).content !== "string" ||
    !Array.isArray((parsed as EditInput).edits)
  ) {
    process.stderr.write(
      'Error: JSON must have { "content": string, "edits": Array<{ search, replace }> }\n'
    );
    process.exit(1);
  }

  return parsed as EditInput;
}

export const editCommand = new Command("edit")
  .description(
    "Edit file with search/replace, or compress edit results from JSON stdin"
  )
  .argument("[file]", "File to edit (if not provided, reads JSON from stdin)")
  .option("-s, --search <text>", "Text to search for (requires --replace)")
  .option("-r, --replace <text>", "Text to replace with (requires --search)")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--file-name <name>", "File name for language detection")
  .option("--dry-run", "Preview changes without applying")
  .option(
    "--fuzzy-threshold <n>",
    "Levenshtein distance threshold for fuzzy matching (0-1)",
    parseFloat
  )
  .option("--no-fuzzy", "Disable fuzzy matching")
  .option(
    "--line-ending <mode>",
    'Line ending mode: "auto" (preserve original), "lf", "preserve"',
  )
  .action(
    (
      fileArg: string | undefined,
      options: {
        search?: string;
        replace?: string;
        maxLines?: number;
        maxTokens?: number;
        fileName?: string;
        dryRun?: boolean;
        fuzzyThreshold?: number;
        fuzzy?: boolean;
        lineEnding?: string;
      }
    ) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);

      if (options.fuzzyThreshold !== undefined && (options.fuzzyThreshold < 0 || options.fuzzyThreshold > 1)) {
        process.stderr.write("Error: --fuzzy-threshold must be between 0 and 1\n");
        process.exit(1);
      }

      const validLineEndings = ["auto", "preserve", "lf"] as const;
      type LineEnding = typeof validLineEndings[number];
      let lineEnding: LineEnding | undefined;
      if (options.lineEnding !== undefined) {
        if (!validLineEndings.includes(options.lineEnding as LineEnding)) {
          process.stderr.write(`Error: --line-ending must be one of: ${validLineEndings.join(", ")}\n`);
          process.exit(1);
        }
        lineEnding = options.lineEnding as LineEnding;
      }

      let content: string;
      let edits: EditInput["edits"];
      let fileName = options.fileName;

      if (fileArg && options.search !== undefined && options.replace !== undefined) {
        if (!existsSync(fileArg)) {
          process.stderr.write(`Error: File not found: ${fileArg}\n`);
          process.exit(1);
        }
        content = readFileSync(fileArg, "utf-8");
        edits = [{ search: options.search, replace: options.replace }];
        fileName = fileName ?? fileArg;
      } else if (fileArg && (options.search !== undefined || options.replace !== undefined)) {
        process.stderr.write("Error: Both --search and --replace are required when editing a file\n");
        process.exit(1);
      } else if (fileArg) {
        // File argument provided but no --search/--replace
        process.stderr.write("Error: When editing a file directly, --search and --replace are required\n");
        process.stderr.write("Usage: air edit <file> -s \"old\" -r \"new\" [options]\n");
        process.exit(1);
      } else if (!isatty(0)) {
        const stdinRaw = readFileSync(0, "utf-8");
        const input = parseEditInput(stdinRaw);
        content = input.content;
        edits = input.edits;
      } else {
        process.stderr.write("Usage: air edit <file> -s \"old\" -r \"new\" [options]\n");
        process.stderr.write('       echo \'{"content":"...","edits":[...]}\' | air edit [options]\n');
        process.exit(1);
      }

      const compressor = new EditCompressor();
      const result = compressor.compress(content, {
        maxLines,
        maxTokens,
        fileName,
        edits,
        dryRun: options.dryRun,
        fuzzyThreshold: options.fuzzyThreshold,
        enableFuzzyMatch: options.fuzzy,
        lineEnding,
      });

      process.stdout.write(result.output + "\n");
    }
  );
