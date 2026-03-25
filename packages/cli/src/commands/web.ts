import { Command } from "commander";
import { WebCompressor } from "@10iii/air-core";
import { readFileSync } from "node:fs";
import { isatty } from "node:tty";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { COMMAND_HELP, showHelpAndExit } from "../help.js";

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
    showHelpAndExit("web", `--${label} must be a positive integer`);
  }
  return Math.floor(value);
}

function parseFormat(value: string): "markdown" | "text" {
  if (value === "markdown" || value === "text") {
    return value;
  }
  showHelpAndExit("web", "--format must be either 'markdown' or 'text'");
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const FETCH_TIMEOUT_MS = 30000;
const USER_AGENT = "Mozilla/5.0 (compatible; AIR/0.1; +https://github.com/10iii/air)";

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";
    const requestFn = isHttps ? httpsRequest : httpRequest;
    
    const req = requestFn(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchUrl(res.headers.location).then(resolve).catch(reject);
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

const helpText = COMMAND_HELP.web?.fullHelp ?? "";

export const webCommand = new Command("web")
  .description("Fetch URL and compress HTML into clean article-focused output")
  .argument("[url]", "URL to fetch (if not provided, reads HTML from stdin)")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--format <type>", "Output format: markdown|text", parseFormat)
  .option("--code-only", "Extract only fenced code blocks")
  .option("--score", "Include content density score line")
  .option("--dom-snapshot", "DOM snapshot mode optimized for browser automation")
  .configureHelp({ formatHelp: () => helpText })
  .action(
    async (
      urlArg: string | undefined,
      options: {
        maxLines?: number;
        maxTokens?: number;
        format?: "markdown" | "text";
        codeOnly?: boolean;
        score?: boolean;
        domSnapshot?: boolean;
      }
    ) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);

      let input: string;
      let resolvedUrl: string | undefined;

      if (urlArg && isValidUrl(urlArg)) {
        resolvedUrl = urlArg;
        try {
          input = await fetchUrl(urlArg);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`Error fetching URL: ${msg}\n`);
          process.exit(1);
        }
      } else if (urlArg) {
        showHelpAndExit("web", `Invalid URL "${urlArg}". Must be http:// or https://`);
      } else if (!isatty(0)) {
        input = readFileSync(0, "utf-8");
      } else {
        showHelpAndExit("web");
      }

      const compressor = new WebCompressor();
      const result = compressor.compress(input, {
        url: resolvedUrl,
        maxLines,
        maxTokens,
        format: options.format ?? "markdown",
        codeOnly: options.codeOnly ?? false,
        score: options.score ?? false,
        domSnapshot: options.domSnapshot ?? false,
      });

      process.stdout.write(result.output + "\n");
    }
  );
