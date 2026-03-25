/**
 * AIR Facts API - Cloudflare Worker
 * 
 * Endpoints:
 * - POST /v1/submit - 接收 telemetry 数据
 * - GET /v1/search - 搜索事实库（Phase 3）
 * - GET /health - 健康检查
 */

import type { Env, TelemetryBatch, SubmitResponse, ErrorResponse, TelemetryPayload, StoredFact, QueueMessage } from './types';
import { searchFacts, processAndIndexFact } from './ai';

// ============== Constants ==============

const DEDUP_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

// ============== Helpers ==============

function corsHeaders(origin?: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Content-Encoding',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse<T>(data: T, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
      ...headers,
    },
  });
}

function errorResponse(error: string, status = 400, retryAfter?: number): Response {
  const body: ErrorResponse = { ok: false, error };
  if (retryAfter !== undefined) {
    body.retry_after_seconds = retryAfter;
  }
  return jsonResponse(body, status);
}

function generateId(): string {
  return `fact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getDatePath(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

// ============== Rate Limiting ==============

async function checkRateLimit(env: Env, ip: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `ratelimit:${ip}`;
  const now = Date.now();
  
  const data = await env.DEDUP_KV.get<{ count: number; windowStart: number }>(key, 'json');
  
  if (!data) {
    // First request in window
    await env.DEDUP_KV.put(key, JSON.stringify({ count: 1, windowStart: now }), {
      expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    });
    return { allowed: true };
  }
  
  if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
    // Window expired, reset
    await env.DEDUP_KV.put(key, JSON.stringify({ count: 1, windowStart: now }), {
      expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    });
    return { allowed: true };
  }
  
  if (data.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((data.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  // Increment counter
  await env.DEDUP_KV.put(key, JSON.stringify({ count: data.count + 1, windowStart: data.windowStart }), {
    expirationTtl: Math.ceil((data.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000),
  });
  return { allowed: true };
}

// ============== Handlers ==============

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  // Check rate limit
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimitResult = await checkRateLimit(env, ip);
  if (!rateLimitResult.allowed) {
    return errorResponse('rate_limit_exceeded', 429, rateLimitResult.retryAfter);
  }

  // Parse request body
  let batch: TelemetryBatch;
  try {
    const contentEncoding = request.headers.get('Content-Encoding');
    let body: string;
    
    if (contentEncoding === 'gzip') {
      const ds = new DecompressionStream('gzip');
      const decompressed = request.body?.pipeThrough(ds);
      body = await new Response(decompressed).text();
    } else {
      body = await request.text();
    }
    
    batch = JSON.parse(body) as TelemetryBatch;
  } catch (e) {
    return errorResponse('Invalid request body', 400);
  }

  // Validate batch
  if (!batch.items || !Array.isArray(batch.items) || batch.items.length === 0) {
    return errorResponse('Empty or invalid items array', 400);
  }

  if (batch.items.length > 100) {
    return errorResponse('Batch size exceeds limit (max 100)', 400);
  }

  // Process items
  const result: SubmitResponse = {
    ok: true,
    accepted: 0,
    duplicates: 0,
    errors: [],
  };

  const datePath = getDatePath();

  for (const item of batch.items) {
    try {
      // Validate required fields
      if (!item.content_hash || !item.type || !item.compressed_output) {
        result.errors.push(`Missing required fields for item`);
        continue;
      }

      // Check for duplicate
      const dedupKey = `dedup:${item.content_hash}`;
      const exists = await env.DEDUP_KV.get(dedupKey);
      
      if (exists) {
        result.duplicates++;
        continue;
      }

      // Create stored fact
      const fact: StoredFact = {
        id: generateId(),
        content_hash: item.content_hash,
        type: item.type,
        url: item.url,
        domain: item.domain,
        fetch_ts: item.fetch_ts,
        compressed_output: item.compressed_output,
        air_metadata: item.air_metadata,
        client_version: item.client.version,
        client_region: item.client.region,
        stored_at: Date.now(),
      };

      // Store in R2
      const r2Key = `raw/${datePath}/${item.type}/${item.content_hash}.json`;
      await env.FACTS_R2.put(r2Key, JSON.stringify(fact), {
        httpMetadata: {
          contentType: 'application/json',
        },
        customMetadata: {
          type: item.type,
          domain: item.domain || '',
        },
      });

      // Mark as processed (dedup)
      await env.DEDUP_KV.put(dedupKey, '1', {
        expirationTtl: DEDUP_TTL_SECONDS,
      });

      if (env.FACTS_QUEUE) {
        await env.FACTS_QUEUE.send({ r2Key, factId: fact.id });
      }

      result.accepted++;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      result.errors.push(`Failed to process item: ${errorMsg}`);
    }
  }

  return jsonResponse(result);
}

async function handleSearch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);

  if (!query) {
    return errorResponse('Missing query parameter "q"', 400);
  }

  const startTime = Date.now();
  
  try {
    const matches = await searchFacts(env, query, limit);
    
    const results = matches.map((match) => ({
      url: match.metadata.url || '',
      title: match.metadata.title || 'Untitled',
      snippet: match.metadata.summary || '',
      source: 'air-facts' as const,
      freshness: new Date().toISOString().split('T')[0],
      confidence: match.score,
    }));

    return jsonResponse({
      ok: true,
      results,
      total: results.length,
      query_time_ms: Date.now() - startTime,
    });
  } catch (e) {
    console.error('Search failed:', e);
    return jsonResponse({
      ok: true,
      results: [],
      total: 0,
      query_time_ms: Date.now() - startTime,
    });
  }
}

async function handleHealth(env: Env): Promise<Response> {
  try {
    await env.DEDUP_KV.get('health-check-key');
    await env.FACTS_R2.list({ limit: 1 });
    
    return jsonResponse({
      ok: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return jsonResponse({
      ok: false,
      status: 'unhealthy',
      error: e instanceof Error ? e.message : 'Unknown error',
    }, 503);
  }
}

async function handleExtract(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 10) : 5;

  try {
    const listed = await env.FACTS_R2.list({ prefix: 'raw/', limit });
    const results: Array<{ id: string; success: boolean; title?: string; error?: string }> = [];

    for (const obj of listed.objects) {
      try {
        const data = await env.FACTS_R2.get(obj.key);
        if (!data) continue;

        const storedFact = JSON.parse(await data.text()) as StoredFact;
        const extracted = await processAndIndexFact(env, storedFact);

        if (extracted) {
          results.push({ id: storedFact.id, success: true, title: extracted.title });
        } else {
          results.push({ id: storedFact.id, success: false, error: 'Extraction returned null' });
        }
      } catch (e) {
        results.push({ 
          id: obj.key, 
          success: false, 
          error: e instanceof Error ? e.message : 'Unknown error' 
        });
      }
    }

    return jsonResponse({
      ok: true,
      processed: results.length,
      results,
    });
  } catch (e) {
    return errorResponse(`Extraction failed: ${e instanceof Error ? e.message : 'Unknown'}`, 500);
  }
}

// ============== Main Handler ==============

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request.headers.get('Origin') || undefined),
      });
    }

    // Route requests
    try {
      // Health check
      if (path === '/health' && method === 'GET') {
        return handleHealth(env);
      }

      // API v1
      if (path === '/v1/submit' && method === 'POST') {
        return handleSubmit(request, env);
      }

      if (path === '/v1/search' && method === 'GET') {
        return handleSearch(request, env);
      }

      if (path === '/v1/extract' && method === 'POST') {
        return handleExtract(request, env);
      }

      return errorResponse('Not found', 404);
    } catch (e) {
      console.error('Unhandled error:', e);
      return errorResponse('Internal server error', 500);
    }
  },

  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    console.log(`[queue] Processing ${batch.messages.length} items`);
    
    for (const msg of batch.messages) {
      const { r2Key, factId } = msg.body;
      
      try {
        const data = await env.FACTS_R2.get(r2Key);
        if (!data) {
          console.log(`[queue] R2 object not found: ${r2Key}`);
          msg.ack();
          continue;
        }

        const storedFact = JSON.parse(await data.text()) as StoredFact;
        const extracted = await processAndIndexFact(env, storedFact);

        if (extracted) {
          console.log(`[queue] Extracted: ${factId} → ${extracted.title}`);
        } else {
          console.log(`[queue] Extraction returned null: ${factId}`);
        }

        msg.ack();
      } catch (e) {
        console.error(`[queue] Error processing ${factId}:`, e);
        msg.retry();
      }
    }
  },
};
