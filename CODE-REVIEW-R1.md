# AIR Code Review — Round 1

**Scope:** All new code for 4 compressors (session, api, search, media) plus CLI commands, integration layers (MCP server, OC plugin), search infrastructure, and tests.

**Files Reviewed:** 21 files across `packages/core`, `packages/cli`, `packages/mcp-server`, `packages/oc-plugin`.

**Date:** 2026-03-17

---

## Overall Score: 7 / 10

> **Good quality with a few important issues.** The codebase is well-structured, consistently designed, and has solid test coverage. However, there are correctness bugs (division by zero, metric inconsistencies), O(n²) performance issues in the session compressor, and significant code duplication across compressors that should be extracted to shared utilities.

---

## Summary of Findings

| Severity | Count |
|----------|-------|
| 🔴 Critical | 1 |
| 🟠 Important | 7 |
| 🔵 Suggestion | 11 |
| ℹ️ Informational | 1 |
| **Total** | **20** |

---

## 🔴 Critical

### C-1: Division by zero in search aggregator (`position=0` → `Infinity` score)

**File:** `packages/core/src/search/aggregator.ts` **Line:** 96

```typescript
positionScore = (1 / result.position) * weight;
```

If `result.position` is `0`, this produces `Infinity`, which will corrupt all subsequent scoring calculations. The `SearchResult` interface does not enforce `position > 0`, and no runtime guard exists.

**Impact:** A single result with `position=0` would receive infinite score, dominating all aggregation results regardless of other signals.

**Fix:**
```typescript
positionScore = result.position > 0 ? (1 / result.position) * weight : 0;
```

Also consider adding a runtime assertion or normalizing position to be 1-indexed in the `SearchResult` type documentation.

---

## 🟠 Important

### I-1: `CompressResult.originalSize`/`compressedSize` — line count vs. character count inconsistency

**File:** `packages/core/src/types.ts` **Lines:** 9-10 (definition)
**Files affected:** `session.ts:277`, `media.ts:540`, `search.ts:196`

`types.ts` documents `originalSize` and `compressedSize` as **"line count"**:

```typescript
/** Original size (line count) */
originalSize: number;
/** Compressed size (line count) */
compressedSize: number;
```

But three of the four compressors use **character count** instead:

| Compressor | `originalSize` source | `compressedSize` source | Correct? |
|------------|----------------------|------------------------|----------|
| `api.ts` | `originalLineCount` (line 344) | `compressedLineCount` (line 345) | ✅ Matches docs |
| `session.ts` | `content.length` (line 277, chars) | `output.length` (line 278, chars) | ❌ Character count |
| `media.ts` | `originalCharCount` (line 540, chars) | `compressedCharCount` (line 541, chars) | ❌ Character count |
| `search.ts` | `originalCharCount` (line 196, chars) | `compressedCharCount` (line 197, chars) | ❌ Character count |

**Impact:** Any consumer relying on `originalSize`/`compressedSize` as line counts (per the type docs) will get wildly wrong values from 3 of 4 compressors. The `ratio` field is also affected since it's computed from these values.

**Fix:** Either:
1. Update all compressors to use line counts (consistent with docs), or
2. Change the type documentation to say "size in characters" and update `api.ts` to match, or
3. Add separate `originalLineCount`/`originalCharCount` fields to `CompressResult` for clarity.

### I-2: `api.ts` mixes character-based and line-based metrics in the same result

**File:** `packages/core/src/compressors/api.ts` **Lines:** 333-347

```typescript
// Line 333-337: savedPercent computed from CHAR counts
const compressedSize = compressedContent.length;          // chars
const savedPercent = originalSize > 0
  ? ((originalSize - compressedSize) / originalSize * 100).toFixed(1)
  : '0.0';

// Line 344-347: OVERRIDES originalSize/compressedSize with LINE counts
originalSize: originalLineCount,
compressedSize: compressedLineCount,
ratio: compressedLineCount / originalLineCount,
```

The `savedPercent` in metadata is computed from character counts, but `ratio` in the result is computed from line counts. A consumer seeing `savedPercent: "72.3%"` alongside `ratio: 0.85` would be confused — they measure different things.

**Fix:** Compute `savedPercent` from the same metric (line counts) used for the returned `originalSize`/`compressedSize`, or clearly document which metric each field uses.

### I-3: `session.ts` — O(n²) performance in `maxLines` enforcement loop

**File:** `packages/core/src/compressors/session.ts` **Lines:** 388-404

```typescript
while (reduced.messages.length > 0) {
  const output = JSON.stringify(reduced, null, 2);   // O(n) serialize
  const lines = output.split('\n');                    // O(n) split
  if (lines.length <= maxLines) break;
  reduced.messages.shift();                            // remove one message
}
```

Each iteration serializes the entire remaining conversation and splits it into lines, then removes only one message. For a 1000-message conversation that needs to be trimmed to 100 lines, this is `O(n × m)` where `n` = total messages and `m` = serialized size.

**Fix:** Use binary search to find the right number of messages to keep, or estimate line counts per message and remove in bulk.

### I-4: `session.ts` — O(n²) performance in `maxTokens` enforcement loop

**File:** `packages/core/src/compressors/session.ts` **Lines:** 407-420

```typescript
while (reduced.messages.length > 0) {
  const output = JSON.stringify(reduced);              // O(n) serialize
  const tokenCount = estimateTokens(output);           // O(n) tokenize
  if (tokenCount <= maxTokens) break;
  reduced.messages.shift();                            // remove one message
}
```

Same pattern as I-3. Both `JSON.stringify` and `estimateTokens` are O(n) per call, and the loop removes one message per iteration.

**Fix:** Same as I-3 — use binary search or batch removal.

### I-5: CLI `media.ts` default values differ from core defaults

**File:** `packages/cli/src/commands/media.ts` **Lines:** 70-73
**File:** `packages/core/src/compressors/media.ts` **Lines:** 305-308

The CLI uses `?? false` as defaults for several boolean options:

```typescript
// CLI defaults (media.ts:70-73)
removeTimestamps: options.removeTimestamps ?? false,
removeSpeakerLabels: options.removeSpeakerLabels ?? false,
mergeSpeakers: options.mergeSpeakers ?? false,
removeFillerWords: options.removeFillerWords ?? false,
```

But the core `MediaCompressor.compress()` defaults are:

```typescript
// Core defaults (media.ts:305-308)
const shouldRemoveTimestamps = options.removeTimestamps ?? true;
const shouldMergeSpeakers = options.mergeSpeakers ?? true;
const shouldRemoveFillerWords = options.removeFillerWords ?? true;
```

**Impact:** `cat file.srt | air media` produces **different** results than calling `new MediaCompressor().compress(content)` programmatically with no options. CLI users get minimal compression by default while API users get aggressive compression.

**Fix:** Either align CLI defaults to match core defaults (recommended — users expect `air media` to actually compress), or document the difference prominently.

### I-6: `media.ts` returns `ratio: 0` for empty input (inconsistent contract)

**File:** `packages/core/src/compressors/media.ts` **Line:** 542

```typescript
// media.ts empty input return
ratio: 0,
```

All other compressors return `ratio: 1` for empty/no-op cases (meaning "no compression happened"). A `ratio: 0` implies "compressed to nothing," which is misleading for empty input.

**Fix:** Return `ratio: 1` for consistency with other compressors.

### I-7: `search.ts` — No sanitization of `maxLines`/`maxTokens`

**File:** `packages/core/src/compressors/search.ts` **Lines:** 105-106

```typescript
const maxLines = options.maxLines;
const maxTokens = options.maxTokens;
```

Other compressors (`session.ts`, `api.ts`, `media.ts`) all use `sanitizePositiveInt()` to validate these values, guarding against negative numbers, `NaN`, and non-integer inputs. `search.ts` skips this validation entirely.

**Impact:** Negative `maxLines` or `maxTokens` would cause unexpected behavior in the truncation functions.

**Fix:** Add `sanitizePositiveInt` calls consistent with other compressors:
```typescript
const maxLines = sanitizePositiveInt(options.maxLines);
const maxTokens = sanitizePositiveInt(options.maxTokens);
```

---

## 🔵 Suggestion

### S-1: Extract `smartTruncateLines` to shared utility (code duplication)

**Files:**
- `packages/core/src/compressors/api.ts` lines 148-172
- `packages/core/src/compressors/media.ts` lines 216-240
- `packages/core/src/compressors/search.ts` lines 42-65

Identical function copy-pasted across 3 files. Should be extracted to a shared `utils.ts` module in `packages/core/src/compressors/`.

### S-2: Extract `smartTruncateByTokens` to shared utility (code duplication)

**Files:**
- `packages/core/src/compressors/api.ts` lines 174-228
- `packages/core/src/compressors/media.ts` lines 242-296

Nearly identical implementations. `search.ts` (lines 67-100) uses a different binary-search-based algorithm for the same purpose. All three should be unified into a single shared function.

### S-3: Extract `sanitizePositiveInt` to shared utility (code duplication)

**Files:**
- `packages/core/src/compressors/session.ts` lines 33-38
- `packages/core/src/compressors/api.ts` lines 37-42
- `packages/core/src/compressors/media.ts` lines 22-27

Identical function in 3 files. Trivial to extract.

### S-4: Extract `strictParseInt`/`requirePositiveInteger` to shared CLI utility (code duplication)

**Files:**
- `packages/cli/src/commands/session.ts`
- `packages/cli/src/commands/api.ts`
- `packages/cli/src/commands/search.ts`
- `packages/cli/src/commands/media.ts`

These parsing helpers are duplicated identically across all 4 CLI command files. Should be in a shared `packages/cli/src/utils.ts`.

### S-5: CLI commands pass unvalidated `string` for union types

**Files:**
- `packages/cli/src/commands/session.ts` line 54 (`strategy`)
- `packages/cli/src/commands/media.ts` (`format`, `language`)

Commander parses these as `string`, but the core types expect specific union types (e.g., `"time-decay" | "tool-focused" | "balanced"`). The CLI does runtime validation via `parseStrategy`/`parseFormat`/`parseLanguage`, but TypeScript can't verify this at compile time.

**Fix:** Add explicit `as const` assertion after validation:
```typescript
strategy: options.strategy as SessionOptions['strategy'],
```

### S-6: `session.ts` silent fallback for unknown strategy

**File:** `packages/core/src/compressors/session.ts` **Line:** 377

```typescript
default:  // Falls through to "balanced" behavior silently
```

An unknown strategy value silently produces "balanced" output without any warning. This makes debugging configuration errors difficult.

**Fix:** Log a warning or throw an error for unrecognized strategy values.

### S-7: `media.ts` — Overly complex blank-line cleanup

**File:** `packages/core/src/compressors/media.ts` **Lines:** 472-492

Four separate passes of trimming, filtering, and collapsing blank lines:
1. Trim each line
2. Filter empty lines
3. Collapse consecutive blanks
4. Final trim

This could be simplified to a single pass with a regex: `text.replace(/\n{3,}/g, '\n\n').trim()`.

### S-8: `search.ts` — `budgetExceeded` not exposed in metadata

**File:** `packages/core/src/compressors/search.ts` **Line:** ~176

Unlike `api.ts` and `media.ts`, the search compressor computes `budgetExceeded` internally but doesn't include it in the returned metadata. For consistency, it should be exposed.

### S-9: `media.ts` — Speaker label leak in edge case

**File:** `packages/core/src/compressors/media.ts` **Lines:** 455-457

```typescript
const text = line.replace(/^[^:]+:\s*/, '');
processedLines.push(text || line);  // Falls back to full line if text is empty
```

When both `removeSpeakerLabels` and `mergeSpeakers` are `true`, if the regex match produces an empty string (e.g., a line like `"Speaker 1: "`), the fallback `|| line` will re-insert the full line including the speaker label.

**Fix:** Use `text || ''` or filter out empty results instead of falling back to the original line.

### S-10: `createRequire` pattern in integration layers

**Files:**
- `packages/mcp-server/src/index.ts`
- `packages/oc-plugin/src/index.ts`

Both use `createRequire(import.meta.url)` to load `@10iii/air-core` as CJS in an ESM context. This works but is fragile — it will break if `air-core` is published as pure ESM in the future. Consider using dynamic `import()` instead.

### S-11: Test coverage gaps

**Missing tests:**
- `aggregator.test.ts`: No test for `position=0` (would trigger C-1 division by zero)
- `api.test.ts`: No test for prototype pollution via `__proto__` keys in JSON parsing
- `search.test.ts`: No tests for negative `maxLines`/`maxTokens` values (related to I-7)
- No CLI command tests for `searchCommand` or `mediaCommand` (may be out of scope)

---

## ℹ️ Informational

### N-1: All search engines are stubs

**File:** `packages/core/src/search/engines.ts`

All 4 search engine classes (`GoogleEngine`, `BingEngine`, `DuckDuckGoEngine`, `BraveEngine`) throw `"Not implemented"` on `search()`. This is clearly intentional (acknowledged in error messages) but worth noting — the search compressor currently only works with pre-provided content, not live search.

---

## Recommendations (Priority Order)

1. **Fix C-1 immediately** — division by zero is a runtime crash waiting to happen.
2. **Resolve I-1 (size metric inconsistency)** — decide on line count vs. char count and make all compressors consistent. This is a design decision that affects the public API.
3. **Fix I-5 (CLI defaults)** — align CLI defaults with core defaults to avoid user confusion.
4. **Address I-3/I-4 (O(n²) loops)** — for large conversations, these will cause noticeable latency.
5. **Extract shared utilities (S-1 through S-4)** — reduces maintenance burden and ensures bug fixes propagate.
6. **Add missing test cases (S-11)** — especially for C-1 (division by zero) to prevent regression.

---

## Files Reviewed

| # | File | Lines |
|---|------|-------|
| 1 | `packages/core/src/compressors/session.ts` | 458 |
| 2 | `packages/core/src/compressors/api.ts` | 360 |
| 3 | `packages/core/src/compressors/media.ts` | 558 |
| 4 | `packages/core/src/compressors/search.ts` | 212 |
| 5 | `packages/core/src/search/aggregator.ts` | 142 |
| 6 | `packages/core/src/search/engines.ts` | 79 |
| 7 | `packages/cli/src/commands/session.ts` | 59 |
| 8 | `packages/cli/src/commands/api.ts` | 64 |
| 9 | `packages/cli/src/commands/search.ts` | 50 |
| 10 | `packages/cli/src/commands/media.ts` | 79 |
| 11 | `packages/cli/src/cli.ts` | 43 |
| 12 | `packages/mcp-server/src/index.ts` | 413 |
| 13 | `packages/oc-plugin/src/index.ts` | 349 |
| 14 | `packages/core/src/__tests__/session.test.ts` | 912 |
| 15 | `packages/core/src/__tests__/api.test.ts` | 703 |
| 16 | `packages/core/src/__tests__/media.test.ts` | 689 |
| 17 | `packages/core/src/__tests__/search.test.ts` | 240 |
| 18 | `packages/core/src/__tests__/aggregator.test.ts` | 386 |
| 19 | `packages/core/src/__tests__/engines.test.ts` | 212 |
| 20 | `packages/core/src/compressors/index.ts` | 25 |
| 21 | `packages/core/src/index.ts` | 42 |
| ref | `packages/core/src/types.ts` | (reference) |
