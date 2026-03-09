# Phase 1 压缩效果基准测试

> 测试日期: 2026-03-09
> 测试工具: air v0.1.0 (CLI: `node packages/cli/dist/cli.js`)

## air-read 默认选项

| 文件 | 类型 | 原始行数 | 压缩后 | 节省% | 选项 |
|---|---|---|---|---|---|
| compressors/read.ts | TypeScript | 571 | 550 | 6% | 默认 |
| compressors/bash.ts | TypeScript | 545 | 515 | 8% | 默认 |
| read.test.ts | TypeScript (test) | 1013 | 1008 | 1% | 默认 |
| DESIGN.md | Markdown | 2608 | 2608 | 1% | 默认 |
| package.json | JSON | 24 | 24 | 0% | 默认 |
| test-sample.py | Python | 146 | 110 | 23% | 默认 |

## air-read --line-numbers

| 文件 | 类型 | 原始行数 | 压缩后 | 节省% | 选项 |
|---|---|---|---|---|---|
| compressors/read.ts | TypeScript | 571 | 550 | -10% | --line-numbers |
| compressors/bash.ts | TypeScript | 545 | 515 | -6% | --line-numbers |
| DESIGN.md | Markdown | 2608 | 2608 | -22% | --line-numbers |
| test-sample.py | Python | 146 | 110 | 12% | --line-numbers |

> 注: 负值表示添加行号前缀导致字符数增加（行数仍有压缩但总字节膨胀）。

## air-read --max-lines 50

| 文件 | 类型 | 原始行数 | 压缩后 | 节省% | 选项 |
|---|---|---|---|---|---|
| compressors/read.ts | TypeScript | 571 | 49 | 92% | --max-lines 50 |
| compressors/bash.ts | TypeScript | 545 | 48 | 92% | --max-lines 50 |
| read.test.ts | TypeScript (test) | 1013 | 48 | 95% | --max-lines 50 |
| DESIGN.md | Markdown | 2608 | 45 | 98% | --max-lines 50 |
| test-sample.py | Python | 146 | 49 | 72% | --max-lines 50 |

## air-read --no-collapse-comments

| 文件 | 类型 | 原始行数 | 压缩后 | 节省% | 选项 |
|---|---|---|---|---|---|
| compressors/read.ts | TypeScript | 571 | 571 | 0% | --no-collapse-comments |
| compressors/bash.ts | TypeScript | 545 | 545 | 0% | --no-collapse-comments |
| test-sample.py | Python | 146 | 137 | 4% | --no-collapse-comments |

> 注: 禁用注释折叠后，TypeScript 文件几乎无压缩（仅 import 折叠生效）；Python 仍有 4% 来自 import 折叠。

## air-bash

| 输入 | 原始行数 | 压缩后 | 节省% |
|---|---|---|---|
| npm install 输出 | 61 | 39 | 23% |
| 编译输出 (TS warnings+errors) | 35 | 35 | 0% |
| 测试输出 (vitest) | 72 | 72 | 0% |
| git log 输出 | 120 | 120 | 0% |

## 结论

### air-read
1. **Python 文件压缩效果最好（23%）**：docstring 折叠 + 注释折叠 + import 折叠三重生效。
2. **TypeScript 源码约 6-8%**：主要来自注释块折叠和 import 折叠；代码行保持完整。
3. **测试文件压缩极少（1%）**：测试代码几乎无大块注释/import 可折叠。
4. **JSON 无压缩（0%）**：设计预期，数据格式不适合注释/import 折叠。
5. **Markdown 几乎无压缩（1%）**：虽然有 HTML 注释检测，实际 Markdown 内容少有可折叠块。
6. **--max-lines 50 截断效果显著（72-98%）**：head+tail 智能截断按预期工作。
7. **--line-numbers 添加行号会增加总字节**：行数压缩仍生效但前缀导致字符膨胀。
8. **--no-collapse-comments 禁用注释折叠**：TypeScript 文件压缩降为 0%，确认注释折叠是主要压缩来源。

### air-bash
1. **npm install 输出压缩 23%**：重复的 `added X package` 行被折叠 + noise 过滤生效。
2. **编译/测试/git log 输出无压缩**：这些输出结构化但行间差异大，不触发重复折叠。
3. **air-bash 对含大量重复行的输出效果好**；对结构化但非重复的输出保持原样（保守策略）。
