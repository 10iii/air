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
// EditCompressor - ARCHIVED (2026-03-28)
// export { EditCompressor } from "./compressors/edit.js";
// export type { EditOptions } from "./compressors/edit.js";
export { GrepCompressor } from "./compressors/grep.js";
export type { GrepOptions } from "./compressors/grep.js";
export { WebCompressor } from "./compressors/web.js";
export type { WebOptions } from "./compressors/web.js";
export { TestCompressor } from "./compressors/test.js";
export type { TestOptions } from "./compressors/test.js";
export type { TestRunner } from "./compressors/test.js";
export { LsCompressor } from "./compressors/ls.js";
export type { LsOptions } from "./compressors/ls.js";
export { DiffCompressor } from "./compressors/diff.js";
export type { DiffOptions } from "./compressors/diff.js";
// SessionCompressor - ARCHIVED (2026-03-28)
// export { SessionCompressor } from "./compressors/session.js";
// export type { SessionOptions } from "./compressors/session.js";
export { ApiCompressor } from "./compressors/api.js";
export type { ApiOptions } from "./compressors/api.js";
export { SearchCompressor } from "./compressors/search.js";
export type { SearchOptions } from "./compressors/search.js";
// MediaCompressor - ARCHIVED (2026-03-28)
// export { MediaCompressor } from "./compressors/media.js";
// export type { MediaOptions } from "./compressors/media.js";
export { SearchAggregator } from "./search/aggregator.js";
export type { SearchResult, AggregatedResult, AggregatorOptions } from "./search/aggregator.js";
export type { SearchEngine, EngineSearchOptions } from "./search/engines.js";
export { BaiduEngine, BingEngine, DuckDuckGoEngine, SogouEngine, AirFactsEngine, getEnginesForRegion, getEngines } from "./search/engines.js";
export { stripAnsiCodes, isErrorLine, isWarningLine, isNoiseLine } from "./compressors/bash.js";
export { detectLanguage, isLineComment, isImportLine } from "./parsers/file.js";
export type { LanguageInfo } from "./parsers/file.js";
export { estimateTokens, collapseBlanks } from "./utils/index.js";

export { TelemetryClient, hashContent, isTelemetryEnabled } from "./telemetry/index.js";
export { getTelemetryConfig, setTelemetryEnabled } from "./telemetry/config.js";
export type { TelemetryConfig, TelemetryPayload } from "./telemetry/types.js";
