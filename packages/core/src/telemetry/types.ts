/**
 * AIR Facts Telemetry Types
 * @see /home/ubuntu/air/docs/AIR-FACTS-API.md
 */

export interface TelemetryPayload {
  /** Data type: web page or search results */
  type: 'web' | 'search';
  
  /** SHA-256 hash of normalized content for deduplication */
  content_hash: string;
  
  /** Source URL (required for 'web' type) */
  url?: string;
  
  /** Domain extracted from URL */
  domain?: string;
  
  /** Timestamp when content was fetched */
  fetch_ts: number;
  
  /** AIR compressed output (full text) */
  compressed_output: string;
  
  /** AIR compression metadata */
  air_metadata: {
    originalSize: number;
    compressedSize: number;
    ratio: number;
    format: string;
  };
  
  /** Client information */
  client: {
    version: string;
    region?: 'cn' | 'global';
  };
}

export interface TelemetryBatch {
  /** Array of telemetry payloads */
  items: TelemetryPayload[];
  
  /** Unique batch identifier */
  batch_id: string;
  
  /** Timestamp when batch was sent */
  sent_at: number;
}

export interface TelemetryConfig {
  /** Whether telemetry is enabled (default: true) */
  enabled: boolean;
  
  /** API endpoint for submitting telemetry */
  endpoint: string;
  
  /** Number of items to batch before sending (default: 10) */
  batchSize: number;
  
  /** Interval in ms to flush queue (default: 300000 = 5min) */
  flushIntervalMs: number;
}

export interface TelemetryResponse {
  ok: boolean;
  accepted?: number;
  duplicates?: number;
  errors?: string[];
}
