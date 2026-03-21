import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

type CoreModule = Record<string, unknown>;

interface CompressorLike {
  compress(content: string, options?: Record<string, unknown>): { output: string };
  compressAsync?(content: string, options?: Record<string, unknown>): Promise<{ output: string }>;
}

type CompressorConstructor = new () => CompressorLike;

const require = createRequire(import.meta.url);
const core = require("@10iii/air-core") as CoreModule;

function getCompressor(name: string): CompressorLike {
  const maybeCtor = core[name];
  if (typeof maybeCtor !== "function") {
    throw new Error(`Compressor '${name}' is not available in @10iii/air-core`);
  }

  return new (maybeCtor as CompressorConstructor)();
}

function compressWith(
  compressorName: string,
  content: string,
  options?: Record<string, unknown>,
): string {
  const compressor = getCompressor(compressorName);
  const result = compressor.compress(content, options);
  if (!result || typeof result.output !== "string") {
    throw new Error(`Compressor '${compressorName}' returned an invalid result`);
  }
  return result.output;
}

async function compressWithAsync(
  compressorName: string,
  content: string,
  options?: Record<string, unknown>,
): Promise<string> {
  const compressor = getCompressor(compressorName);
  if (compressor.compressAsync) {
    const result = await compressor.compressAsync(content, options);
    if (!result || typeof result.output !== "string") {
      throw new Error(`Compressor '${compressorName}' returned an invalid result`);
    }
    return result.output;
  }
  return compressWith(compressorName, content, options);
}

function formatError(toolName: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `[${toolName}] ${message}`;
}

function ok(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function fail(toolName: string, error: unknown) {
  return {
    content: [{ type: "text" as const, text: formatError(toolName, error) }],
    isError: true,
  };
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "air",
    version: "0.1.0",
  });

  server.tool(
    "air_read",
    "Read file content with AIR compression.",
    {
      content: z.string(),
      fileName: z.string().optional(),
      maxLines: z.number().int().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
      lineNumbers: z.boolean().optional(),
      mode: z.enum(["full", "skeleton"]).optional(),
      useTreeSitter: z.boolean().optional(),
    },
    async (args) => {
      try {
        const options = {
          fileName: args.fileName,
          maxLines: args.maxLines,
          maxTokens: args.maxTokens,
          lineNumbers: args.lineNumbers,
          mode: args.mode,
          useTreeSitter: args.useTreeSitter,
        };
        const output = args.useTreeSitter
          ? await compressWithAsync("ReadCompressor", args.content, options)
          : compressWith("ReadCompressor", args.content, options);
        return ok(output);
      } catch (error) {
        return fail("air_read", error);
      }
    },
  );

  server.tool(
    "air_bash",
    "Compress terminal/command output.",
    {
      content: z.string(),
      command: z.string().optional(),
      maxLines: z.number().int().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
    },
    async (args) => {
      try {
        return ok(
          compressWith("BashCompressor", args.content, {
            command: args.command,
            maxLines: args.maxLines,
            maxTokens: args.maxTokens,
          }),
        );
      } catch (error) {
        return fail("air_bash", error);
      }
    },
  );

  server.tool(
    "air_edit",
    "Apply search/replace edits with AIR edit compression.",
    {
      content: z.string(),
      fileName: z.string().optional(),
      edits: z.array(
        z.object({
          search: z.string(),
          replace: z.string(),
          context: z.string().optional(),
          occurrence: z.number().int().optional(),
        }),
      ),
      dryRun: z.boolean().optional(),
      fuzzyThreshold: z.number().min(0).max(1).optional(),
      enableFuzzyMatch: z.boolean().optional(),
      lineEnding: z.enum(["auto", "preserve", "lf"]).optional(),
    },
    async (args) => {
      try {
        return ok(
          compressWith("EditCompressor", args.content, {
            fileName: args.fileName,
            edits: args.edits,
            dryRun: args.dryRun,
            fuzzyThreshold: args.fuzzyThreshold,
            enableFuzzyMatch: args.enableFuzzyMatch,
            lineEnding: args.lineEnding,
          }),
        );
      } catch (error) {
        return fail("air_edit", error);
      }
    },
  );

  server.tool(
    "air_test",
    "Compress test runner output.",
    {
      content: z.string(),
      runner: z.enum(["pytest", "jest", "vitest", "go", "cargo"]).optional(),
      maxLines: z.number().int().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
    },
    async (args) => {
      try {
        return ok(
          compressWith("TestCompressor", args.content, {
            runner: args.runner,
            maxLines: args.maxLines,
            maxTokens: args.maxTokens,
          }),
        );
      } catch (error) {
        return fail("air_test", error);
      }
    },
  );

  server.tool(
    "air_grep",
    "Compress grep output.",
    {
      content: z.string(),
      maxLines: z.number().int().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
      maxFiles: z.number().int().positive().optional(),
      filesOnly: z.boolean().optional(),
      mergeDistance: z.number().int().nonnegative().optional(),
    },
    async (args) => {
      try {
        return ok(
          compressWith("GrepCompressor", args.content, {
            maxLines: args.maxLines,
            maxTokens: args.maxTokens,
            maxFiles: args.maxFiles,
            filesOnly: args.filesOnly,
            mergeDistance: args.mergeDistance,
          }),
        );
      } catch (error) {
        return fail("air_grep", error);
      }
    },
  );

  server.tool(
    "air_web",
    "Extract and compress article content from HTML.",
    {
      content: z.string(),
      url: z.string().optional(),
      maxLines: z.number().int().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
      format: z.enum(["markdown", "text"]).optional(),
      codeOnly: z.boolean().optional(),
      score: z.boolean().optional(),
      domSnapshot: z.boolean().optional(),
    },
    async (args) => {
      try {
        return ok(
          compressWith("WebCompressor", args.content, {
            url: args.url,
            maxLines: args.maxLines,
            maxTokens: args.maxTokens,
            format: args.format,
            codeOnly: args.codeOnly,
            score: args.score,
            domSnapshot: args.domSnapshot,
          }),
        );
      } catch (error) {
        return fail("air_web", error);
      }
    },
  );

  server.tool(
    "air_ls",
    "Compress directory listing output.",
    {
      content: z.string(),
      maxLines: z.number().int().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
      maxDepth: z.number().int().nonnegative().optional(),
      groupByType: z.boolean().optional(),
    },
    async (args) => {
      try {
        return ok(
          compressWith("LsCompressor", args.content, {
            maxLines: args.maxLines,
            maxTokens: args.maxTokens,
            maxDepth: args.maxDepth,
            groupByType: args.groupByType,
          }),
        );
      } catch (error) {
        return fail("air_ls", error);
      }
    },
  );

  server.tool(
    "air_diff",
    "Compress git diff output.",
    {
      content: z.string(),
      maxLines: z.number().int().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
      level: z.enum(["summary", "compact", "full"]).optional(),
    },
    async (args) => {
      try {
        return ok(
          compressWith("DiffCompressor", args.content, {
            maxLines: args.maxLines,
            maxTokens: args.maxTokens,
            level: args.level,
          }),
        );
      } catch (error) {
        return fail("air_diff", error);
      }
    },
  );

  server.tool(
    "air_session",
    "Compress AI chat session/conversation data.",
    {
      content: z.string(),
      maxLines: z.number().int().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
      maxMessages: z.number().int().positive().optional(),
      strategy: z.enum(["time-decay", "tool-focused", "balanced"]).optional(),
    },
    async (args) => {
      try {
        return ok(compressWith("SessionCompressor", args.content, {
          maxLines: args.maxLines,
          maxTokens: args.maxTokens,
          maxMessages: args.maxMessages,
          strategy: args.strategy,
        }));
      } catch (error) {
        return fail("air_session", error);
      }
    },
  );

  server.tool(
    "air_api",
    "Compress API/JSON response data.",
    {
      content: z.string(),
      maxLines: z.number().int().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
      maxDepth: z.number().int().positive().optional(),
      maxArrayLength: z.number().int().positive().optional(),
      removeNulls: z.boolean().optional(),
      removeDefaults: z.boolean().optional(),
      schemaFields: z.array(z.string()).optional(),
    },
    async (args) => {
      try {
        return ok(compressWith("ApiCompressor", args.content, {
          maxLines: args.maxLines,
          maxTokens: args.maxTokens,
          maxDepth: args.maxDepth,
          maxArrayLength: args.maxArrayLength,
          removeNulls: args.removeNulls,
          removeDefaults: args.removeDefaults,
          schemaFields: args.schemaFields,
        }));
      } catch (error) {
        return fail("air_api", error);
      }
    },
  );

  server.tool(
    "air_search",
    "Compress search engine results.",
    {
      content: z.string(),
      maxLines: z.number().int().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
      maxResults: z.number().int().positive().optional(),
      query: z.string().optional(),
    },
    async (args) => {
      try {
        return ok(compressWith("SearchCompressor", args.content, {
          maxLines: args.maxLines,
          maxTokens: args.maxTokens,
          maxResults: args.maxResults,
          query: args.query,
        }));
      } catch (error) {
        return fail("air_search", error);
      }
    },
  );

  server.tool(
    "air_media",
    "Compress media transcripts (SRT/VTT/text subtitles).",
    {
      content: z.string(),
      maxLines: z.number().int().positive().optional(),
      maxTokens: z.number().int().positive().optional(),
      format: z.enum(["srt", "vtt", "text", "auto"]).optional(),
      removeTimestamps: z.boolean().optional(),
      removeSpeakerLabels: z.boolean().optional(),
      mergeSpeakers: z.boolean().optional(),
      removeFillerWords: z.boolean().optional(),
      language: z.enum(["en", "zh", "auto"]).optional(),
    },
    async (args) => {
      try {
        return ok(compressWith("MediaCompressor", args.content, {
          maxLines: args.maxLines,
          maxTokens: args.maxTokens,
          format: args.format,
          removeTimestamps: args.removeTimestamps,
          removeSpeakerLabels: args.removeSpeakerLabels,
          mergeSpeakers: args.mergeSpeakers,
          removeFillerWords: args.removeFillerWords,
          language: args.language,
        }));
      } catch (error) {
        return fail("air_media", error);
      }
    },
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  void startServer().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`Failed to start AIR MCP server: ${message}\n`);
    process.exitCode = 1;
  });
}
