import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".air");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
  };
});

describe("telemetry/config", () => {
  let originalConfig: string | null = null;

  beforeEach(() => {
    vi.resetModules();
    if (existsSync(CONFIG_FILE)) {
      originalConfig = readFileSync(CONFIG_FILE, "utf-8");
    }
  });

  afterEach(() => {
    if (originalConfig !== null) {
      const { writeFileSync } = require("node:fs");
      writeFileSync(CONFIG_FILE, originalConfig);
    } else if (existsSync(CONFIG_FILE)) {
      unlinkSync(CONFIG_FILE);
    }
  });

  it("returns default config when no file exists", async () => {
    if (existsSync(CONFIG_FILE)) {
      unlinkSync(CONFIG_FILE);
    }

    const { getTelemetryConfig } = await import("../telemetry/config.js");
    const config = getTelemetryConfig();

    expect(config.enabled).toBe(true);
    expect(config.endpoint).toBe("https://facts.airgo.dev/v1/submit");
    expect(config.batchSize).toBe(10);
    expect(config.flushIntervalMs).toBe(300000);
  });

  it("setTelemetryEnabled persists to file", async () => {
    const { setTelemetryEnabled, getTelemetryConfig } = await import(
      "../telemetry/config.js"
    );

    setTelemetryEnabled(false);
    expect(getTelemetryConfig().enabled).toBe(false);

    setTelemetryEnabled(true);
    expect(getTelemetryConfig().enabled).toBe(true);
  });

  it("isTelemetryEnabled reflects current config", async () => {
    const { setTelemetryEnabled, isTelemetryEnabled } = await import(
      "../telemetry/config.js"
    );

    setTelemetryEnabled(false);
    expect(isTelemetryEnabled()).toBe(false);

    setTelemetryEnabled(true);
    expect(isTelemetryEnabled()).toBe(true);
  });
});

describe("telemetry/client", () => {
  it("hashContent produces consistent SHA-256 hex", async () => {
    const { hashContent } = await import("../telemetry/client.js");

    const hash1 = hashContent("test content");
    const hash2 = hashContent("test content");
    const hash3 = hashContent("different content");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("TelemetryClient is singleton", async () => {
    const { TelemetryClient } = await import("../telemetry/client.js");

    const client1 = TelemetryClient.getInstance();
    const client2 = TelemetryClient.getInstance();

    expect(client1).toBe(client2);
  });

  it("enqueue adds payload to queue", async () => {
    const { TelemetryClient, hashContent } = await import(
      "../telemetry/client.js"
    );

    const client = TelemetryClient.getInstance();
    (client as any).queue = [];

    await client.enqueue({
      type: "web",
      content_hash: hashContent("test"),
      fetch_ts: Date.now(),
      compressed_output: "test output",
      air_metadata: {
        originalSize: 100,
        compressedSize: 50,
        ratio: 0.5,
        format: "web",
      },
      client: { version: "0.1.0" },
    });

    expect((client as any).queue.length).toBe(1);
  });
});
