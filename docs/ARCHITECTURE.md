# AIR Architecture

> Technical overview of AIR (AI-optimized Information Representation)

## Design Philosophy

| Principle | Description |
|-----------|-------------|
| **Prevention > Cleanup** | Intercept noise at the output layer before it enters context |
| **Rule-based > LLM-based** | Deterministic rules, no LLM API calls, offline capable |
| **Progressive Disclosure** | Skeleton first, details on demand |
| **Cross-platform** | Works with any AI tool, not IDE-specific |

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Integration Layer                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐ │
│  │ OC Plugin  │  │ MCP Server │  │    CLI     │  │  Future   │ │
│  │ air_* tools│  │ stdio/SSE  │  │ air <cmd>  │  │  Hooks    │ │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬─────┘ │
└────────┼───────────────┼───────────────┼───────────────┼───────┘
         └───────────────┴───────────────┴───────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Core Engine (@10iii/air-core)                │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │Output Parser │  │  Summarizer  │  │ Edit Engine  │          │
│  │              │  │              │  │              │          │
│  │ - pytest     │  │ - Test rules │  │ - Fuzzy      │          │
│  │ - jest       │  │ - File rules │  │   matching   │          │
│  │ - vitest     │  │ - Cmd rules  │  │ - Search/    │          │
│  │ - go test    │  │ - Web rules  │  │   replace    │          │
│  │ - cargo      │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Tool Wrappers (13 tools)                     │
│                                                                 │
│  air-read   air-bash   air-test   air-grep   air-edit          │
│  air-web    air-ls     air-diff   air-session                  │
│  air-api    air-search air-media                               │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
User/AI Request
      │
      ▼
┌─────────────────┐
│  Tool Wrapper   │  Execute raw command (pytest, cat, shell)
└────────┬────────┘
         │
         ▼ Raw Output (potentially 5000+ tokens)
┌─────────────────┐
│  Output Parser  │  Identify type, extract structured data
└────────┬────────┘
         │
         ▼ Structured Data
┌─────────────────┐
│   Summarizer    │  Apply rules, control token budget
└────────┬────────┘
         │
         ▼
    Compressed Output (< 500 tokens)
```

## Compression Strategies

### Test Output (air-test)
- Detect test framework (pytest/jest/vitest/go/cargo)
- Extract: pass/fail counts, failure details, duration
- TSR: 90%+ (5000 tokens → 200 tokens)

### File Content (air-read)
- Skeleton mode: function/class signatures only
- Import collapse: group imports by source
- Comment summarization: preserve intent, remove noise

### Command Output (air-bash)
- ANSI code stripping
- Progress bar removal
- Repeated line merging (with counts)
- Noise pattern filtering

### Search Results (air-grep)
- Path deduplication
- Context line merging
- File grouping with match counts

### Web Content (air-web)
- Readability extraction (nav/ads/footer removal)
- Markdown conversion
- Code block preservation

## Token Savings Rate (TSR)

| Tool | Typical TSR | Input | Output |
|------|-------------|-------|--------|
| air-test | 90%+ | 5000 tokens | 200 tokens |
| air-bash | 60-90% | 2000 tokens | 400 tokens |
| air-read | 50-80% | 1000 tokens | 300 tokens |
| air-grep | 40-60% | 800 tokens | 400 tokens |
| air-web | 70-90% | 10000 tokens | 1000 tokens |

## Package Structure

```
@10iii/air-core       # Core compression library (no dependencies)
@10iii/air            # CLI tool
@10iii/air-mcp-server # MCP server for Claude/etc
@10iii/air-oc-plugin  # OpenCode plugin
```

## Extension Points

### Custom Parsers
Implement `OutputParser` interface to add new format support:
```typescript
interface OutputParser {
  name: string;
  detect(output: string, command?: string): boolean;
  parse(output: string): ParsedOutput;
}
```

### Custom Rules
Add summarization rules for specific patterns:
```typescript
interface SummarizerRule {
  name: string;
  match(parsed: ParsedOutput): boolean;
  summarize(parsed: ParsedOutput, budget: number): string;
}
```
