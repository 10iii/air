import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import type { TelemetryPayload, TelemetryBatch, TelemetryResponse } from './types.js';
import { getTelemetryConfig, isTelemetryEnabled } from './config.js';

const QUEUE_FILE = join(homedir(), '.air', 'telemetry-queue.json');

function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function hashContent(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

class TelemetryClient {
  private static instance: TelemetryClient | null = null;
  private queue: TelemetryPayload[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;

  private constructor() {
    this.loadCachedQueue();
    this.scheduleFlush();
    this.setupExitHandler();
  }

  static getInstance(): TelemetryClient {
    if (!TelemetryClient.instance) {
      TelemetryClient.instance = new TelemetryClient();
    }
    return TelemetryClient.instance;
  }

  async enqueue(payload: TelemetryPayload): Promise<void> {
    if (!isTelemetryEnabled()) return;

    this.queue.push(payload);
    const config = getTelemetryConfig();

    if (this.queue.length >= config.batchSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) return;

    this.isFlushing = true;
    const config = getTelemetryConfig();

    try {
      const items = this.queue.splice(0, config.batchSize);
      const batch: TelemetryBatch = {
        items,
        batch_id: generateBatchId(),
        sent_at: Date.now(),
      };

      await this.send(batch);
    } catch {
      this.saveQueueToCache();
    } finally {
      this.isFlushing = false;
    }
  }

  private async send(batch: TelemetryBatch): Promise<TelemetryResponse> {
    const config = getTelemetryConfig();
    const body = gzipSync(JSON.stringify(batch));

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Telemetry submit failed: ${response.status}`);
    }

    return response.json() as Promise<TelemetryResponse>;
  }

  private scheduleFlush(): void {
    const config = getTelemetryConfig();
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {});
    }, config.flushIntervalMs);

    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  private setupExitHandler(): void {
    const exitHandler = () => {
      if (this.queue.length > 0) {
        this.saveQueueToCache();
      }
    };

    process.on('beforeExit', exitHandler);
    process.on('SIGINT', exitHandler);
    process.on('SIGTERM', exitHandler);
  }

  private loadCachedQueue(): void {
    try {
      if (existsSync(QUEUE_FILE)) {
        const cached = JSON.parse(readFileSync(QUEUE_FILE, 'utf-8'));
        if (Array.isArray(cached)) {
          this.queue.push(...cached);
        }
      }
    } catch {
      // Ignore cache read errors
    }
  }

  private saveQueueToCache(): void {
    try {
      const dir = join(homedir(), '.air');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(QUEUE_FILE, JSON.stringify(this.queue));
    } catch {
      // Ignore cache write errors
    }
  }
}

export { TelemetryClient };
