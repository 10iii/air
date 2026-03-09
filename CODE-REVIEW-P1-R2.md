# AIR Code Review — P1 Round 2

Review scope (as requested):
- `packages/core/src/compressors/read.ts`
- `packages/core/src/compressors/bash.ts`
- `packages/core/src/parsers/file.ts`
- `packages/core/src/types.ts`
- `packages/cli/src/commands/read.ts`
- `packages/cli/src/commands/bash.ts`
- `packages/cli/src/cli.ts`

`CODE-REVIEW-P1.md` items are treated as already fixed and are not repeated here.

## Overall Score

- **8.0 / 10**
- 结论：整体质量较稳，P1 关键问题回归未见；本轮发现 1 个会突破预算约束的 Critical，以及 5 个 Important 级边界/API 一致性问题。

---

## 🔴 Critical

### R2-01: `maxTokens` 在极小预算时会“失效并回退为原始输出”

- 文件：`packages/core/src/compressors/read.ts:406`, `packages/core/src/compressors/read.ts:418`, `packages/core/src/compressors/bash.ts:367`, `packages/core/src/compressors/bash.ts:379`
- 问题：`smartTruncateByTokens()` 初始化 `bestMaxLines = lines.length`。当 `tryLines=1` 也无法满足 `tokens <= maxTokens`（如 marker 本身 token 就超预算）时，循环不会更新 `bestMaxLines`，最终返回接近原始内容。
- 影响：调用方设置严格 token 上限时，结果可能远超预算，属于约束失效。
- 建议：将默认值改为最小可返回解（如 `1`），或显式返回“无法满足预算”的最小输出分支（含 metadata 标志）。

---

## 🟡 Important

### R2-02: `maxLines` / `maxTokens` 在最终输出层被 footer 再次突破

- 文件：`packages/core/src/compressors/read.ts:479`, `packages/core/src/compressors/read.ts:500`, `packages/core/src/compressors/read.ts:502`, `packages/core/src/compressors/bash.ts:444`, `packages/core/src/compressors/bash.ts:464`, `packages/core/src/compressors/bash.ts:466`
- 问题：截断在 `lines` 阶段完成，但随后无条件追加 stats footer。
- 影响：`--max-lines` 实际输出通常为 `maxLines + 1`；`--max-tokens` 也可能被 footer 超限。
- 建议：将 footer 纳入预算，或提供 `includeStats` 开关并默认对预算场景关闭。

### R2-03: CLI 数值参数解析过于宽松，接受畸形输入

- 文件：`packages/cli/src/commands/read.ts:24`, `packages/cli/src/commands/read.ts:25`, `packages/cli/src/commands/bash.ts:28`, `packages/cli/src/commands/bash.ts:29`
- 问题：`parseInt` 会接受前缀数字（如 `10foo` -> `10`，`1e3` -> `1`），随后通过正整数校验。
- 影响：用户输入被静默截断，CLI 行为与预期不一致。
- 建议：改用严格 parser（`/^[1-9]\d*$/`）或 `Number()` + `Number.isInteger` 全字符串校验。

### R2-04: 子进程被 signal 终止时，CLI 可能错误返回 0

- 文件：`packages/cli/src/commands/bash.ts:89`
- 问题：`commandExitCode = proc.status ?? (proc.error ? 1 : 0)` 未考虑 `proc.signal`（`status` 可为 `null`，且无 `error`）。
- 影响：命令异常终止被上报为成功，破坏脚本链路可靠性。
- 建议：`proc.signal` 非空时返回非零退出码（如 128+signal 或统一 1）。

### R2-05: JS `import` 检测正则会误匹配普通 `require(` 语句

- 文件：`packages/core/src/parsers/file.ts:33`, `packages/core/src/compressors/read.ts:261`
- 问题：`/^\s*require\(/` 把函数体内普通调用也当成 import 行。
- 影响：`collapseImports()` 可能折叠业务代码段（尤其 `require()` 连续出现时），可读性和语义线索下降。
- 建议：收紧到顶层常见形态（例如 `const x = require(...)` / `import`），或在压缩器层增加“仅文件头部 import 区域”约束。

### R2-06: ANSI 正则漏匹配常见 CSI private mode 序列

- 文件：`packages/core/src/compressors/bash.ts:36`, `packages/core/src/compressors/bash.ts:52`
- 问题：当前 CSI 子模式仅允许 `[0-9;]*`，无法匹配 `\x1b[?25l`、`\x1b[?25h` 这类常见控制序列。
- 影响：残留控制字符会污染压缩输出，影响后续噪声判定与阅读。
- 建议：扩展 CSI 参数字符集（至少覆盖 `?`）或采用更完整的 ANSI strip 模式。

---

## 🟢 Positive

- `collapseImports` 已有限制上限（`(i - blockStart) < 100`），避免无界扫描（`packages/core/src/compressors/read.ts:266`）。
- 注释折叠提示已按语言前缀输出（不再固定 `//`），跨语言一致性明显提升（`packages/core/src/compressors/read.ts:232`, `packages/core/src/compressors/read.ts:290`）。
- `air bash` 多参数执行已采用 argv 保真路径（`spawnSync(command[0], command.slice(1), { shell: false })`），较 P1 风险模型更稳（`packages/cli/src/commands/bash.ts:65`）。

---

## 📝 Notes (Code Smell / Maintainability)

- `requirePositiveInteger` 在 `read.ts` 与 `bash.ts` 重复实现，可抽到共享 CLI util（`packages/cli/src/commands/read.ts:5`, `packages/cli/src/commands/bash.ts:6`）。
- `50 * 1024 * 1024` 为硬编码缓冲区魔法数字，建议命名常量并文档化依据（`packages/cli/src/commands/bash.ts:62`, `packages/cli/src/commands/bash.ts:68`）。
- 两个 compressor 的 `compress()` 函数偏长，后续可按“预处理/压缩/预算/统计”拆段提升可测试性。

---

## Recommended Fix Order

1. `R2-01` token 预算失效（Critical，先修）
2. `R2-02` footer 导致预算超限（API 契约问题）
3. `R2-04` signal 退出码修正（CLI 自动化可靠性）
4. `R2-03` 严格参数解析（用户输入一致性）
5. `R2-05` + `R2-06` 正则精度修正（误匹配/漏匹配）
