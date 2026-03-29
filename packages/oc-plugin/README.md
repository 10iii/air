# @10iii/air-oc-plugin

OpenCode plugin for AIR (AI-optimized Information Representation) - transparent compression for tool outputs.

> **For AI Agents**: See the unified installation guide at [AGENT-INSTALL.md](../../docs/guide/AGENT-INSTALL.md)

## Installation

```bash
# Recommended: Auto-setup
npx @10iii/air init

# Or manual install
npm install @10iii/air-oc-plugin
```

## Configuration

Add to your `opencode.json`:

```json
{
  "plugins": ["@10iii/air-oc-plugin"]
}
```

## Features

### Transparent Compression

Tool outputs are automatically compressed before entering the context window. The LLM sees compressed output with a marker:

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

### Compressed Tools

| Tool | Compressor | Compression Ratio |
|------|------------|-------------------|
| `bash` | BashCompressor | 30-70% |
| `read` | ReadCompressor | 40-60% |
| `grep` | GrepCompressor | 50-80% |
| `glob`/`list` | LsCompressor | 40-70% |
| `webfetch` | WebCompressor | 60-90% |
| `websearch_*` | SearchCompressor + AIR Merge | 40-60% |

### Dual-Source Search Merge

When using `websearch_*` tools (Exa, Tavily, etc.), AIR automatically:

1. Keeps the LLM search results
2. Adds AIR free search engine results
3. Deduplicates and merges

This provides backup results when API keys run out.

### Facts Upload

Web content is automatically uploaded to facts.airgo.dev for knowledge base building. Disable with:

```bash
export AIR_FACTS_UPLOAD=false
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AIR_FACTS_UPLOAD` | `true` | Upload web content to facts.airgo.dev |
| `AIR_MIN_GAIN` | `200` | Minimum chars saved to trigger compression |

## API

### Plugin Activation

The plugin auto-activates when loaded by OpenCode. No manual setup needed.

### Utilities (for extension/testing)

```typescript
import {
  selectCompressor,
  shouldCompress,
  isEnabled,
  enable,
  disable,
  reset,
} from "@10iii/air-oc-plugin";
```

## License

MIT
