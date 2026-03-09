/**
 * Core types for AIR.
 */

/** Result of a compression operation. */
export interface CompressResult {
  /** The compressed output content. */
  output: string;
  /** Original size (line count). */
  originalSize: number;
  /** Compressed size (line count). */
  compressedSize: number;
  /** Compression ratio (0-1, lower = more compressed). */
  ratio: number;
  /** Format used for compression. */
  format: string;
  /** Optional metadata about the compression. */
  metadata?: Record<string, unknown>;
}

/** Configuration for AIR. */
export interface AirConfig {
  /** Default output format. */
  defaultFormat: string;
  /** Maximum output size (tokens or bytes). */
  maxOutputSize?: number;
  /** Whether to include metadata in output. */
  includeMetadata: boolean;
  /** Custom compressor configurations. */
  compressors?: Record<string, CompressorOptions>;
}

/** Options passed to a compressor. */
export interface CompressorOptions {
  /** Target compression level (0-1, lower = more aggressive). */
  level?: number;
  /** Whether to preserve comments. */
  preserveComments?: boolean;
  /** Maximum depth for tree structures. */
  maxDepth?: number;
  /** Additional compressor-specific options. */
  [key: string]: unknown;
}

/** Result of a parse operation. */
export interface ParseResult {
  /** Parsed content as structured data. */
  content: unknown;
  /** Source file path, if applicable. */
  sourcePath?: string;
  /** Detected content type. */
  contentType: string;
  /** Parse warnings. */
  warnings: string[];
}
