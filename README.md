# AIR - AI-optimized Information Representation

AIR is a toolkit for optimizing tool outputs for AI consumption. The name is inspired by "accessibility retrofitting" - just as we retrofit infrastructure for accessibility, we need to retrofit developer tools for AI ergonomics.

## The Problem

AI context windows are the scarcest resource. A 200K token window sounds large, but:
- A single `npm install` output can consume 2000+ tokens
- A test report can eat 5000+ tokens  
- 50-96% of this is noise: progress bars, blank lines, redundant info

**The real cost isn't tokens - it's attention dilution.** Even with unlimited tokens, noise in context degrades AI reasoning quality.

## The Solution

AIR intercepts tool outputs **at the source**, filtering noise before it enters the context window. Prevention, not cleanup.

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| `@10iii/air-core` | Core compression library | [![npm](https://img.shields.io/npm/v/@10iii/air-core)](https://www.npmjs.com/package/@10iii/air-core) |
| `@10iii/air` | CLI tool (`air` command) | [![npm](https://img.shields.io/npm/v/@10iii/air)](https://www.npmjs.com/package/@10iii/air) |
| `@10iii/air-mcp-server` | MCP server for Claude/etc | [![npm](https://img.shields.io/npm/v/@10iii/air-mcp-server)](https://www.npmjs.com/package/@10iii/air-mcp-server) |
| `@10iii/air-oc-plugin` | OpenCode plugin | [![npm](https://img.shields.io/npm/v/@10iii/air-oc-plugin)](https://www.npmjs.com/package/@10iii/air-oc-plugin) |

## Quick Start

### CLI

```bash
# Install globally
npm install -g @10iii/air

# Read a file with compression
air read src/index.ts --skeleton

# Run a command with output compression  
air bash "npm install"

# Search with de-duplication
air grep "TODO" --include "*.ts"

# Test output compression
air test "npm test"
```

### As a Library

```typescript
import { ReadCompressor, BashCompressor, GrepCompressor } from '@10iii/air-core';

// Compress file content
const read = new ReadCompressor();
const result = read.compress(fileContent, { mode: 'skeleton' });

// Compress command output
const bash = new BashCompressor();
const result = bash.compress(output, { command: 'npm install' });
```

### MCP Server

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "air": {
      "command": "npx",
      "args": ["@10iii/air-mcp-server"]
    }
  }
}
```

### OpenCode Plugin

Add to your `opencode.json`:

```json
{
  "plugins": ["@10iii/air-oc-plugin"]
}
```

## Compressors

### air-read
File content compression with intelligent truncation and structure awareness.

- **skeleton**: Extract function/class signatures only
- **focused**: Line range extraction with context
- **truncate**: Smart truncation with size limits

### air-bash
Command output compression with pattern recognition.

- npm/pnpm/yarn install → progress removal, error extraction
- git operations → diff summarization
- Generic → intelligent truncation

### air-grep
Search result compression with path de-duplication and context optimization.

### air-test
Test output parsing for pytest, jest, go test, and more.

### air-web
Web page content extraction with readability and markdown conversion.

### air-ls
Directory listing with tree structure and smart filtering.

### air-diff
Diff output compression with hunk summarization.

### air-edit
Direct file editing without pre-reading (search/replace).

### air-session
Session/conversation history compression.

### air-api
API response compression (JSON field filtering).

### air-media
Media file metadata extraction (images, audio, video).

### air-search
Web search with multiple engine support (DuckDuckGo, Bing, Baidu, Sogou).

## Token Savings Rate (TSR)

| Compressor | Typical TSR |
|------------|-------------|
| air-test | 90%+ |
| air-bash | 60-90% |
| air-read | 50-80% |
| air-grep | 40-60% |
| air-web | 70-90% |

## Design Principles

1. **Prevention > Cleanup** - Filter at the source, not after
2. **Rule-based > LLM-based** - Deterministic compression, no API calls
3. **Progressive Disclosure** - Skeleton first, details on demand
4. **Cross-platform** - Works with any AI tool
5. **Zero API Key** - No external API dependencies

## Requirements

- Node.js >= 18

## License

MIT

## Contributing

Contributions welcome! Please read the [PRD](./PRD.md) and [DESIGN](./DESIGN.md) docs first.
