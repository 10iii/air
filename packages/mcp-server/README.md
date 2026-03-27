# AIR MCP Server

MCP (Model Context Protocol) server for [AIR](https://github.com/10iii/air) - AI-optimized tool output compression.

## Why AIR?

AI context windows are the scarcest resource. A single `npm install` can consume 2000+ tokens, and 50-96% of that is noise. AIR compresses tool outputs **at the source**, preserving signal while eliminating noise.

## Installation

### Claude Desktop

Add to your `claude_desktop_config.json`:

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

Config file locations:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Cursor / Other MCP Clients

Follow your client's MCP configuration guide, using:
- **Command**: `npx`
- **Args**: `["@10iii/air-mcp-server"]`

## Available Tools

AIR provides 12 compression tools, each optimized for a specific output type:

### `air_read`
Compress file content with intelligent truncation and structure awareness.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | File content to compress (required) |
| `fileName` | string | File name for syntax detection |
| `mode` | `"full"` \| `"skeleton"` | `skeleton` extracts only signatures |
| `maxLines` | number | Maximum output lines |
| `maxTokens` | number | Maximum output tokens |
| `lineNumbers` | boolean | Add line number prefixes |
| `useTreeSitter` | boolean | Use tree-sitter for accurate parsing |

**Example**: Compress a 500-line TypeScript file to just function signatures:
```
air_read(content: <file>, fileName: "api.ts", mode: "skeleton")
→ Shows only function/class signatures, ~90% reduction
```

### `air_bash`
Compress terminal/command output, removing progress bars and noise.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | Terminal output (required) |
| `command` | string | Original command (helps detection) |
| `maxLines` | number | Maximum output lines |
| `maxTokens` | number | Maximum output tokens |

**Example**: Compress `npm install` output:
```
air_bash(content: <npm output>, command: "npm install")
→ Removes progress bars, keeps errors/warnings
```

### `air_test`
Compress test runner output, focusing on failures.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | Test output (required) |
| `runner` | `"pytest"` \| `"jest"` \| `"vitest"` \| `"go"` \| `"cargo"` | Test framework |
| `maxLines` | number | Maximum output lines |
| `maxTokens` | number | Maximum output tokens |

**Example**: Compress pytest output with 50 tests:
```
air_test(content: <pytest output>, runner: "pytest")
→ Shows only failed tests with stack traces, ~80% reduction
```

### `air_grep`
Compress search results, grouping by file.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | Grep/search output (required) |
| `maxLines` | number | Maximum output lines |
| `maxTokens` | number | Maximum output tokens |
| `maxFiles` | number | Maximum files to include |
| `filesOnly` | boolean | Show only file names |
| `mergeDistance` | number | Merge nearby matches within N lines |

### `air_diff`
Compress git diff output.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | Diff output (required) |
| `level` | `"summary"` \| `"compact"` \| `"full"` | Compression level |
| `maxLines` | number | Maximum output lines |
| `maxTokens` | number | Maximum output tokens |

**Example**: Compress a large git diff:
```
air_diff(content: <diff>, level: "compact")
→ Shows file changes + key line changes, removes context
```

### `air_web`
Extract and compress article content from HTML.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | HTML content (required) |
| `url` | string | Source URL (helps detection) |
| `format` | `"markdown"` \| `"text"` | Output format |
| `codeOnly` | boolean | Extract only code blocks |
| `maxLines` | number | Maximum output lines |
| `maxTokens` | number | Maximum output tokens |

**Example**: Extract article from cluttered HTML:
```
air_web(content: <html>, format: "markdown")
→ Clean markdown, no ads/nav/scripts
```

### `air_ls`
Compress directory listings.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | Directory listing (required) |
| `maxDepth` | number | Maximum directory depth |
| `groupByType` | boolean | Group files by extension |
| `maxLines` | number | Maximum output lines |
| `maxTokens` | number | Maximum output tokens |

### `air_api`
Compress API/JSON responses.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | JSON content (required) |
| `maxDepth` | number | Maximum nesting depth |
| `maxArrayLength` | number | Maximum array items to show |
| `removeNulls` | boolean | Remove null values |
| `removeDefaults` | boolean | Remove default/empty values |
| `schemaFields` | string[] | Only keep these fields |
| `maxLines` | number | Maximum output lines |
| `maxTokens` | number | Maximum output tokens |

**Example**: Compress a large API response:
```
air_api(content: <json>, maxArrayLength: 3, removeNulls: true)
→ Truncates arrays to 3 items, removes nulls
```

### `air_search`
Compress search engine results.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | Search results (required) |
| `query` | string | Original search query |
| `maxResults` | number | Maximum results to include |
| `maxLines` | number | Maximum output lines |
| `maxTokens` | number | Maximum output tokens |

### `air_session`
Compress AI chat session/conversation data.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | Session data (required) |
| `strategy` | `"time-decay"` \| `"tool-focused"` \| `"balanced"` | Compression strategy |
| `maxMessages` | number | Maximum messages to keep |
| `maxLines` | number | Maximum output lines |
| `maxTokens` | number | Maximum output tokens |

### `air_edit`
Apply search/replace edits with compression feedback.

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | File content (required) |
| `edits` | array | Edit operations (see below) |
| `dryRun` | boolean | Preview without applying |
| `enableFuzzyMatch` | boolean | Allow fuzzy matching |
| `fuzzyThreshold` | number | Fuzzy match threshold (0-1) |

Edit object:
```json
{
  "search": "text to find",
  "replace": "replacement text",
  "context": "surrounding context for disambiguation",
  "occurrence": 1
}
```

### `air_media`
Compress media transcripts (SRT/VTT subtitles).

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | Transcript content (required) |
| `format` | `"srt"` \| `"vtt"` \| `"text"` \| `"auto"` | Input format |
| `removeTimestamps` | boolean | Strip timestamps |
| `removeSpeakerLabels` | boolean | Strip speaker labels |
| `mergeSpeakers` | boolean | Merge consecutive same-speaker lines |
| `removeFillerWords` | boolean | Remove "um", "uh", etc. |
| `language` | `"en"` \| `"zh"` \| `"auto"` | Transcript language |

## Usage Tips

1. **Use `mode: "skeleton"`** when you need to understand code structure without implementation details

2. **Specify `fileName`** for better syntax detection in `air_read`

3. **Specify `runner`** for accurate test output parsing in `air_test`

4. **Use `level: "compact"`** for diffs when you only care about what changed, not context

5. **Common compression ratios**:
   - `air_read` (skeleton): 70-90%
   - `air_test` (failed only): 60-90%
   - `air_diff` (compact): 50-80%
   - `air_web`: 60-80%
   - `air_bash`: 30-70%

## Troubleshooting

### Server not starting

1. Ensure Node.js 18+ is installed
2. Try running directly: `npx @10iii/air-mcp-server`
3. Check stderr for error messages

### Tool not compressing

All tools require `content` parameter. The compression is applied to the content you pass in - the tools don't fetch files or run commands themselves.

## Links

- [GitHub Repository](https://github.com/10iii/air)
- [npm Package](https://www.npmjs.com/package/@10iii/air-mcp-server)
- [MCP Registry](https://registry.modelcontextprotocol.io/)

## License

MIT
