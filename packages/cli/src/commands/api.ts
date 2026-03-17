import { Command } from "commander";
import { ApiCompressor } from "@10iii/air-core";
import { readFileSync } from "node:fs";
import { strictParseInt, requirePositiveInteger } from "../utils.js";

export const apiCommand = new Command("api")
  .description("Compress API/JSON response data")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--max-depth <n>", "Maximum JSON nesting depth", strictParseInt)
  .option("--max-array-length <n>", "Maximum array elements to show", strictParseInt)
  .option("--remove-nulls", "Remove null values")
  .option("--remove-defaults", "Remove default values")
  .option("--schema-fields <fields>", "Comma-separated list of schema fields to keep")
  .action(
    (options: {
      maxLines?: number;
      maxTokens?: number;
      maxDepth?: number;
      maxArrayLength?: number;
      removeNulls?: boolean;
      removeDefaults?: boolean;
      schemaFields?: string;
    }) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);
      const maxDepth = requirePositiveInteger("max-depth", options.maxDepth);
      const maxArrayLength = requirePositiveInteger("max-array-length", options.maxArrayLength);
      const content = readFileSync(0, "utf-8");

      const schemaFields = options.schemaFields
        ? options.schemaFields.split(",").map((s) => s.trim())
        : undefined;

      const compressor = new ApiCompressor();
      const result = compressor.compress(content, {
        maxLines,
        maxTokens,
        maxDepth,
        maxArrayLength,
        removeNulls: options.removeNulls ?? false,
        removeDefaults: options.removeDefaults ?? false,
        schemaFields,
      });

      process.stdout.write(result.output + "\n");
    }
  );
