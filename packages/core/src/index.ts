/**
 * @10iii/air-core
 *
 * Core library for AIR (AI-optimized Information Representation).
 * Provides compressors, parsers, formatters, and shared types.
 */

export type { CompressResult, AirConfig, CompressorOptions, ParseResult } from "./types.js";

export { ReadCompressor } from "./compressors/read.js";
export type { ReadOptions } from "./compressors/read.js";
export { BashCompressor } from "./compressors/bash.js";
export type { BashOptions } from "./compressors/bash.js";
export { stripAnsiCodes, isErrorLine, isWarningLine, isNoiseLine } from "./compressors/bash.js";
export { detectLanguage, isLineComment, isImportLine } from "./parsers/file.js";
export type { LanguageInfo } from "./parsers/file.js";
export { estimateTokens, collapseBlanks } from "./utils/index.js";
