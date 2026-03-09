# AIR Code Review — R2 (Deep Review + Fix Verification)

Review date: 2026-03-09

## Scope Reviewed

Source files:
- `packages/core/src/compressors/read.ts`
- `packages/core/src/compressors/bash.ts`
- `packages/core/src/parsers/file.ts`
- `packages/core/src/types.ts`
- `packages/cli/src/commands/read.ts`
- `packages/cli/src/commands/bash.ts`
- `packages/cli/src/cli.ts`

Test files:
- `packages/core/src/__tests__/read.test.ts`
- `packages/core/src/__tests__/bash.test.ts`
- `packages/core/src/index.test.ts`

Docs alignment:
- `PRD.md`
- `DESIGN.md`
- `RESEARCH.md`
- `TOOL-INVENTORY.md`

## Score & Trend

- R1 (`CODE-REVIEW-P1.md`): **6.0 / 10**
- Prior R2 (`CODE-REVIEW-P1-R2.md`): **8.0 / 10**
- This round: **9.0 / 10**

Trend: quality continues to improve; no open Critical issue after this round's fixes.

## Critical / Important Findings in This Round

### I-01 (Important) Token-budget truncation had quadratic behavior on large outputs

- Location: `packages/core/src/compressors/read.ts:393`, `packages/core/src/compressors/bash.ts:360`
- Problem: token truncation scanned line budgets linearly from `N -> 1`, repeatedly recomputing truncation output.
- Risk: large outputs can cause avoidable latency spikes.
- Fix applied:
  - replaced linear full-range probing with coarse-to-fine search plus token caching;
  - complexity reduced from O(n) truncation attempts to approximately O(sqrt(n)) attempts.

### I-02 (Important) `maxLines` contract could be violated at boundary (`lines == maxLines`)

- Location: `packages/core/src/compressors/read.ts:505`, `packages/core/src/compressors/bash.ts:472`
- Problem: footer line was reserved only when `lines.length > maxLines`; if equal, final output became `maxLines + 1`.
- Risk: API budget contract mismatch for strict callers.
- Fix applied:
  - compute effective budgets using reserved footer capacity before truncation;
  - enforce budget against final output;
  - when budget is too small to fit footer (for example `maxLines=1`), omit stats line and expose `metadata.statsIncluded`.

## Test Quality Updates

Added regression tests to prevent the above issues from returning:
- `packages/core/src/__tests__/read.test.ts`
  - final output line-count must respect `maxLines` including footer;
  - stats omission behavior when `maxLines` is too small.
- `packages/core/src/__tests__/bash.test.ts`
  - same two cases for `air-bash` compressor.

## Verification Evidence

- `lsp_diagnostics` on all modified files: **no diagnostics**
- `pnpm test`: **3 files, 144 tests passed**
- `pnpm typecheck`: **workspace typecheck passed**
- `pnpm -r build`: **workspace build passed**

## R1 Comparison (Fixed vs Unresolved)

From `CODE-REVIEW-P1.md`:

- Critical items: **2/2 fixed**
  - CLI double-shebang execution breakage: fixed
  - CLI Node typecheck failures: fixed

- Important items: **4/5 fixed, 1 carried as suggestion**
  - argv boundary loss in `air bash`: fixed
  - compression stats/ratio consistency defects: fixed (line-based contract is now internally consistent)
  - truncation marker line-count distortion: fixed
  - language-inconsistent collapse hint prefix: fixed
  - CLI integration test coverage depth: still a gap (suggestion level in this round)

## Doc Alignment Notes

- Current implementation is production-ready for `air-read` and `air-bash`.
- `PRD.md`/`DESIGN.md` describe a broader 9-tool roadmap; this is acceptable as roadmap content, but readers should treat it as target-state rather than current shipped scope.

## Final Assessment

- Post-fix status: **no open Critical/Important defect introduced by this round's review scope**.
- Main remaining risk is maintainability/coverage breadth (especially CLI integration tests), not immediate correctness.
