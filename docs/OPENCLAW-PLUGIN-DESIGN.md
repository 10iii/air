# AIR OpenClaw Plugin Design

> Design and implementation plan for AIR compression plugin in OpenClaw framework.
>
> Status: **Planning** (2026-03-28)
> Parent: [FRAMEWORK-INTEGRATION.md](./FRAMEWORK-INTEGRATION.md)

## Overview

This document details the design and implementation plan for the AIR OpenClaw plugin (`@10iii/air-openclaw-plugin`). The plugin provides transparent compression for tool outputs in the OpenClaw AI agent framework.

## Background

### OpenClaw Framework

[OpenClaw](https://github.com/openclaw/openclaw) is a personal AI assistant framework that runs cross-platform. It has a typed plugin system with hooks for intercepting tool execution.

### Key Hook: `tool_result_persist`

Based on research (2026-03-27), the optimal hook for AIR integration is `tool_result_persist`:

| Hook | Timing | Modifiable | Use Case |
|------|--------|------------|----------|
| `before_tool_call` | Pre-execution | Yes (params, block) | **NOT suitable** - can block but cannot return custom output |
| `after_tool_call` | Post-execution | No (read-only) | Logging, analytics |
| `tool_result_persist` | Pre-persist | **Yes (message)** | **AIR injection point** |

**Why `tool_result_persist`**:
1. **Synchronous hook** - Intentionally designed for message modification
2. **Can modify `message.content`** - Return `{ message: modifiedMessage }` to replace output
3. **Persistent modification** - Changes affect what's written to session transcript
4. **Timing** - After tool execution, before result is persisted to context

### OpenClaw webfetch Limitations

OpenClaw's `web_fetch` tool has built-in content limits:

| Config | Default | Description |
|--------|---------|-------------|
| `maxChars` | 50,000 | Max characters returned (LLM can override up to cap) |
| `maxCharsCap` | 50,000 | Hard ceiling for `maxChars` |
| `maxResponseBytes` | 2,000,000 (2MB) | Max HTTP response body download |

**Data flow in OpenClaw**:
```
HTTP response → maxResponseBytes (2MB) → Readability extraction → maxChars truncation (50K) → tool_result_persist (AIR)
```

**Problem**: AIR receives already-truncated content. Lost information cannot be recovered.

**Recommendation**: Document suggests users increase limits to let AIR receive fuller content:
```json
{
  "webFetch": {
    "maxChars": 100000,
    "maxCharsCap": 200000,
    "maxResponseBytes": 10000000
  }
}
```

## Architecture

### Package Structure

```
packages/
└── openclaw-plugin/
    ├── package.json
    ├── tsconfig.json
    ├── README.md
    └── src/
        ├── index.ts           # Plugin entry point
        ├── compressor.ts      # Compressor routing logic
        ├── state.ts           # Air enabled/disabled state
        ├── tools.ts           # air_on / air_off tool definitions
        ├── hooks.ts           # tool_result_persist hook handler
        └── __tests__/
            ├── compressor.test.ts
            ├── state.test.ts
            └── hooks.test.ts
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OpenClaw Agent                                │
│                                                                      │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────────────┐  │
│  │   Tool   │───▶│ Tool Result  │───▶│  tool_result_persist      │  │
│  │ Executor │    │   (raw)      │    │  (AIR Hook)               │  │
│  └──────────┘    └──────────────┘    │                           │  │
│                                      │  1. Check air_enabled     │  │
│                                      │  2. Select compressor     │  │
│                                      │  3. Check gain >= 200     │  │
│                                      │  4. Return modified msg   │  │
│                                      └───────────────────────────┘  │
│                                                   │                  │
│                                                   ▼                  │
│                                      ┌───────────────────────────┐  │
│                                      │  Persisted Result         │  │
│                                      │  (compressed + marker)    │  │
│                                      └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Tool Mapping

### Compressed Tools (5 only)

Only these 5 OpenClaw tools are compressed - all others pass through unchanged:

| OpenClaw Tool | AIR Compressor | Notes |
|---------------|----------------|-------|
| `exec` / `process` | BashCompressor | Terminal command output |
| `read` | ReadCompressor | File content with line numbers |
| `browser` | WebCompressor | Page snapshots, DOM content |
| `web_search` | SearchCompressor | Search results aggregation |
| `web_fetch` | WebCompressor | HTML → Markdown extraction |

### Not Compressed (all others)

| Tool Category | Examples | Reason |
|---------------|----------|--------|
| File writes | `write`, `edit`, `apply_patch` | Small confirmation messages |
| UI/Canvas | `canvas` | Commands, not data |
| Scheduling | `cron` | Small structured output |
| Networking | `gateway` | Pass-through content |
| Binary/Media | `image` | Non-text content |
| Sessions | `sessions_*` | **Critical context - high risk of information loss** |
| Memory | `memory_*` | Already optimized for LLM |
| Messaging | `message` | Small confirmations |

## Implementation Details

### 1. State Management (`state.ts`)

```typescript
// Per-session state (not persisted across sessions)
interface AirState {
  enabled: boolean;           // Default: true
  disabledCallsRemaining: number;  // Countdown after air_off()
}

const state: AirState = {
  enabled: true,
  disabledCallsRemaining: 0,
};

export function isEnabled(): boolean {
  return state.enabled;
}

export function enable(): void {
  state.enabled = true;
  state.disabledCallsRemaining = 0;
}

export function disable(calls: number): void {
  state.enabled = false;
  state.disabledCallsRemaining = calls;
}

export function decrementAndCheck(): boolean {
  if (state.disabledCallsRemaining > 0) {
    state.disabledCallsRemaining--;
    if (state.disabledCallsRemaining === 0) {
      state.enabled = true;  // Auto re-enable
      return true;  // Just re-enabled
    }
  }
  return false;
}
```

### 2. Tools Definition (`tools.ts`)

```typescript
import type { ToolDefinition } from "openclaw";
import { enable, disable } from "./state";

const DEFAULT_DISABLED_CALLS = 10;

export const airOnTool: ToolDefinition = {
  name: "air_on",
  description: "Enable AIR compression for tool outputs (default state)",
  parameters: {},
  execute: async () => {
    enable();
    return "AIR compression enabled.";
  },
};

export const airOffTool: ToolDefinition = {
  name: "air_off",
  description: "Disable AIR compression to see raw tool outputs. Auto-expires after N tool calls (default: 10).",
  parameters: {
    calls: {
      type: "number",
      description: "Number of tool calls before auto-enabling (default: 10)",
      optional: true,
    },
  },
  execute: async ({ calls = DEFAULT_DISABLED_CALLS }: { calls?: number }) => {
    disable(calls);
    return `AIR compression disabled for the next ${calls} tool calls.`;
  },
};
```

### 3. Compressor Routing (`compressor.ts`)

```typescript
import type { Compressor } from "@10iii/air-core";
import {
  BashCompressor,
  ReadCompressor,
  WebCompressor,
  SearchCompressor,
} from "@10iii/air-core";

// Tools to compress (whitelist approach for safety)
const TOOL_COMPRESSOR_MAP: Record<string, () => Compressor> = {
  exec: () => new BashCompressor(),
  process: () => new BashCompressor(),
  read: () => new ReadCompressor(),
  browser: () => new WebCompressor(),
  web_search: () => new SearchCompressor(),
  web_fetch: () => new WebCompressor(),
};

export function selectCompressor(toolName: string): Compressor | null {
  const factory = TOOL_COMPRESSOR_MAP[toolName.toLowerCase()];
  return factory ? factory() : null;
}

export function shouldCompress(original: string, compressed: string): boolean {
  const MIN_GAIN = 200;
  const gain = original.length - compressed.length;
  return gain >= MIN_GAIN;
}
```

### 4. Hook Handler (`hooks.ts`)

```typescript
import type { ToolResultPersistEvent, ToolResultPersistReturn } from "openclaw";
import { selectCompressor, shouldCompress } from "./compressor";
import { isEnabled, decrementAndCheck } from "./state";

export function handleToolResultPersist(
  event: ToolResultPersistEvent
): ToolResultPersistReturn {
  const { toolName, message } = event;

  // Skip air_on/air_off themselves
  if (toolName === "air_on" || toolName === "air_off") {
    return {};
  }

  // Check if disabled (with auto-expiry)
  if (!isEnabled()) {
    decrementAndCheck();
    return {};  // No compression
  }

  // Get message content
  const content = typeof message.content === "string" ? message.content : "";
  if (!content) {
    return {};
  }

  // Select compressor (null if tool not in whitelist)
  const compressor = selectCompressor(toolName);
  if (!compressor) {
    return {};
  }

  // Compress
  try {
    const result = compressor.compress(content);
    
    if (!shouldCompress(content, result.output)) {
      return {};  // Gain too small
    }

    const ratio = Math.round(
      ((content.length - result.output.length) / content.length) * 100
    );

    return {
      message: {
        ...message,
        content: `${result.output}\n[AIR: compressed ${ratio}% | air_off() for raw]`,
      },
    };
  } catch {
    return {};  // Compression failed, return original
  }
}
```

### 5. Plugin Entry Point (`index.ts`)

```typescript
import type { PluginApi } from "openclaw";
import { airOnTool, airOffTool } from "./tools";
import { handleToolResultPersist } from "./hooks";

export function activate(api: PluginApi): void {
  // Register control tools
  api.registerTool(airOnTool.name, airOnTool);
  api.registerTool(airOffTool.name, airOffTool);

  // Register compression hook
  api.on("tool_result_persist", handleToolResultPersist);
}

export function deactivate(): void {
  // Cleanup if needed (state reset handled by session end)
}

export default { activate, deactivate };
```

## Configuration

### Environment Variables

```bash
# Disable AIR completely
AIR_ENABLED=false

# Minimum compression gain (default: 200)
AIR_MIN_GAIN=200

# Default calls before air_off auto-expires (default: 10)
AIR_DEFAULT_DISABLED_CALLS=10

# Disable facts.airgo.dev upload
AIR_FACTS_UPLOAD=false
```

### OpenClaw Plugin Config

```json
// openclaw.config.json
{
  "plugins": [
    "@10iii/air-openclaw-plugin"
  ],
  "air": {
    "minGain": 200,
    "defaultDisabledCalls": 10
  }
}
```

### Recommended OpenClaw webFetch Config

To get better compression results, increase the default limits:

```json
// openclaw.config.json
{
  "webFetch": {
    "maxChars": 100000,
    "maxCharsCap": 200000,
    "maxResponseBytes": 10000000
  }
}
```

**Why**: AIR receives content after OpenClaw's internal truncation. Larger limits mean AIR can apply smarter compression to fuller content.

## Testing Strategy

### Unit Tests

1. **State tests** (`state.test.ts`)
   - Default state is enabled
   - disable() sets countdown correctly
   - decrementAndCheck() auto-enables at 0
   - enable() resets state

2. **Compressor tests** (`compressor.test.ts`)
   - selectCompressor returns correct type for each tool
   - selectCompressor returns null for unlisted tools
   - shouldCompress respects MIN_GAIN threshold

3. **Hook tests** (`hooks.test.ts`)
   - Skips air_on/air_off tools
   - Skips when disabled
   - Skips unlisted tools
   - Compresses listed tools with gain >= threshold
   - Returns original when gain < threshold
   - Handles compression errors gracefully

### Integration Tests

1. Install plugin in OpenClaw test instance
2. Run `exec("ls -la")` - verify compression + marker
3. Call `air_off(3)`
4. Run 3 commands - verify no compression
5. Run 4th command - verify compression re-enabled
6. Test `web_fetch` with various page sizes
7. Test `read` with various file types

## Development Plan

### Phase 1: Core Implementation (1-2 days)

- [ ] Create package directory structure
- [ ] Implement state management
- [ ] Implement tool definitions
- [ ] Implement compressor routing
- [ ] Implement hook handler
- [ ] Write unit tests

### Phase 2: Integration (1 day)

- [ ] Set up build pipeline (tsup/esbuild)
- [ ] Configure package.json with proper exports
- [ ] Test with actual OpenClaw instance
- [ ] Handle edge cases discovered in integration

### Phase 3: Documentation & Release (0.5 day)

- [ ] Write README.md
- [ ] Add JSDoc comments
- [ ] Update FRAMEWORK-INTEGRATION.md
- [ ] Publish to npm as `@10iii/air-openclaw-plugin`

### Estimated Total: 2.5-3.5 days

## Dependencies

```json
{
  "dependencies": {
    "@10iii/air-core": "^0.1.0"
  },
  "peerDependencies": {
    "openclaw": ">=1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "tsup": "^8.0.0"
  }
}
```

## Differences from OpenCode Plugin

| Aspect | OpenCode Plugin | OpenClaw Plugin |
|--------|-----------------|-----------------|
| Hook | `tool.execute.after` | `tool_result_persist` |
| webfetch handling | before-hook intercept (5M limit) | No intercept (smaller limits) |
| Compressed tools | 7 (whitelist) | 5 (whitelist) |
| facts.airgo.dev | Yes (fire-and-forget) | Optional (env var) |
| Config | env vars only | env vars + plugin config |

**Note**: Both plugins now use **whitelist strategy** - only explicitly listed tools are compressed.

## Open Questions

1. **Should we intercept `web_fetch` via `before_tool_call`?**
   - OpenClaw's 2MB download limit is smaller than OpenCode's 5MB
   - But `before_tool_call` cannot return custom output (only block)
   - **Decision**: No intercept. Recommend users increase limits instead.

2. **Should `browser` use WebCompressor or a dedicated BrowserCompressor?**
   - Browser snapshots may have different structure than fetched pages
   - **Decision**: Use WebCompressor for now. Create dedicated compressor if needed.

3. **Should we compress `sessions_history`?**
   - High risk of losing critical cross-session context
   - **Decision**: No. Explicitly excluded.

## References

- [OpenClaw Plugin Types](https://github.com/openclaw/openclaw/blob/main/src/plugins/types.ts)
- [OpenClaw web_fetch Implementation](https://github.com/openclaw/openclaw/blob/main/src/agents/tools/web-fetch.ts)
- [AIR Core Documentation](../README.md)
- [Framework Integration Design](./FRAMEWORK-INTEGRATION.md)
