import { Command } from "commander";
import { SearchCompressor, SearchAggregator, getEngines } from "@10iii/air-core";
import type { SearchResult } from "@10iii/air-core";
import { readFileSync } from "node:fs";
import { isatty } from "node:tty";
import { strictParseInt, requirePositiveInteger } from "../utils.js";

export const searchCommand = new Command("search")
  .description("Search the web or compress search results")
  .argument("[query]", "Search query (if not provided, reads JSON results from stdin)")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--max-results <n>", "Maximum search results to include", strictParseInt)
  .action(
    async (
      queryArg: string | undefined,
      options: {
        maxLines?: number;
        maxTokens?: number;
        maxResults?: number;
      }
    ) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);
      const maxResults = requirePositiveInteger("max-results", options.maxResults) ?? 10;

      let content: string;
      let query: string | undefined;

      if (queryArg) {
        query = queryArg;
        
        try {
          const engines = await getEngines();
          
          const searchPromises = engines.map(async (engine) => {
            try {
              const results = await engine.search(query!, { maxResults });
              return { engine: engine.name, results };
            } catch {
              return { engine: engine.name, results: [] as SearchResult[] };
            }
          });
          
          const engineResultsArray = await Promise.all(searchPromises);
          
          const engineResults = new Map<string, SearchResult[]>();
          for (const { engine, results } of engineResultsArray) {
            if (results.length > 0) {
              engineResults.set(engine, results);
            }
          }
          
          const aggregator = new SearchAggregator();
          const aggregated = aggregator.aggregate(engineResults, { maxResults });
          
          content = JSON.stringify(aggregated);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`Error during search: ${msg}\n`);
          process.exit(1);
        }
      } else if (!isatty(0)) {
        content = readFileSync(0, "utf-8");
      } else {
        process.stderr.write("Usage: air search \"query\" [options]\n");
        process.stderr.write("       cat search-results.json | air search [options]\n");
        process.exit(1);
      }

      const compressor = new SearchCompressor();
      const result = compressor.compress(content, {
        maxLines,
        maxTokens,
        maxResults,
        query,
      });

      process.stdout.write(result.output + "\n");
    }
  );
