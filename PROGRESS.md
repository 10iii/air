# AIR Project Progress

> Last updated: 2026-03-25 (P1 direct call mode complete)

## Phase 1: Core Compressors (Complete)

### air-read + air-bash (Shipped)

**Status**: ✅ Complete (commit `1bff82e`, 2026-03-09)
**Tests**: 376 passing (3 suites, expanded from initial 107 → 144 → 376)

| Tool | Status | Description |
|---|---|---|
| `air-read` | ✅ Shipped | File compression with comment/import folding, smart truncation, token budgeting |
| `air-bash` | ✅ Shipped | Command output compression with ANSI stripping, noise filtering, repetition folding |

### air-grep + air-web + air-test + air-ls + air-diff + air-edit (Shipped)

**Status**: ✅ Complete
**Tests**: 490 passing (8 suites)

| Tool | Status | Description |
|---|---|---|
| `air-grep` | ✅ Shipped | Grep/ripgrep output compression with file grouping, match merging |
| `air-web` | ✅ Shipped | HTML → clean markdown/text extraction for AI consumption + DOM snapshot mode |
| `air-test` | ✅ Shipped | Test runner output compression (pytest, jest, vitest, go, cargo) |
| `air-ls` | ✅ Shipped | Directory listing compression with depth control, type grouping |
| `air-diff` | ✅ Shipped | Git diff compression with summary/compact/full levels |
| `air-edit` | ✅ Shipped | Search/replace edit compression with fuzzy matching |

### air-session + air-api + air-search + air-media (Shipped)

**Status**: ✅ Complete (2026-03-17)
**Tests**: 797 passing (16 suites, all green)
**Build**: ✅ All 4 packages (core, cli, mcp-server, oc-plugin)
**Integration**: ✅ CLI commands, MCP handlers, OC plugin handlers all wired

| Tool | Status | Description |
|---|---|---|
| `air-session` | ✅ Shipped | Chat session compression with time-decay/tool-focused/balanced strategies |
| `air-api` | ✅ Shipped | API/JSON response compression with depth limiting, array truncation, null/default removal |
| `air-search` | ✅ Shipped | Search results compression with multi-engine aggregation |
| `air-media` | ✅ Shipped | Media transcript compression (SRT/VTT/text) with timestamp removal, speaker merging, filler word removal |

---

## Phase 2A: air-bash Profile + air-read Skeleton (In Progress)

### air-bash Profile System Expansion (Complete)

**Status**: ✅ Complete (2026-03-21)
**Tests**: 898 passing (17 suites)

Added systemctl/journalctl/top noise/error patterns:
- `NOISE_PATTERNS`: Memory/Tasks/CGroup/CPU (systemctl), Started/Stopped/Created slice (journalctl), top header lines
- `ERROR_PATTERNS`: Active failed/inactive, Result exit-code/core-dump/timeout/signal, segfault, oom-killer

### air-read tree-sitter WASM Integration (Complete)

**Status**: ✅ Complete (2026-03-21)
**Tests**: 918 passing (17 suites, +20 tree-sitter tests)

Features:
- Auto-discovery of `tree-sitter-wasms` package WASM files
- Multi-path WASM resolution: user locator → tree-sitter-wasms → default fallback
- `compressAsync()` method for async tree-sitter skeleton mode
- CLI `--use-tree-sitter` flag
- MCP handler `useTreeSitter` parameter
- OC plugin `useTreeSitter` parameter
- Graceful fallback to regex-based skeleton when tree-sitter unavailable

Supported languages (15): TypeScript, JavaScript, TSX, Python, Go, Rust, Java, C, C++, C#, Ruby, PHP, Swift, Kotlin, Scala

---

## Code Review History

### Phase 1 (air-read + air-bash)

#### Round 1 — Score: 6/10
- 2 Critical fixed (CLI double-shebang, CLI Node types missing)
- 5 Important (4 fixed, 1 carried)

#### Round 2 — Score: 8/10
- 1 Critical fixed (maxTokens budget escape)
- 5 Important all fixed in Round 3

#### Round 3 (Deep Review) — Score: 9/10
- All prior issues verified fixed
- Token truncation O(n) → O(sqrt(n))
- 144 tests, typecheck clean, build clean

### Phase 2 (New 4 Compressors)

#### Round 1 — Score: 7/10

**1 Critical (fixed):**
- C-1: Division by zero in search aggregator (`position=0` → `Infinity`)

**7 Important (all fixed):**
- I-1: `originalSize`/`compressedSize` inconsistent (char vs line count) → unified to line counts
- I-2: api.ts `savedPercent` used char counts while `ratio` used line counts → unified
- I-3/I-4: O(n²) loops in session.ts maxLines/maxTokens → replaced with binary search + system message preservation
- I-5: CLI media.ts defaults (`?? false`) diverged from core defaults (`?? true`) → pass undefined through
- I-6: media.ts `ratio: 0` for empty input → `ratio: 1`
- I-7: search.ts missing `sanitizePositiveInt` → added via shared import

**Key improvements made:**
- Extracted `shared.ts` with `sanitizePositiveInt`, `smartTruncateLines`, `smartTruncateByTokens`
- Binary search in session.ts preserves system messages during trimming

#### Round 2 — Score: 8.5/10

**All R1 findings verified fixed.** No new Critical or Important issues.

3 low-priority suggestions remaining:
- S-R2-1: System-only messages exceeding maxTokens budget (acceptable edge case)
- S-R2-2: shared.ts docstrings could be trimmed (stylistic)
- S-R2-3: CLI command helper duplication (future cleanup)

**Verdict:** ✅ Production Ready

---

## Architecture

```
packages/
├── core/           # Compressor implementations (12 compressors + search infra)
│   └── src/
│       ├── compressors/    # read, bash, grep, web, test, ls, diff, edit, session, api, search, media, shared
│       ├── search/         # aggregator, engines (stub implementations)
│       └── __tests__/      # 16 test files, 797 tests
├── cli/            # Commander-based CLI (12 subcommands)
├── mcp-server/     # MCP protocol server (12 tool handlers)
└── oc-plugin/      # OpenCode plugin (12 tool entries)
```

---

## Phase 2B: Search Engine Implementation (Complete)

**Status**: ✅ Complete (2026-03-17)
**Tests**: 55 passing (engines.test.ts)

| Engine | Status | Implementation |
|---|---|---|
| Baidu | ✅ | JSON API (`tn=json`) + HTML fallback |
| Bing | ✅ | HTML scraping + base64 URL decode |
| Sogou | ✅ | HTML scraping (`.rb/.vrwrap`) |
| DuckDuckGo | ✅ | `duck-duck-scrape` (optional dep, blocked in China) |

Features:
- CAPTCHA detection (Baidu/Sogou redirect to captcha pages)
- Timeout handling (10s)
- Region-based engine selection (`getEnginesForRegion()`)

---

## Phase 2C: Direct Call Mode (Complete)

**Status**: ✅ Complete (2026-03-25)
**Tests**: 924 passing (18 suites)

Direct call mode allows executing commands without pipes:

### P0 (Core, commit `6ed97b4`)

| Command | Before | After |
|---|---|---|
| `air bash` | `air bash -- ls -la` | `air bash ls -la` |
| `air grep` | `rg pattern \| air grep` | `air grep "pattern" src/` |
| `air ls` | `ls -la \| air ls` | `air ls src/ --max-depth 3` |
| `air diff` | `git diff \| air diff` | `air diff HEAD~3` |

### P1 (Web/API/Search, 2026-03-25)

| Command | Before | After |
|---|---|---|
| `air web` | `curl url \| air web` | `air web https://example.com` |
| `air api` | `curl api \| air api` | `air api https://api.example.com/data` |
| `air search` | `cat results.json \| air search` | `air search "query"` |

Features:
- `air web`: Built-in HTTP/HTTPS fetch with redirect following
- `air api`: Built-in fetch for JSON APIs
- `air search`: Real search execution via configured engines (Baidu/Bing/Sogou/DDG + AIR Facts)

### P2 (Remaining, low priority)

| Command | Status | Notes |
|---|---|---|
| `air test` | ❌ Pipe only | Would need command execution |
| `air edit` | ⚠️ JSON stdin | Would need file path + search/replace params |
| `air media` | ❌ Pipe only | Would need file reading |
| `air session` | ❌ JSON stdin | Would need file reading |

---

## Remaining Work

### air-context (OC-Only)
- Formalized as OpenCode-only plugin, NOT cross-framework
- Reason: other frameworks may not expose APIs; context management is sensitive and could cause "efficiency degradation/agent crash/task failure" if poorly adapted

### Region Detection (Complete)
- **Status**: ✅ Complete (2026-03-22)
- **Location**: `packages/core/src/config/region.ts` (260 lines)
- Detection priority (highest to lowest):
  1. Environment variable `AIR_REGION=china|global`
  2. Config file `~/.air/config.json → region`
  3. Auto-detection (multi-signal voting):
     - Locale zh_CN → +1 china
     - Timezone Asia/Shanghai/Chongqing → +1 china
     - DNS google.com failure → +2 china (weighted)
     - HTTP google.com/generate_204 unreachable → +2 china (weighted)
- Exported APIs: `getRegion()`, `getRegionSync()`, `detectRegion()`, `setRegion()`, `getEnginesForRegion()`
- Session caching + auto-persist to config
