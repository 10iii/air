import { Command } from "commander";
import { ApiCompressor } from "@10iii/air-core";
import { readFileSync } from "node:fs";
import { isatty } from "node:tty";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { strictParseInt, requirePositiveInteger } from "../utils.js";
import { COMMAND_HELP, showHelpAndExit } from "../help.js";

const FETCH_TIMEOUT_MS = 30000;
const MAX_REDIRECTS = 5;
const USER_AGENT = "Mozilla/5.0 (compatible; AIR/0.1; +https://github.com/10iii/air)";

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function fetchUrl(url: string, redirectCount = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) {
      reject(new Error(`Too many redirects (max ${MAX_REDIRECTS})`));
      return;
    }

    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const requestFn = isHttps ? httpsRequest : httpRequest;
    
    const req = requestFn(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "application/json, */*",
        },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).href;
          fetchUrl(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
          return;
        }
        
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        res.on("error", reject);
      }
    );
    
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.end();
  });
}

const helpText = COMMAND_HELP.api?.fullHelp ?? "";

export const apiCommand = new Command("api")
  .description("Fetch URL or compress API/JSON response data")
  .argument("[url]", "URL to fetch JSON from (if not provided, reads from stdin)")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--max-depth <n>", "Maximum JSON nesting depth", strictParseInt)
  .option("--max-array-length <n>", "Maximum array elements to show", strictParseInt)
  .option("--remove-nulls", "Remove null values")
  .option("--remove-defaults", "Remove default values")
  .option("--schema-fields <fields>", "Comma-separated list of schema fields to keep")
  .configureHelp({ formatHelp: () => helpText })
  .action(
    async (
      urlArg: string | undefined,
      options: {
        maxLines?: number;
        maxTokens?: number;
        maxDepth?: number;
        maxArrayLength?: number;
        removeNulls?: boolean;
        removeDefaults?: boolean;
        schemaFields?: string;
      }
    ) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);
      const maxDepth = requirePositiveInteger("max-depth", options.maxDepth);
      const maxArrayLength = requirePositiveInteger("max-array-length", options.maxArrayLength);

      let content: string;

      if (urlArg && isValidUrl(urlArg)) {
        try {
          content = await fetchUrl(urlArg);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`Error fetching URL: ${msg}\n`);
          process.exit(1);
        }
      } else if (urlArg) {
        showHelpAndExit("api", `Invalid URL "${urlArg}". Must be http:// or https://`);
      } else if (!isatty(0)) {
        content = readFileSync(0, "utf-8");
      } else {
        showHelpAndExit("api");
      }

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
