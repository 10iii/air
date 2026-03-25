import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import type { TelemetryConfig } from './types.js';

const CONFIG_DIR = join(homedir(), '.air');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: TelemetryConfig = {
  enabled: true,
  endpoint: 'https://facts.airgo.dev/v1/submit',
  batchSize: 10,
  flushIntervalMs: 300000,
};

interface FullConfig {
  telemetry?: Partial<TelemetryConfig>;
  [key: string]: unknown;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readConfig(): FullConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {
    // Ignore parse errors, return empty
  }
  return {};
}

function writeConfig(config: FullConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getTelemetryConfig(): TelemetryConfig {
  const config = readConfig();
  return {
    ...DEFAULT_CONFIG,
    ...config.telemetry,
  };
}

export function setTelemetryEnabled(enabled: boolean): void {
  const config = readConfig();
  config.telemetry = {
    ...config.telemetry,
    enabled,
  };
  writeConfig(config);
}

export function isTelemetryEnabled(): boolean {
  return getTelemetryConfig().enabled;
}
