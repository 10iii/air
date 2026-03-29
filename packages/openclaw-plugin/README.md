# @10iii/air-openclaw-plugin

OpenClaw plugin for AIR (AI-optimized Information Representation) - transparent compression for tool outputs.

> **For AI Agents**: See the unified installation guide at [AGENT-INSTALL.md](../../docs/guide/AGENT-INSTALL.md)

## Installation

```bash
npm install @10iii/air-openclaw-plugin
# or
pnpm add @10iii/air-openclaw-plugin
```

## Usage

Add the plugin to your OpenClaw configuration:

```json
{
  "plugins": ["@10iii/air-openclaw-plugin"]
}
```

Or programmatically:

```typescript
import airPlugin from "@10iii/air-openclaw-plugin";

// In your OpenClaw setup
airPlugin.activate(api);
```

## Features

### Transparent Compression

Tool outputs are automatically compressed before being persisted to the session. The LLM sees compressed output with a marker:

```
... compressed content ...
[AIR: compressed 63% | air_off() for raw]
```

### Control Tools

#### `air_on()`

Re-enable compression (default state).

#### `air_off(calls?: number)`

Temporarily disable compression. Auto-expires after N tool calls (default: 10).

```
LLM: Can you show me the raw output?
LLM calls: air_off(5)
Response: AIR compression disabled for the next 5 tool calls.
```

### Whitelist Strategy

Only 5 tools are compressed - all others pass through unchanged:

| Tool | Compressor | Description |
|------|------------|-------------|
| `exec` | BashCompressor | Terminal command output |
| `process` | BashCompressor | Process output |
| `read` | ReadCompressor | File content |
| `browser` | WebCompressor | Page snapshots |
| `web_fetch` | WebCompressor | Fetched web pages |
| `web_search` | SearchCompressor | Search results |

## Configuration

### Environment Variables

```bash
# Minimum compression gain (default: 200 chars)
AIR_MIN_GAIN=200

# Default calls before air_off auto-expires
AIR_DEFAULT_DISABLED_CALLS=10
```

### Recommended OpenClaw Settings

For better compression results, increase the web fetch limits:

```json
{
  "webFetch": {
    "maxChars": 100000,
    "maxCharsCap": 200000,
    "maxResponseBytes": 10000000
  }
}
```

## API

### `activate(api: PluginApi)`

Activate the plugin. Called by OpenClaw when the plugin is loaded.

### `deactivate()`

Deactivate the plugin. Called by OpenClaw when the plugin is unloaded.

### Utilities (for extension/testing)

```typescript
import {
  selectCompressor,
  shouldCompress,
  getCompressedTools,
  isEnabled,
  enable,
  disable,
  reset,
} from "@10iii/air-openclaw-plugin";
```

## Design

See [OPENCLAW-PLUGIN-DESIGN.md](../../docs/OPENCLAW-PLUGIN-DESIGN.md) for detailed design documentation.

## License

MIT
