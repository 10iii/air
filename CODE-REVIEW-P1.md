# AIR Code Review (P1)

Review scope: user-listed 14 groups of files (core/cli/tests/config) under `C:\usr\dev\air`.

## 总体评价

- 评分：**6/10**
- 关键结论：核心压缩逻辑结构清晰、测试数量充足（107 tests），但存在 **2 个会直接影响可用性的高优先问题**（CLI 构建产物不可执行、CLI 包 typecheck 失败），以及若干统计准确性/CLI 行为一致性问题。

## 验证证据

- `pnpm test`：通过（3 files, 107 tests）。
- `pnpm -r typecheck`：失败（CLI 包缺少 Node 类型，TS2307/TS2580）。
- `pnpm --filter @10iii/air build` + `node packages/cli/dist/cli.js --help`：运行时报 `SyntaxError`（dist 文件出现双 shebang）。
- 运行压缩器最小复现脚本：发现 `compressedSize`（字段）与实际输出行数不一致（截断 marker 内嵌换行导致）。

---

## 🔴 Critical（必须修复）

### 1) CLI 构建产物不可执行（双 shebang 导致 SyntaxError）

- 文件：
  - `packages/cli/src/cli.ts:1`
  - `packages/cli/tsup.config.ts:8-10`
- 问题描述：源码首行已经有 `#!/usr/bin/env node`，`tsup` 又通过 `banner.js` 注入同样 shebang，最终 `dist/cli.js` 前两行均为 shebang。Node 仅接受首行 hashbang，第二行触发语法错误。
- 影响：发布后的 CLI 二进制入口无法运行（`air --help` 直接崩溃）。
- 建议修复：二选一保留单一 shebang。
  - 推荐：保留 `src/cli.ts` 首行 shebang，删除 `packages/cli/tsup.config.ts` 的 `banner`。
  - 或反向：删除源码 shebang，仅保留 `banner`。

### 2) CLI 包 TypeScript 类型检查失败（Node 类型缺失）

- 文件：
  - `packages/cli/src/commands/read.ts:3,48`
  - `packages/cli/src/commands/bash.ts:3-4,76`
  - `packages/cli/package.json:21-24`
  - `tsconfig.json:2-19`（当前未提供 Node 类型）
- 问题描述：CLI 使用 `node:fs`、`node:child_process`、`process`，但工作区未为 CLI 提供 Node 类型声明，`pnpm -r typecheck` 报错 TS2307/TS2580。
- 影响：类型安全链路不闭环，CI 或发布前 typecheck 会失败。
- 建议修复：
  - 在 CLI（或根）增加 `@types/node` devDependency；
  - 在 CLI tsconfig（推荐）增加 `"types": ["node"]`；
  - 复跑 `pnpm -r typecheck` 作为合并前 gate。

---

## 🟡 Important（强烈建议修复）

### 3) `air bash` 执行模式丢失参数边界（`join(" ")` 破坏引号语义）

- 文件：`packages/cli/src/commands/bash.ts:42-48`
- 问题描述：`[command...]` 被拼成单字符串后传给 `execSync`，会丢失原始 argv 边界（如包含空格/引号的参数），导致执行结果与用户期望不一致。
- 风险：命令行为偏差，复杂命令（带空格参数、特殊字符）容易失败或语义变化。
- 建议修复：改用 `spawnSync(command[0], command.slice(1), { shell: false, encoding: "utf-8" })`；仅在明确需要 shell 特性时显式开启 `shell: true` 并文档化风险。

### 4) 压缩结果字段语义不一致（`size` 字段与 `ratio` 计算口径不同）

- 文件：
  - `packages/core/src/types.ts:9-14`
  - `packages/core/src/compressors/read.ts:435,473,486-489`
  - `packages/core/src/compressors/bash.ts:423,461,478-481`
- 问题描述：`types.ts` 注释声明 `originalSize/compressedSize` 是 size（bytes/tokens），但实现中返回的是**行数**；`ratio` 却按**字符长度**计算。字段间口径冲突。
- 风险：上层调用方按字段名推导压缩率会得到错误结论；API 可预期性受损。
- 建议修复：统一口径（推荐都用字符数，行数放 metadata），并同步修正文档与测试断言。

### 5) 截断标记字符串内嵌换行，导致行数统计失真

- 文件：
  - `packages/core/src/compressors/read.ts:369`
  - `packages/core/src/compressors/bash.ts:325,336,361`
- 问题描述：marker 使用 ``"\n... (...) ...\n"`` 作为“单个数组元素”插入，`compressedLineCount = lines.length` 无法反映真实输出行数。
- 风险：footer 与 metadata 的行数统计不准确，影响下游预算与显示。
- 建议修复：marker 不要内嵌换行，改为纯单行：`"... (N lines omitted) ..."`。

### 6) 多语言注释/导入折叠提示硬编码为 `//`，与语言语法不一致

- 文件：
  - `packages/core/src/compressors/read.ts:234-235`
  - `packages/core/src/compressors/read.ts:292-294`
- 问题描述：Python/Shell/Ruby 等非 `//` 语言也会输出 `// ...` 折叠提示。
- 风险：输出可读性下降，且对“保留原语言风格”的目标有偏差。
- 建议修复：按 `lang.lineComment` 选择提示前缀（无单行注释语言可用中性 marker）。

### 7) 测试覆盖主要集中 core，CLI 关键路径缺少集成测试

- 文件：
  - `packages/core/src/__tests__/read.test.ts`
  - `packages/core/src/__tests__/bash.test.ts`
  - `vitest.config.ts:6`
- 问题描述：当前测试几乎全部覆盖 core，缺少 CLI 构建产物可执行性、参数解析与 stdin/command 两模式集成测试。
- 风险：本次双 shebang 问题和 `bash` 参数拼接问题都未被测试捕获。
- 建议修复：新增 `packages/cli/tests/*.test.ts`，至少覆盖：
  1. `air --help` 可执行；
  2. `air read -` stdin 模式；
  3. `air bash` 参数含空格场景；
  4. 构建后 dist 入口 smoke test。

---

## 🟢 Suggestion（可选改进）

### 8) `savedPercent` 可能为负值，文案会出现“负 saved”

- 文件：
  - `packages/core/src/compressors/read.ts:476-480`
  - `packages/core/src/compressors/bash.ts:468-473`
- 问题描述：当压缩后内容变长（常见于短输入 + stats/footer）会得到负百分比，如 `(-110% saved)`。
- 建议修复：若 `compressed > original`，改为 `expanded X%` 或对外显示 `0% saved` 并在 metadata 标记 expanded。

### 9) `air read` 文件读取错误未做用户友好处理

- 文件：`packages/cli/src/commands/read.ts:29-35`
- 问题描述：不存在路径/权限错误直接抛原始异常，CLI UX 较硬。
- 建议修复：在 action 内部 catch，输出简洁错误到 stderr，并以非零码退出。

### 10) 根清理脚本跨平台兼容性一般

- 文件：`package.json:13`
- 问题描述：`pnpm -r exec rm -rf dist` 在部分 Windows shell 环境可移植性较差。
- 建议修复：使用 `rimraf`（或 `del-cli`）统一跨平台行为。

---

## 📝 Note（信息性备注）

- 代码组织（core parser/compressor/CLI 分层）总体清晰，扩展到 `air-test`/`air-grep` 有可复用基础。
- 目前正则使用未发现明显高风险 ReDoS 入口（均为内置固定模式，非用户可注入 regex）。
- 安全方面：`air bash` 本质执行用户给定命令，属于预期能力；建议在 README 明确“不要执行不可信输入”。

---

## 建议修复优先级（执行顺序）

1. 先修复 CLI 双 shebang（阻断可执行性）。
2. 修复 Node 类型声明并让 `pnpm -r typecheck` 通过。
3. 修复 `air bash` 参数执行模型（argv 保真）。
4. 统一 `CompressResult` 统计口径 + 截断 marker 行计数问题。
5. 补 CLI 集成测试，防止回归。
