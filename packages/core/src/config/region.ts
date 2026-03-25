/**
 * Region detection and configuration for AIR search engines.
 *
 * Detection priority (highest to lowest):
 * 1. Explicit config (~/.air/config.json → region)
 * 2. Environment variable AIR_REGION=china|global
 * 3. Auto-detection:
 *    - Google unreachable (2s timeout) → china
 *    - System locale zh_CN → china
 *    - Timezone Asia/Shanghai or Asia/Chongqing → china
 *    - DNS resolution of google.com fails → china
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

export type Region = "china" | "global";

export interface AirUserConfig {
  region?: Region;
  regionDetectedAt?: number;
  telemetry?: boolean;
}

const REGION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

const CONFIG_DIR = join(homedir(), ".air");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

// In-memory cache for the session
let cachedRegion: Region | null = null;

/**
 * Read user config from ~/.air/config.json
 */
export function readConfig(): AirUserConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(content) as AirUserConfig;
    }
  } catch {
    // Ignore parse errors, return empty config
  }
  return {};
}

/**
 * Write user config to ~/.air/config.json
 */
export function writeConfig(config: AirUserConfig): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch {
    // Ignore write errors (e.g., permission issues)
  }
}

/**
 * Update a single config key
 */
export function setConfigValue<K extends keyof AirUserConfig>(
  key: K,
  value: AirUserConfig[K],
): void {
  const config = readConfig();
  config[key] = value;
  writeConfig(config);
}

/**
 * Check if Google is reachable (2s timeout)
 * Returns true if reachable (global), false if not (china)
 */
async function isGoogleReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch("https://www.google.com/generate_204", {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return res.status === 204 || res.ok;
  } catch {
    return false;
  }
}

/**
 * Check system locale for Chinese indicators
 */
function isChineseLocale(): boolean {
  const lang = process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || "";
  return lang.toLowerCase().startsWith("zh");
}

/**
 * Check timezone for China indicators
 */
function isChineseTimezone(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz === "Asia/Shanghai" || tz === "Asia/Chongqing" || tz === "Asia/Urumqi";
  } catch {
    return false;
  }
}

/**
 * Check if DNS resolution for google.com works (sync, fast)
 */
function canResolveGoogle(): boolean {
  try {
    // Use a quick DNS lookup via dig/nslookup
    execSync("nslookup google.com 8.8.8.8", {
      timeout: 2000,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect region based on multiple signals.
 * Async because Google reachability check is async.
 */
export async function detectRegion(): Promise<Region> {
  // Signal 1: Environment variable (instant)
  const envRegion = process.env.AIR_REGION?.toLowerCase();
  if (envRegion === "china" || envRegion === "global") {
    return envRegion;
  }

  // Signal 2: Explicit config file (check expiry)
  const config = readConfig();
  if (config.region === "china" || config.region === "global") {
    const isExpired = config.regionDetectedAt 
      && (Date.now() - config.regionDetectedAt > REGION_EXPIRY_MS);
    if (!isExpired) {
      return config.region;
    }
  }

  // Signal 3: Auto-detection (may be slow)
  // Use multiple signals and vote

  let chinaSignals = 0;
  let globalSignals = 0;

  // 3a: Locale check (instant)
  if (isChineseLocale()) {
    chinaSignals++;
  } else {
    globalSignals++;
  }

  // 3b: Timezone check (instant)
  if (isChineseTimezone()) {
    chinaSignals++;
  } else {
    globalSignals++;
  }

  // 3c: DNS resolution (fast, ~100ms)
  if (!canResolveGoogle()) {
    chinaSignals += 2; // Weighted: DNS failure is a strong signal
  } else {
    globalSignals++;
  }

  // 3d: Google HTTP reachability (slower, up to 2s)
  // Only if signals are tied or leaning global
  if (globalSignals >= chinaSignals) {
    const googleOk = await isGoogleReachable();
    if (!googleOk) {
      chinaSignals += 2; // Weighted: HTTP failure is conclusive
    } else {
      globalSignals += 2;
    }
  }

  return chinaSignals > globalSignals ? "china" : "global";
}

/**
 * Synchronous version of detectRegion.
 * Uses only instant checks (no HTTP), less accurate but non-blocking.
 */
export function detectRegionSync(): Region {
  // Signal 1: Environment variable
  const envRegion = process.env.AIR_REGION?.toLowerCase();
  if (envRegion === "china" || envRegion === "global") {
    return envRegion;
  }

  // Signal 2: Explicit config (check expiry)
  const config = readConfig();
  if (config.region === "china" || config.region === "global") {
    const isExpired = config.regionDetectedAt 
      && (Date.now() - config.regionDetectedAt > REGION_EXPIRY_MS);
    if (!isExpired) {
      return config.region;
    }
  }

  // Signal 3: Locale + Timezone only (no network)
  let chinaSignals = 0;
  if (isChineseLocale()) chinaSignals++;
  if (isChineseTimezone()) chinaSignals++;
  if (!canResolveGoogle()) chinaSignals++;

  return chinaSignals >= 2 ? "china" : "global";
}

/**
 * Get region with caching.
 * First call runs detection, subsequent calls return cached value.
 */
export async function getRegion(): Promise<Region> {
  if (cachedRegion !== null) {
    return cachedRegion;
  }

  cachedRegion = await detectRegion();

  const config = readConfig();
  if (!config.region || config.region !== cachedRegion) {
    config.region = cachedRegion;
    config.regionDetectedAt = Date.now();
    writeConfig(config);
  }

  return cachedRegion;
}

/**
 * Get region synchronously with caching.
 */
export function getRegionSync(): Region {
  if (cachedRegion !== null) {
    return cachedRegion;
  }

  cachedRegion = detectRegionSync();
  return cachedRegion;
}

/**
 * Clear the cached region (for testing or manual refresh)
 */
export function clearRegionCache(): void {
  cachedRegion = null;
}

/**
 * Manually set the region (overrides detection)
 */
export function setRegion(region: Region): void {
  cachedRegion = region;
  const config = readConfig();
  config.region = region;
  config.regionDetectedAt = Date.now();
  writeConfig(config);
}
