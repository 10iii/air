/**
 * AIR Facts API - Type Definitions
 */

// ============== Request Types ==============

export interface TelemetryPayload {
  type: 'web' | 'search';
  content_hash: string;
  url?: string;
  domain?: string;
  fetch_ts: number;
  compressed_output: string;
  air_metadata: {
    originalSize: number;
    compressedSize: number;
    ratio: number;
    format: string;
    extractionSource?: string;
    [key: string]: unknown;
  };
  client: {
    version: string;
    region?: string;
  };
}

export interface TelemetryBatch {
  items: TelemetryPayload[];
  batch_id: string;
  sent_at: number;
}

// ============== Response Types ==============

export interface SubmitResponse {
  ok: boolean;
  accepted: number;
  duplicates: number;
  errors: string[];
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  source: 'air-facts';
  freshness: string;
  confidence: number;
}

export interface SearchResponse {
  ok: boolean;
  results: SearchResult[];
  total: number;
  query_time_ms: number;
}

export interface ErrorResponse {
  ok: false;
  error: string;
  retry_after_seconds?: number;
}

// ============== Queue Types ==============

export interface QueueMessage {
  r2Key: string;
  factId: string;
}

// ============== Env Bindings ==============

export interface Env {
  DEDUP_KV: KVNamespace;
  FACTS_R2: R2Bucket;
  FACTS_QUEUE?: Queue<QueueMessage>;
  AI: Ai;
  FACTS_INDEX: VectorizeIndex;
  ENVIRONMENT: string;
}

// ============== Storage Types ==============

export interface StoredFact {
  id: string;
  content_hash: string;
  type: 'web' | 'search';
  url?: string;
  domain?: string;
  fetch_ts: number;
  compressed_output: string;
  air_metadata: TelemetryPayload['air_metadata'];
  client_version: string;
  client_region?: string;
  stored_at: number;
}

export interface ExtractedFact {
  id: string;
  source_id: string;
  url?: string;
  domain?: string;
  title: string;
  summary: string;
  facts: string[];
  embedding?: number[];
  extracted_at: number;
}
