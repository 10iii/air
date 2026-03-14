import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { createRequire } from "node:module";

type CoreModule = Record<string, unknown>;

interface CompressorLike {
  compress(content: string, options?: Record<string, unknown>): { output: string };
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

function formatError(toolName: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `[${toolName}] ${message}`;
}

const AirPlugin: Plugin = async () => {
  return {
    tool: {
      air_read: tool({
        description: "Read file content with AIR compression.",
        args: {
          content: tool.schema.string(),
          fileName: tool.schema.string().optional(),
          maxLines: tool.schema.number().int().positive().optional(),
          maxTokens: tool.schema.number().int().positive().optional(),
          lineNumbers: tool.schema.boolean().optional(),
        },
        async execute(args) {
          try {
            return compressWith("ReadCompressor", args.content, {
              fileName: args.fileName,
              maxLines: args.maxLines,
              maxTokens: args.maxTokens,
              lineNumbers: args.lineNumbers,
            });
          } catch (error) {
            return formatError("air_read", error);
          }
        },
      }),

      air_bash: tool({
        description: "Compress terminal/command output.",
        args: {
          content: tool.schema.string(),
          command: tool.schema.string().optional(),
          maxLines: tool.schema.number().int().positive().optional(),
          maxTokens: tool.schema.number().int().positive().optional(),
        },
        async execute(args) {
          try {
            return compressWith("BashCompressor", args.content, {
              command: args.command,
              maxLines: args.maxLines,
              maxTokens: args.maxTokens,
            });
          } catch (error) {
            return formatError("air_bash", error);
          }
        },
      }),

      air_edit: tool({
        description: "Apply search/replace edits with AIR edit compression.",
        args: {
          content: tool.schema.string(),
          fileName: tool.schema.string().optional(),
          edits: tool.schema.array(
            tool.schema.object({
              search: tool.schema.string(),
              replace: tool.schema.string(),
              context: tool.schema.string().optional(),
              occurrence: tool.schema.number().int().optional(),
            }),
          ),
          dryRun: tool.schema.boolean().optional(),
          fuzzyThreshold: tool.schema.number().min(0).max(1).optional(),
          enableFuzzyMatch: tool.schema.boolean().optional(),
          lineEnding: tool.schema.enum(["auto", "preserve", "lf"]).optional(),
        },
        async execute(args) {
          try {
            return compressWith("EditCompressor", args.content, {
              fileName: args.fileName,
              edits: args.edits,
              dryRun: args.dryRun,
              fuzzyThreshold: args.fuzzyThreshold,
              enableFuzzyMatch: args.enableFuzzyMatch,
              lineEnding: args.lineEnding,
            });
          } catch (error) {
            return formatError("air_edit", error);
          }
        },
      }),

      air_test: tool({
        description: "Compress test runner output.",
        args: {
          content: tool.schema.string(),
          runner: tool.schema.enum(["pytest", "jest", "vitest", "go", "cargo"]).optional(),
          maxLines: tool.schema.number().int().positive().optional(),
          maxTokens: tool.schema.number().int().positive().optional(),
        },
        async execute(args) {
          try {
            return compressWith("TestCompressor", args.content, {
              runner: args.runner,
              maxLines: args.maxLines,
              maxTokens: args.maxTokens,
            });
          } catch (error) {
            return formatError("air_test", error);
          }
        },
      }),

      air_grep: tool({
        description: "Compress grep output.",
        args: {
          content: tool.schema.string(),
          maxLines: tool.schema.number().int().positive().optional(),
          maxTokens: tool.schema.number().int().positive().optional(),
          maxFiles: tool.schema.number().int().positive().optional(),
          filesOnly: tool.schema.boolean().optional(),
          mergeDistance: tool.schema.number().int().nonnegative().optional(),
        },
        async execute(args) {
          try {
            return compressWith("GrepCompressor", args.content, {
              maxLines: args.maxLines,
              maxTokens: args.maxTokens,
              maxFiles: args.maxFiles,
              filesOnly: args.filesOnly,
              mergeDistance: args.mergeDistance,
            });
          } catch (error) {
            return formatError("air_grep", error);
          }
        },
      }),

      air_web: tool({
        description: "Extract and compress article content from HTML.",
        args: {
          content: tool.schema.string(),
          url: tool.schema.string().optional(),
          maxLines: tool.schema.number().int().positive().optional(),
          maxTokens: tool.schema.number().int().positive().optional(),
          format: tool.schema.enum(["markdown", "text"]).optional(),
          codeOnly: tool.schema.boolean().optional(),
          score: tool.schema.boolean().optional(),
        },
        async execute(args) {
          try {
            return compressWith("WebCompressor", args.content, {
              url: args.url,
              maxLines: args.maxLines,
              maxTokens: args.maxTokens,
              format: args.format,
              codeOnly: args.codeOnly,
              score: args.score,
            });
          } catch (error) {
            return formatError("air_web", error);
          }
        },
      }),

      air_ls: tool({
        description: "Compress directory listing output.",
        args: {
          content: tool.schema.string(),
          maxLines: tool.schema.number().int().positive().optional(),
          maxTokens: tool.schema.number().int().positive().optional(),
          maxDepth: tool.schema.number().int().nonnegative().optional(),
          groupByType: tool.schema.boolean().optional(),
        },
        async execute(args) {
          try {
            return compressWith("LsCompressor", args.content, {
              maxLines: args.maxLines,
              maxTokens: args.maxTokens,
              maxDepth: args.maxDepth,
              groupByType: args.groupByType,
            });
          } catch (error) {
            return formatError("air_ls", error);
          }
        },
      }),

      air_diff: tool({
        description: "Compress git diff output.",
        args: {
          content: tool.schema.string(),
          maxLines: tool.schema.number().int().positive().optional(),
          maxTokens: tool.schema.number().int().positive().optional(),
          level: tool.schema.enum(["summary", "compact", "full"]).optional(),
        },
        async execute(args) {
          try {
            return compressWith("DiffCompressor", args.content, {
              maxLines: args.maxLines,
              maxTokens: args.maxTokens,
              level: args.level,
            });
          } catch (error) {
            return formatError("air_diff", error);
          }
        },
      }),
    },
  };
};

export default AirPlugin;
