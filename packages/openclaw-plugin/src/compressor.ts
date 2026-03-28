/**
 * AIR Compressor Routing (Whitelist Strategy)
 *
 * Only tools explicitly listed here are compressed.
 * All other tools pass through unchanged.
 */

import { createRequire } from "node:module";

// =============================================================================
// Types
// =============================================================================

type CoreModule = Record<string, unknown>;

interface CompressorLike {
  compress(
    content: string,
    options?: Record<string, unknown>,
  ): { output: string };
}

type CompressorConstructor = new () => CompressorLike;
type CompressorFactory = () => CompressorLike;

// =============================================================================
// Core module loader
// =============================================================================

const require = createRequire(import.meta.url);
let core: CoreModule | null = null;

function getCore(): CoreModule {
  if (!core) {
    core = require("@10iii/air-core") as CoreModule;
  }
  return core;
}

function getCompressor(name: string): CompressorLike {
  const coreModule = getCore();
  const maybeCtor = coreModule[name];
  if (typeof maybeCtor !== "function") {
    throw new Error(`Compressor '${name}' not available in @10iii/air-core`);
  }
  const instance = new (maybeCtor as CompressorConstructor)();
  // Runtime validation: ensure instance has compress method
  if (typeof instance.compress !== "function") {
    throw new Error(`Compressor '${name}' does not have a compress method`);
  }
  return instance;
}

// =============================================================================
// Whitelist configuration
// =============================================================================

/**
 * Whitelist of OpenClaw tools to compress.
 * Only these 6 tools are compressed - all others pass through unchanged.
 * (exec and process are separate entries but both use BashCompressor)
 *
 * Design rationale: Safer than blacklist - only compress verified tools.
 */
const TOOL_COMPRESSOR_MAP: Record<string, CompressorFactory> = {
  // Terminal/command output → BashCompressor
  exec: () => getCompressor("BashCompressor"),
  process: () => getCompressor("BashCompressor"),

  // File content → ReadCompressor
  read: () => getCompressor("ReadCompressor"),

  // Web content → WebCompressor
  browser: () => getCompressor("WebCompressor"),
  web_fetch: () => getCompressor("WebCompressor"),

  // Search results → SearchCompressor
  web_search: () => getCompressor("SearchCompressor"),
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Select appropriate compressor based on tool name.
 * Returns null for tools not in whitelist (safe default).
 */
export function selectCompressor(toolName: string): CompressorLike | null {
  const name = toolName.toLowerCase();

  // Skip control tools
  if (name === "air_on" || name === "air_off") {
    return null;
  }

  // Exact match in whitelist
  const factory = TOOL_COMPRESSOR_MAP[name];
  if (factory) {
    return factory();
  }

  // Not in whitelist - don't compress
  return null;
}

/**
 * Check if compression gain meets minimum threshold.
 */
export function shouldCompress(
  original: string,
  compressed: string,
  minGain = 200,
): boolean {
  const gain = original.length - compressed.length;
  return gain >= minGain;
}

/**
 * Get list of tools that will be compressed (for documentation).
 */
export function getCompressedTools(): string[] {
  return Object.keys(TOOL_COMPRESSOR_MAP);
}
