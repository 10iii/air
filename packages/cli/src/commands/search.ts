import { Command } from "commander";
import { SearchCompressor } from "@10iii/air-core";
import { readFileSync } from "node:fs";
import { strictParseInt, requirePositiveInteger } from "../utils.js";

export const searchCommand = new Command("search")
  .description("Compress search engine results")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--max-results <n>", "Maximum search results to include", strictParseInt)
  .option("--query <text>", "Original search query for relevance scoring")
  .action(
    (options: {
      maxLines?: number;
      maxTokens?: number;
      maxResults?: number;
      query?: string;
    }) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);
      const maxResults = requirePositiveInteger("max-results", options.maxResults);
      const content = readFileSync(0, "utf-8");

      const compressor = new SearchCompressor();
      const result = compressor.compress(content, {
        maxLines,
        maxTokens,
        maxResults,
        query: options.query,
      });

      process.stdout.write(result.output + "\n");
    }
  );
