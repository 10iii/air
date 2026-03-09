# AIR (AI Ergonomics) — 技术设计文档

> **设计理念**：Prevention over Cleanup。在工具输出进入 AI 上下文前完成优化，而非事后压缩。

> **变更日志**
> - v0.2 (2026-03-09): 对齐 PRD v0.3，工具从 3 扩展至 9 个（air-run 更名 air-bash；新增 air-grep/air-edit/air-web/air-ls/air-context/air-diff），包结构更新为 4 包（core/cli/mcp-server/oc-plugin），开发计划对齐 5 阶段路线图，删除 air-repomap（ai-see scout 已覆盖）
> - v0.1 (2026-03-09): 初版（air-test/air-read/air-run 三工具设计）

---

## 1. 架构概览

### 1.1 设计哲学

AIR 的核心设计原则源自 RESEARCH.md 中的调研发现：

| 原则 | 说明 | 依据 |
|---|---|---|
| **Prevention > Cleanup** | 在输出层拦截噪音，不让无用信息进入 context | Claude Code #31279 讨论共识：事后清理需额外 LLM 调用、有信息丢失风险、增加延迟 |
| **Rule-based > LLM-based** | 摘要引擎使用确定性规则，不依赖 LLM API | 避免递归成本、保证输出确定性、零网络延迟、离线可用 |
| **Progressive Disclosure** | 先给骨架/摘要，AI 需要时再请求详情 | Aider repo-map 模式的成功验证 |
| **Cross-platform** | 不绑定特定 IDE 或 AI coding 工具 | 调研发现各框架 hook 机制不统一，独立工具更可行 |

### 1.2 系统架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Integration Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   OC Plugin  │  │  MCP Server  │  │     CLI      │  │ Future Hook  │ │
│  │ 9 air_* tools│  │ stdio / SSE  │  │ npx air ...  │  │ PostToolUse  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
└─────────┼─────────────────┼─────────────────┼─────────────────┼─────────┘
          │                 │                 │                 │
          ▼                 ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Core Engine (@air/core)                         │
│                                                                         │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │
│  │  Output Parser │  │   Summarizer   │  │ Storage Layer  │            │
│  │                │  │                │  │                │            │
│  │  - pytest      │  │  - Test rules  │  │  - Raw output  │            │
│  │  - jest        │  │  - File rules  │  │  - Retrieval   │            │
│  │  - vitest      │  │  - Cmd rules   │  │  - TTL cleanup │            │
│  │  - go test     │  │  - Diff rules  │  │                │            │
│  │  - cargo test  │  │  - Grep rules  │  │                │            │
│  │  - generic     │  │  - Web rules   │  │                │            │
│  └────────────────┘  └────────────────┘  └────────────────┘            │
│                                                                         │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │
│  │  AST Parser    │  │    Metrics     │  │  Edit Engine   │            │
│  │  (tree-sitter) │  │   Collector    │  │ (search/replace│            │
│  └────────────────┘  └────────────────┘  │  + fuzzy match)│            │
│                                          └────────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Tool Wrappers (9 tools)                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│ │ air-read │ │ air-bash │ │ air-test │ │ air-grep │ │ air-edit │      │
│ │          │ │          │ │          │ │          │ │          │      │
│ │ T1 (P0)  │ │ T1 (P0)  │ │ T1 (P1)  │ │ T1 (P1)  │ │ T1 (P1)  │      │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
│ │ air-web  │ │ air-ls   │ │air-contxt│ │ air-diff │                   │
│ │          │ │          │ │          │ │          │                   │
│ │ T2 (P2)  │ │ T2 (P2)  │ │ T2 (P2)  │ │ T3 (P3)  │                   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
```

> **注**：air-repomap 已删除——ai-see 项目的 scout 命令已提供类似的代码库结构感知功能，不再重复建设。

### 1.3 数据流

```
User/AI Request
      │
      ▼
┌─────────────────┐
│  Tool Wrapper   │  执行原始命令 (pytest, read file, shell cmd)
└────────┬────────┘
         │
         ▼ Raw Output (可能 5000+ tokens)
┌─────────────────┐
│  Output Parser  │  识别输出类型，提取结构化数据
└────────┬────────┘
         │
         ▼ Structured Data
┌─────────────────┐
│   Summarizer    │  根据规则生成摘要，控制 token 预算
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐  ┌────────┐
│Storage│  │ Output │  AEO 格式，包含摘要 + raw 引用
└───────┘  └────────┘
  (raw)     (< 500 tokens)
```

### 1.4 组件边界

每个组件职责单一，接口清晰：

| 组件 | 输入 | 输出 | 职责边界 |
|---|---|---|---|
| Tool Wrapper | 命令字符串 | Raw stdout/stderr + exit code | 仅负责执行，不做任何处理 |
| Output Parser | Raw output + tool type | Structured intermediate | 仅负责解析，不做截断 |
| Summarizer | Structured data + token budget | Summary string | 仅负责摘要，不做存储 |
| Storage | Raw output + metadata | File path + retrieval API | 仅负责持久化，不做处理 |
| Edit Engine | Search/replace 指令 + 文件内容 | 变更结果 + diff 摘要 | 仅负责编辑定位和应用 |

---

## 2. 核心引擎 (@air/core)

### 2.1 Output Parser

#### 2.1.1 Parser Registry 模式

```typescript
// Parser 接口定义
interface OutputParser {
  name: string;
  detect(output: string, command?: string): boolean;  // 自动检测输出类型
  parse(output: string): ParsedOutput;
}

interface ParsedOutput {
  type: 'test' | 'file' | 'command' | 'diff' | 'grep' | 'web' | 'directory' | 'generic';
  status: 'success' | 'failure' | 'partial';
  structured: Record<string, unknown>;  // 类型特定的结构化数据
  rawTokens: number;                    // 原始输出估算 tokens
}

// Registry 支持动态注册
class ParserRegistry {
  private parsers: OutputParser[] = [];
  
  register(parser: OutputParser): void { ... }
  
  detect(output: string, command?: string): OutputParser {
    // 按优先级尝试检测，返回第一个匹配的 parser
    // 最后 fallback 到 GenericParser
  }
}
```

#### 2.1.2 Test Output Parsers

支持的测试框架及检测规则：

| 框架 | 检测模式 | 关键提取项 |
|---|---|---|
| pytest | `=+ .+ =+` 分隔线 + `PASSED\|FAILED\|ERROR` | passed/failed/skipped 计数，失败测试名 + 错误消息 + 文件位置 |
| jest | `Test Suites:` 或 `Tests:` 行 | 同上 |
| vitest | `✓` / `×` 符号 + `Test Files` 行 | 同上 |
| go test | `--- PASS:` / `--- FAIL:` 行 | 同上 |
| cargo test | `test result:` 行 | 同上 |

**pytest parser 实现示例**：

```typescript
class PytestParser implements OutputParser {
  name = 'pytest';
  
  detect(output: string): boolean {
    // 检测 pytest 特征模式
    return /^={3,}.*={3,}$/m.test(output) && 
           /\d+ passed|\d+ failed|\d+ error/i.test(output);
  }
  
  parse(output: string): ParsedOutput {
    const lines = output.split('\n');
    
    // 1. 提取统计行 (通常在末尾)
    const summaryLine = lines.find(l => /\d+ passed/.test(l));
    const stats = this.parseStats(summaryLine);
    
    // 2. 提取失败测试详情
    const failures = this.extractFailures(lines);
    
    // 3. 计算原始 tokens
    const rawTokens = this.estimateTokens(output);
    
    return {
      type: 'test',
      status: stats.failed > 0 ? 'failure' : 'success',
      structured: { stats, failures, duration: this.extractDuration(lines) },
      rawTokens
    };
  }
  
  private extractFailures(lines: string[]): TestFailure[] {
    // 找到 FAILURES 段落
    // 解析每个失败测试：名称、文件、行号、错误类型、错误消息
    // 去重：相同错误类型的测试合并展示
  }
}
```

#### 2.1.3 Generic Parser

对于未知输出类型，提供基于行的通用解析：

```typescript
class GenericParser implements OutputParser {
  name = 'generic';
  
  detect(): boolean {
    return true;  // 兜底 parser，始终匹配
  }
  
  parse(output: string): ParsedOutput {
    const lines = output.split('\n');
    
    // 启发式分析
    const errorLines = lines.filter(l => /error|exception|fail/i.test(l));
    const warningLines = lines.filter(l => /warning|warn/i.test(l));
    
    return {
      type: 'generic',
      status: errorLines.length > 0 ? 'failure' : 'success',
      structured: {
        totalLines: lines.length,
        errorLines: errorLines.slice(0, 10),  // 保留前 10 个错误
        warningLines: warningLines.slice(0, 5),
        lastLines: lines.slice(-5)  // 保留最后 5 行
      },
      rawTokens: this.estimateTokens(output)
    };
  }
}
```

### 2.2 Summarization Engine

#### 2.2.1 核心原则

摘要引擎是 **规则驱动** 的，设计决策：

| 考量 | LLM-based 摘要 | Rule-based 摘要 (选择) |
|---|---|---|
| 成本 | 每次调用消耗 API 额度 | 零成本 |
| 延迟 | 数百毫秒到数秒 | < 10ms |
| 确定性 | 相同输入可能不同输出 | 完全确定性 |
| 可审计 | 黑盒 | 规则透明可检查 |
| 离线 | 不可用 | 可用 |

权衡：Rule-based 方案牺牲了一定的"智能"，但对于结构化输出（测试结果、命令输出），规则足够覆盖常见场景。

#### 2.2.2 摘要策略

```typescript
interface SummarizationStrategy {
  type: ParsedOutput['type'];
  summarize(parsed: ParsedOutput, budget: number): Summary;
}

interface Summary {
  text: string;          // 人/AI 可读的摘要文本
  tokens: number;        // 摘要 tokens
  truncated: boolean;    // 是否被截断
  retrievalHint?: string;  // 如何获取更多详情
}
```

**测试输出策略**：

```typescript
class TestSummarizationStrategy implements SummarizationStrategy {
  type = 'test';
  
  summarize(parsed: ParsedOutput, budget: number): Summary {
    const { stats, failures } = parsed.structured;
    
    // 优先级队列：统计 > 失败详情 > 其他
    let text = `Tests: ${stats.passed} passed, ${stats.failed} failed`;
    if (stats.skipped > 0) text += `, ${stats.skipped} skipped`;
    text += ` (${stats.duration})`;
    
    let tokens = this.estimateTokens(text);
    
    // 在预算内尽可能添加失败详情
    if (failures.length > 0 && tokens < budget - 50) {
      text += '\n\nFAILED:';
      for (const f of failures) {
        const failLine = `\n- ${f.test}\n  ${f.error}`;
        const failTokens = this.estimateTokens(failLine);
        if (tokens + failTokens > budget) {
          text += `\n... ${failures.length - failures.indexOf(f)} more failures`;
          break;
        }
        text += failLine;
        tokens += failTokens;
      }
    }
    
    return { text, tokens, truncated: tokens >= budget };
  }
}
```

**命令输出策略**：

```typescript
class CommandSummarizationStrategy implements SummarizationStrategy {
  type = 'command';
  
  summarize(parsed: ParsedOutput, budget: number): Summary {
    const { status } = parsed;
    const { errorLines, lastLines, totalLines } = parsed.structured;
    
    if (status === 'success') {
      // 成功：极简输出
      return {
        text: `✓ Command completed (${totalLines} lines output)`,
        tokens: 15,
        truncated: false
      };
    }
    
    // 失败：错误信息 + 上下文
    let text = '✗ Command failed\n\n';
    
    // 优先展示错误行
    for (const line of errorLines) {
      text += line + '\n';
    }
    
    // 如果还有预算，添加上下文
    // ...
    
    return { text, tokens, truncated: true };
  }
}
```

**文件内容策略**：

```typescript
class FileSummarizationStrategy implements SummarizationStrategy {
  type = 'file';
  
  summarize(parsed: ParsedOutput, budget: number): Summary {
    const { mode, content, ast } = parsed.structured;
    
    switch (mode) {
      case 'skeleton':
        // AST 提取的骨架，通常已经很精简
        return { text: this.formatSkeleton(ast), tokens: ... };
        
      case 'focused':
        // 目标代码段 + 最小上下文
        return { text: this.formatFocused(content), tokens: ... };
        
      case 'full':
        // 完整内容，可能需要截断
        return this.truncateTobudget(content, budget);
    }
  }
}
```

#### 2.2.3 Token 预算系统

```typescript
interface TokenBudget {
  max: number;           // 最大 tokens (default: 500)
  reserve: number;       // 保留给元信息的 tokens (default: 50)
  priorities: Priority[];  // 内容优先级
}

enum Priority {
  CRITICAL = 0,   // 错误信息，必须保留
  HIGH = 1,       // 警告、失败详情
  MEDIUM = 2,     // 上下文、统计
  LOW = 3         // 成功详情、进度信息
}

// Token 估算：简单的字符/4 规则，足够准确
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

### 2.3 Storage Layer

#### 2.3.1 设计决策

完整原始输出必须保留，原因：

1. AI 可能需要更多详情（progressive disclosure）
2. 调试和审计需求
3. 用户可能手动查看

但不应污染 context，所以：

- 存储在 context 外部（文件系统）
- 提供检索 API
- 自动清理过期数据

#### 2.3.2 存储格式

```
~/.air/
├── outputs/
│   ├── 20260309-103042-pytest-a1b2c3d4.txt    # 原始输出
│   ├── 20260309-103042-pytest-a1b2c3d4.json   # 元数据
│   └── ...
├── metrics.jsonl    # 追加写入的指标日志
└── config.json      # 用户配置
```

**元数据文件结构**：

```json
{
  "id": "20260309-103042-pytest-a1b2c3d4",
  "tool": "air-test",
  "command": "pytest tests/ -v",
  "timestamp": "2026-03-09T10:30:42Z",
  "exitCode": 1,
  "rawTokens": 4200,
  "optimizedTokens": 280,
  "ttl": "24h"
}
```

#### 2.3.3 Retrieval API

```typescript
// 获取完整原始输出
async function retrieve(outputId: string): Promise<string>;

// 获取特定段落（用于大输出）
async function retrieveSection(
  outputId: string, 
  options: { start?: number; end?: number; grep?: string }
): Promise<string>;

// 列出最近的输出
async function listRecent(limit?: number): Promise<OutputMetadata[]>;

// 清理过期输出
async function cleanup(olderThan?: string): Promise<number>;
```

**CLI 用法**：

```bash
# 获取完整输出
air retrieve 20260309-pytest-a1b2c3

# 获取特定段落
air retrieve 20260309-pytest-a1b2c3 --lines 100-150

# 搜索输出
air retrieve 20260309-pytest-a1b2c3 --grep "AssertionError"
```

---

## 3. Tool 1: air-test [T1/P1]

### 3.1 支持的测试框架

| 框架 | 语言 | 检测命令模式 | 解析难度 |
|---|---|---|---|
| pytest | Python | `pytest`, `python -m pytest` | 中（有标准化输出格式） |
| jest | JS/TS | `jest`, `npx jest` | 中 |
| vitest | JS/TS | `vitest`, `npx vitest` | 中（与 jest 类似） |
| mocha | JS/TS | `mocha`, `npx mocha` | 较难（输出格式多变） |
| go test | Go | `go test` | 低（输出格式稳定） |
| cargo test | Rust | `cargo test` | 低 |

Phase 1 优先支持：pytest, jest, vitest（覆盖最多用户场景）。

### 3.2 输出格式 (AEO)

```typescript
interface AieTestOutput {
  tool: 'air-test';
  runner: string;              // 'pytest' | 'jest' | 'vitest' | ...
  command: string;             // 原始命令
  status: 'PASS' | 'FAIL' | 'ERROR';
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: string;          // "12.3s"
  };
  failures: Array<{
    test: string;              // 测试函数/用例名
    file: string;              // 文件:行号
    error: string;             // 简短错误描述
    context?: string;          // 错误上下文（如断言的实际值）
  }>;
  rawOutputFile: string;       // 完整输出路径
  metrics: {
    rawTokens: number;
    optimizedTokens: number;
    savingsPercent: string;    // "93%"
  };
}
```

**示例输出**：

```json
{
  "tool": "air-test",
  "runner": "pytest",
  "command": "pytest tests/ -v",
  "status": "FAIL",
  "summary": {
    "total": 142,
    "passed": 138,
    "failed": 3,
    "skipped": 1,
    "duration": "12.3s"
  },
  "failures": [
    {
      "test": "test_auth_login_invalid_password",
      "file": "tests/test_auth.py:45",
      "error": "AssertionError: expected 401, got 200",
      "context": "response = client.post('/login', data={'password': 'wrong'})"
    },
    {
      "test": "test_user_create_duplicate",
      "file": "tests/test_user.py:89",
      "error": "IntegrityError: UNIQUE constraint failed"
    }
  ],
  "rawOutputFile": "~/.air/outputs/20260309-pytest-a1b2c3.txt",
  "metrics": {
    "rawTokens": 4200,
    "optimizedTokens": 280,
    "savingsPercent": "93%"
  }
}
```

### 3.3 实现细节

```typescript
// packages/core/src/tools/air-test.ts

import { spawn } from 'child_process';
import { ParserRegistry } from '../parsers';
import { SummarizerRegistry } from '../summarizers';
import { Storage } from '../storage';

export async function airTest(
  command: string,
  options: { budget?: number; verbose?: boolean } = {}
): Promise<AieTestOutput> {
  const budget = options.budget ?? 500;
  
  // 1. 执行测试命令
  const { stdout, stderr, exitCode } = await executeCommand(command);
  const rawOutput = stdout + stderr;
  
  // 2. 检测并解析输出
  const parser = ParserRegistry.detect(rawOutput, command);
  const parsed = parser.parse(rawOutput);
  
  // 3. 生成摘要
  const summarizer = SummarizerRegistry.get(parsed.type);
  const summary = summarizer.summarize(parsed, budget);
  
  // 4. 存储原始输出
  const outputId = await Storage.store(rawOutput, {
    tool: 'air-test',
    command,
    exitCode
  });
  
  // 5. 记录指标
  await Metrics.log({
    tool: 'air-test',
    rawTokens: parsed.rawTokens,
    optimizedTokens: summary.tokens,
    timestamp: new Date()
  });
  
  // 6. 返回 AEO 格式输出
  return {
    tool: 'air-test',
    runner: parser.name,
    command,
    status: exitCode === 0 ? 'PASS' : 'FAIL',
    summary: parsed.structured.stats,
    failures: parsed.structured.failures ?? [],
    rawOutputFile: Storage.getPath(outputId),
    metrics: {
      rawTokens: parsed.rawTokens,
      optimizedTokens: summary.tokens,
      savingsPercent: `${Math.round((1 - summary.tokens / parsed.rawTokens) * 100)}%`
    }
  };
}
```

### 3.4 CLI 接口

```bash
# 基础用法：包装测试命令
air test "pytest tests/ -v"
air test "npm test"
air test "go test ./..."

# 配置 token 预算
air test "pytest" --budget 300

# 输出格式选项
air test "pytest" --format json    # 默认
air test "pytest" --format text    # 人类可读文本

# 静默模式（仅返回状态码）
air test "pytest" --quiet

# 强制使用特定 parser
air test "python custom_runner.py" --parser pytest
```

---

## 4. Tool 2: air-read [T1/P0]

### 4.1 读取模式

| 模式 | 用途 | 实现方式 | Token 节省 |
|---|---|---|---|
| `skeleton` | 了解文件结构 | tree-sitter AST 提取 | 80-95% |
| `focused` | 查看特定代码段 | 目标 + padding 行 | 50-80% |
| `full` | 完整内容（fallback） | 紧凑行号格式 | 10-20% |
| `auto` | 自动选择 | 根据请求分析 | 变化 |

### 4.2 Skeleton 模式

#### 4.2.1 AST 提取策略

使用 tree-sitter 解析代码，提取结构化骨架：

```typescript
interface SkeletonExtractor {
  language: string;
  extract(ast: Tree): Skeleton;
}

interface Skeleton {
  imports: string[];           // import 语句（压缩形式）
  types: TypeDefinition[];     // 类型/接口定义
  classes: ClassSkeleton[];    // 类定义（方法签名）
  functions: FunctionSig[];    // 顶层函数签名
  exports: string[];           // 导出列表
}
```

**TypeScript 提取示例**：

```typescript
// 原始文件 (287 行)
import { Request, Response } from 'express';
import { Database } from '../db';
import { Logger } from '../utils/logger';

export interface AuthConfig {
  secret: string;
  expiresIn: number;
  refreshEnabled: boolean;
}

export class AuthService {
  private db: Database;
  private logger: Logger;
  
  constructor(config: AuthConfig) {
    // ... 20 行实现
  }
  
  async login(credentials: Credentials): Promise<Session> {
    // ... 45 行实现
  }
  
  async logout(sessionId: string): Promise<void> {
    // ... 15 行实现
  }
  
  private validateToken(token: string): boolean {
    // ... 30 行实现
  }
  
  private async refreshSession(session: Session): Promise<Session> {
    // ... 25 行实现
  }
}

export function createAuthMiddleware(service: AuthService): Middleware {
  // ... 35 行实现
}
```

**Skeleton 输出 (12 行)**：

```typescript
// src/auth/service.ts (287 lines) [skeleton]

import { Request, Response, ... } from 'express', '../db', '../utils/logger'

interface AuthConfig { secret, expiresIn, refreshEnabled }

class AuthService {
  constructor(config: AuthConfig)
  async login(credentials: Credentials): Promise<Session>
  async logout(sessionId: string): Promise<void>
  private validateToken(token: string): boolean
  private async refreshSession(session: Session): Promise<Session>
}

export function createAuthMiddleware(service: AuthService): Middleware
```

**Token 节省：约 95%**

#### 4.2.2 语言支持

| 语言 | tree-sitter grammar | 提取支持度 |
|---|---|---|
| TypeScript | tree-sitter-typescript | 完整 |
| JavaScript | tree-sitter-javascript | 完整 |
| Python | tree-sitter-python | 完整 |
| Go | tree-sitter-go | 完整 |
| Rust | tree-sitter-rust | 完整 |
| Java | tree-sitter-java | 部分（Phase 2） |
| C# | tree-sitter-c-sharp | 部分（Phase 2） |

未支持语言的 fallback：正则表达式匹配函数/类定义行。

### 4.3 Focused 模式

#### 4.3.1 目标定位

```typescript
interface FocusTarget {
  type: 'function' | 'class' | 'line-range' | 'pattern';
  value: string;  // 函数名、类名、"100-150"、正则表达式
}

function resolveFocus(
  file: string,
  target: FocusTarget
): { start: number; end: number } {
  switch (target.type) {
    case 'function':
      // 用 AST 找函数定义范围
      return findFunctionRange(file, target.value);
    case 'class':
      // 用 AST 找类定义范围
      return findClassRange(file, target.value);
    case 'line-range':
      // 直接解析 "100-150"
      return parseLineRange(target.value);
    case 'pattern':
      // grep 找第一个匹配行，展开上下文
      return findPatternContext(file, target.value);
  }
}
```

#### 4.3.2 上下文 Padding

Focused 模式返回目标代码 + 最小上下文：

```typescript
interface FocusedOutput {
  target: string;           // 目标代码
  padding: {
    before: string[];       // 目标前的上下文行
    after: string[];        // 目标后的上下文行
  };
  dependencies: string[];   // 相关的 import/type 定义
}

const DEFAULT_PADDING = 5;  // 上下各 5 行
```

### 4.4 行号优化

RESEARCH.md 指出行号前缀是隐性 token 税。分析：

```
当前 OC 格式:  "   102|code_here"  = 7 chars overhead/line
500 行文件 = 3500 chars ≈ 875 tokens 纯噪音
```

**AIR 方案：相对行号 + 锚点**

```
  10|function calculateTotal(items: Item[]): number {
    |  let total = 0;
    |  for (const item of items) {
    |    total += item.price * item.quantity;
    |  }
  15|  return total;
    |}
    |
    |// Helper function
  20|function formatCurrency(amount: number): string {
```

规则：
- 每 5 行显示一次绝对行号
- 中间行只显示 `|`
- 关键行（函数定义、错误位置）始终显示行号

**Token 节省：约 60%**

### 4.5 输出格式

```typescript
interface AieReadOutput {
  tool: 'air-read';
  file: string;
  mode: 'skeleton' | 'focused' | 'full';
  content: string;
  stats: {
    totalLines: number;
    outputLines: number;
    savingsPercent: string;
  };
  rawRef?: string;  // full 模式时可能不需要
}
```

### 4.6 CLI 接口

```bash
# Skeleton 模式（默认）
air read src/auth/handler.ts

# 显式指定模式
air read src/auth/handler.ts --mode skeleton
air read src/auth/handler.ts --mode full

# Focused 模式：多种定位方式
air read src/auth/handler.ts --focus "handleAuth"           # 函数名
air read src/auth/handler.ts --focus "AuthService"          # 类名
air read src/auth/handler.ts --focus "100-150"              # 行范围
air read src/auth/handler.ts --focus "/validateToken/"      # 正则

# 配置 padding
air read src/handler.ts --focus "handleAuth" --padding 10

# 不显示行号
air read src/handler.ts --no-line-numbers
```

---

## 5. Tool 3: air-bash [T1/P0]

> **注**：原名 air-run，更名为 air-bash——调研发现它替代的本质是各产品的 Bash/Shell 命令输出处理，而非单纯的"运行命令"功能。

### 5.1 输出策略

| 策略 | 触发条件 | 输出内容 |
|---|---|---|
| `success_minimal` | exit code 0 | 状态确认 + 最后 N 行 (default N=5) |
| `failure_focused` | exit code != 0 | 错误消息 + 前置上下文 (10 行) |
| `streaming_budget` | 长时间运行命令 | 滚动摘要，维持 token 预算 |

### 5.2 命令类型检测

```typescript
interface CommandProfile {
  pattern: RegExp;
  type: string;
  successStrategy: OutputStrategy;
  failureStrategy: OutputStrategy;
}

const COMMAND_PROFILES: CommandProfile[] = [
  {
    pattern: /^npm (install|i|ci)/,
    type: 'package-manager',
    successStrategy: { 
      extract: 'added-packages',  // 只提取添加的包
      maxLines: 3 
    },
    failureStrategy: { 
      extract: 'npm-error',  // npm ERR! 开头的行
      context: 5 
    }
  },
  {
    pattern: /^(npm|pnpm|yarn) (run |)(build|compile)/,
    type: 'build',
    successStrategy: { maxLines: 1 },  // "Build succeeded"
    failureStrategy: { 
      extract: 'error-lines',
      context: 10 
    }
  },
  {
    pattern: /^git log/,
    type: 'git-log',
    successStrategy: { passthrough: true },  // 已经很简洁，不处理
    failureStrategy: { passthrough: true }
  },
  {
    pattern: /^docker build/,
    type: 'docker-build',
    successStrategy: { 
      extract: 'docker-final-status',  // Successfully built xxx
      maxLines: 1 
    },
    failureStrategy: {
      extract: 'docker-error',
      context: 15
    }
  }
  // ... 更多模式
];
```

### 5.3 Token 预算系统

```typescript
interface BudgetEnforcer {
  maxTokens: number;
  
  enforce(content: string, priorities: PrioritizedContent[]): string {
    let result = '';
    let usedTokens = 0;
    
    // 按优先级填充内容
    for (const item of priorities.sort((a, b) => a.priority - b.priority)) {
      const itemTokens = estimateTokens(item.content);
      if (usedTokens + itemTokens <= this.maxTokens) {
        result += item.content + '\n';
        usedTokens += itemTokens;
      } else {
        // 预算不足，添加截断提示
        result += `\n[... truncated, full output: ${item.rawRef}]`;
        break;
      }
    }
    
    return result;
  }
}
```

### 5.4 输出格式

```typescript
interface AieBashOutput {
  tool: 'air-bash';
  command: string;
  status: 'success' | 'error';
  exitCode: number;
  summary: string;           // 单行状态描述
  output: string;            // 处理后的输出（在预算内）
  rawOutputFile: string;
  metrics: {
    rawTokens: number;
    optimizedTokens: number;
    savingsPercent: string;
  };
}
```

**示例：npm install 成功**

```json
{
  "tool": "air-bash",
  "command": "npm install",
  "status": "success",
  "exitCode": 0,
  "summary": "✓ npm install completed (47 packages, 3.2s)",
  "output": "added 47 packages in 3.2s",
  "rawOutputFile": "~/.air/outputs/20260309-npm-xyz789.txt",
  "metrics": {
    "rawTokens": 1850,
    "optimizedTokens": 25,
    "savingsPercent": "99%"
  }
}
```

**示例：build 失败**

```json
{
  "tool": "air-bash",
  "command": "npm run build",
  "status": "error",
  "exitCode": 1,
  "summary": "✗ Build failed",
  "output": "Error: Cannot find module './missing-file'\n  at src/index.ts:15:1\n  at Object.<anonymous> (src/index.ts:15:1)\n\n[... 127 more lines in ~/.air/outputs/20260309-build-abc123.txt]",
  "rawOutputFile": "~/.air/outputs/20260309-build-abc123.txt",
  "metrics": {
    "rawTokens": 3200,
    "optimizedTokens": 180,
    "savingsPercent": "94%"
  }
}
```

### 5.5 CLI 接口

```bash
# 基础用法
air bash "npm install"
air bash "docker build -t myapp ."

# 配置预算
air bash "make build" --budget 200

# 强制策略
air bash "npm install" --strategy full        # 不优化
air bash "npm install" --strategy minimal     # 最小输出

# 禁用命令检测（使用通用策略）
air bash "custom-tool" --no-detect
```

---

## 6. Tool 4: air-grep [T1/P1]

### 6.1 核心问题

Grep/search_files 是所有 AI coding 工具的标配（7/7 出现率），但搜索结果存在大量冗余：每个匹配返回完整文件路径（路径重复）、行号前缀、上下文行（经常不相关），20-40% 的输出是重复路径和无关上下文。

### 6.2 输出聚合策略

```typescript
interface GrepResult {
  file: string;
  matches: Array<{
    line: number;
    content: string;
    context?: { before: string[]; after: string[] };
  }>;
}

interface AieGrepOutput {
  tool: 'air-grep';
  pattern: string;
  totalMatches: number;
  totalFiles: number;
  results: GrepResult[];     // 按文件分组
  truncated: boolean;
  rawOutputFile?: string;
  metrics: {
    rawTokens: number;
    optimizedTokens: number;
    savingsPercent: string;
  };
}
```

### 6.3 聚合规则

```typescript
class GrepAggregator {
  /**
   * 核心聚合逻辑：
   * 1. 按文件分组，路径只出现一次
   * 2. 相邻匹配合并（间隔 < N 行则合并为一个块）
   * 3. 结果数量上限（超出返回统计而非全部）
   */
  aggregate(rawMatches: RawGrepMatch[], options: GrepOptions): AieGrepOutput {
    // 按文件路径分组
    const grouped = this.groupByFile(rawMatches);
    
    // 对每个文件内的匹配进行合并
    for (const [file, matches] of grouped) {
      this.mergeAdjacentMatches(matches, options.mergeDistance ?? 3);
    }
    
    // 路径压缩：找到公共前缀，缩短显示
    const commonPrefix = this.findCommonPrefix([...grouped.keys()]);
    
    // 结果数量控制
    if (grouped.size > (options.maxFiles ?? 20)) {
      return this.buildTruncatedOutput(grouped, options);
    }
    
    return this.buildOutput(grouped, commonPrefix);
  }
  
  private mergeAdjacentMatches(matches: GrepMatch[], distance: number): void {
    // 如果两个匹配间隔小于 distance 行，合并为一个块
    // 避免重复展示相同代码区域
  }
}
```

### 6.4 输出格式示例

**传统 grep 输出（冗长，~400 tokens）**：

```
src/services/auth/authService.ts:15:  async login(credentials: Credentials): Promise<Session> {
src/services/auth/authService.ts:42:  async logout(sessionId: string): Promise<void> {
src/services/auth/authService.ts:67:  private validateToken(token: string): boolean {
src/services/user/userService.ts:23:  async getUser(userId: string): Promise<User> {
src/services/user/userService.ts:45:  async updateUser(userId: string, data: Partial<User>): Promise<User> {
```

**air-grep 输出（聚合，~200 tokens）**：

```
5 matches in 2 files

src/services/auth/authService.ts (3 matches):
  :15 async login(credentials: Credentials): Promise<Session>
  :42 async logout(sessionId: string): Promise<void>
  :67 private validateToken(token: string): boolean

src/services/user/userService.ts (2 matches):
  :23 async getUser(userId: string): Promise<User>
  :45 async updateUser(userId: string, data: Partial<User>): Promise<User>
```

### 6.5 CLI 接口

```bash
# 基础搜索
air grep "handleAuth" src/

# 正则搜索
air grep "async\s+\w+\(" src/ --regex

# 控制上下文行数
air grep "TODO" src/ --context 2

# 仅显示文件名 + 匹配计数
air grep "import" src/ --files-only

# 结果数量限制
air grep "function" src/ --max-matches 50

# 文件类型过滤
air grep "useState" src/ --include "*.tsx"
```

---

## 7. Tool 5: air-edit [T1/P1]

### 7.1 核心问题

调研发现编辑工具存在两大流派，各有痛点：

**行号标签派（Claude Code, OpenCode）**：
1. 行号偏移失效：编辑后 LINE#ID 标签全部失效
2. Read-Edit-Read-Edit 循环：每次编辑后必须重新 Read
3. 行移动噪音：diff 报告中大量无关的行号变化信息

**Search/Replace 派（Cursor, Aider）**：
- 模糊匹配可能定位错误（代码中存在相似片段时）

### 7.2 设计方案

air-edit 采用 search/replace 模式，同时解决两派痛点：

```typescript
interface EditOperation {
  search: string;          // 要查找的代码片段
  replace: string;         // 替换后的内容
  context?: string;        // 周围代码上下文（消除歧义）
  occurrence?: number;     // 第 N 次出现（默认 1 = 第一次）
}

interface AieEditInput {
  file: string;
  edits: EditOperation[];  // 支持同文件多处编辑
}

interface AieEditOutput {
  tool: 'air-edit';
  file: string;
  status: 'success' | 'partial' | 'error';
  applied: number;         // 成功应用的编辑数
  total: number;           // 总编辑数
  changes: Array<{
    line: number;           // 变更发生的行号
    summary: string;        // 简短变更描述
  }>;
  errors?: Array<{
    edit: number;           // 第 N 个编辑操作
    reason: string;         // 失败原因
  }>;
}
```

### 7.3 模糊匹配策略

当精确匹配失败时，air-edit 提供多层 fallback：

```typescript
class EditMatcher {
  /**
   * 匹配策略（按优先级）：
   * 1. 精确匹配（exact string match）
   * 2. 空白规范化匹配（normalize whitespace）
   * 3. 行内容哈希匹配（忽略缩进差异）
   * 4. Levenshtein 距离匹配（编辑距离 < 阈值）
   */
  findMatch(content: string, search: string, context?: string): MatchResult | null {
    // 第 1 层：精确匹配
    const exactIndex = content.indexOf(search);
    if (exactIndex !== -1) {
      return { index: exactIndex, confidence: 1.0, method: 'exact' };
    }
    
    // 第 2 层：空白规范化
    const normalizedContent = this.normalizeWhitespace(content);
    const normalizedSearch = this.normalizeWhitespace(search);
    const normIndex = normalizedContent.indexOf(normalizedSearch);
    if (normIndex !== -1) {
      return { index: this.mapToOriginal(normIndex), confidence: 0.95, method: 'whitespace-normalized' };
    }
    
    // 第 3 层：行内容哈希
    const hashMatch = this.hashBasedMatch(content, search);
    if (hashMatch) {
      return { ...hashMatch, confidence: 0.85, method: 'line-hash' };
    }
    
    // 第 4 层：Levenshtein（仅在有 context 时启用，防误匹配）
    if (context) {
      const fuzzyMatch = this.levenshteinMatch(content, search, context);
      if (fuzzyMatch && fuzzyMatch.distance < search.length * 0.1) {  // < 10% 差异
        return { ...fuzzyMatch, confidence: 0.7, method: 'levenshtein' };
      }
    }
    
    return null;  // 匹配失败
  }
  
  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }
  
  private hashBasedMatch(content: string, search: string): MatchResult | null {
    // 按行拆分，计算每行内容哈希（忽略前导空白）
    // 查找连续行哈希序列匹配
    const searchLines = search.split('\n').map(l => this.lineHash(l.trim()));
    const contentLines = content.split('\n');
    
    for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
      const windowHashes = contentLines
        .slice(i, i + searchLines.length)
        .map(l => this.lineHash(l.trim()));
      
      if (this.arraysEqual(searchLines, windowHashes)) {
        // 找到匹配：返回原始内容中的位置
        return { lineStart: i, lineEnd: i + searchLines.length };
      }
    }
    return null;
  }
}
```

### 7.4 Diff 生成（变更摘要）

编辑完成后，air-edit 只返回变更摘要，**不**返回完整 diff 或行移动信息：

```typescript
class ChangeSummarizer {
  /**
   * 生成简洁的变更摘要，避免行移动噪音
   */
  summarize(original: string, modified: string, edits: EditOperation[]): string {
    const summaryLines: string[] = [];
    
    for (const edit of edits) {
      const lineNum = this.findLineNumber(original, edit.search);
      const changeType = this.classifyChange(edit.search, edit.replace);
      
      summaryLines.push(`  Line ${lineNum}: ${changeType}`);
    }
    
    return `✓ ${edits.length} change(s) applied to ${this.basename(file)}\n` +
           summaryLines.join('\n');
  }
  
  private classifyChange(search: string, replace: string): string {
    if (replace === '') return `removed: ${this.truncate(search, 60)}`;
    if (search === '') return `added: ${this.truncate(replace, 60)}`;
    return `modified: ${this.truncate(search, 30)} → ${this.truncate(replace, 30)}`;
  }
}
```

### 7.5 CLI 接口

```bash
# 单处编辑
air edit src/auth.ts \
  --search "async login(credentials: Credentials)" \
  --replace "async login(credentials: Credentials, options?: LoginOptions)"

# 多处编辑（JSON 输入）
air edit src/auth.ts --edits '[
  {"search": "old_code_1", "replace": "new_code_1"},
  {"search": "old_code_2", "replace": "new_code_2"}
]'

# 带上下文消除歧义
air edit src/auth.ts \
  --search "return result;" \
  --replace "return sanitize(result);" \
  --context "function processAuth"

# dry-run 模式
air edit src/auth.ts --search "foo" --replace "bar" --dry-run
```

---

## 8. Tool 6: air-web [T2/P2]

### 8.1 核心问题

AI 获取网页内容时，网页转 markdown 后包含大量导航栏、页脚、侧边栏、广告等无关内容。调研发现有用信息可能仅占网页总内容的 10-30%。

### 8.2 技术选型

| 方案 | 库 | 优势 | 劣势 |
|---|---|---|---|
| **DOM 解析 + Readability** | cheerio + @mozilla/readability | 成熟、轻量、Node 生态 | 需要自行实现 DOM 适配 |
| JSDOM + Readability | jsdom + @mozilla/readability | 更完整的 DOM 模拟 | jsdom 较重（~20MB），解析慢 |
| Trafilatura 移植 | 自行实现 | Python 社区最佳方案 | 移植成本高 |

**推荐方案**：cheerio（HTML 解析）+ @mozilla/readability（正文提取）+ turndown（HTML→Markdown 转换）。

### 8.3 正文提取流程

```typescript
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';  // 仅用于 Readability 的 DOM 接口适配
import TurndownService from 'turndown';

interface WebExtractResult {
  title: string;
  content: string;           // 提取后的正文（Markdown 格式）
  contentDensity: number;    // 内容密度分数 (0-1)
  metadata: {
    originalChars: number;
    extractedChars: number;
    savingsPercent: string;
  };
}

class WebContentExtractor {
  private turndown = new TurndownService();
  
  async extract(html: string, url: string): Promise<WebExtractResult> {
    // 1. 预处理：去除 script/style/nav/footer 标签
    const cleaned = this.preClean(html);
    
    // 2. 使用 Readability 提取正文
    const dom = new JSDOM(cleaned, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    
    if (!article) {
      // Readability 失败时的 fallback：内容密度算法
      return this.fallbackExtract(cleaned);
    }
    
    // 3. HTML → Markdown 转换
    const markdown = this.turndown.turndown(article.content);
    
    // 4. 计算内容密度
    const density = article.content.length / html.length;
    
    return {
      title: article.title,
      content: markdown,
      contentDensity: density,
      metadata: {
        originalChars: html.length,
        extractedChars: markdown.length,
        savingsPercent: `${Math.round((1 - markdown.length / html.length) * 100)}%`
      }
    };
  }
  
  private preClean(html: string): string {
    const $ = cheerio.load(html);
    // 移除明确的噪音元素
    $('script, style, nav, footer, header, aside, .ad, .sidebar, .cookie-banner').remove();
    return $.html();
  }
  
  private fallbackExtract(html: string): WebExtractResult {
    // 内容密度算法：计算每个 <div>/<section> 的文本密度
    // 选取密度最高的块作为正文
    // 待定：具体阈值需要实际测试确定
  }
}
```

### 8.4 内容密度评分

```typescript
interface DensityScore {
  textRatio: number;      // 纯文本占总字符比例
  linkDensity: number;    // 链接文本占总文本比例（高 = 导航区）
  codeBlockRatio: number; // 代码块比例（技术文档特征）
  headingCount: number;   // 标题数（文章结构指标）
  overallScore: number;   // 综合评分 0-100
}

function calculateDensity(element: Element): DensityScore {
  const text = element.textContent?.length ?? 0;
  const html = element.innerHTML.length;
  const links = element.querySelectorAll('a');
  const linkText = [...links].reduce((sum, a) => sum + (a.textContent?.length ?? 0), 0);
  
  return {
    textRatio: text / html,
    linkDensity: linkText / (text || 1),
    codeBlockRatio: /* 待定 */,
    headingCount: element.querySelectorAll('h1,h2,h3,h4').length,
    overallScore: /* 加权综合 */
  };
}
```

### 8.5 CLI 接口

```bash
# 基础正文提取
air web https://docs.example.com/api/auth

# 带密度评分
air web https://docs.example.com/api/auth --score

# 指定输出格式
air web https://example.com --format text    # 纯文本
air web https://example.com --format markdown  # Markdown（默认）

# 仅提取代码块
air web https://docs.example.com/tutorial --code-only
```

---

## 9. Tool 7: air-ls [T2/P2]

### 9.1 核心问题

LS/list_files/list_dir 在大项目中返回冗长的文件列表，缺少层次感和分组，AI 难以快速把握项目结构。

### 9.2 技术设计

```typescript
interface LsOptions {
  depth: number;            // 递归深度（默认 2）
  groupByType: boolean;     // 按文件类型分组
  showSize: boolean;        // 显示文件大小
  ignore: string[];         // 额外忽略模式
  includeHidden: boolean;   // 包含隐藏文件（默认 false）
}

interface AieLsOutput {
  tool: 'air-ls';
  root: string;
  tree: string;             // tree 风格文本输出
  stats: {
    totalFiles: number;
    totalDirs: number;
    totalSize?: string;     // "2.3 MB"
    byExtension: Record<string, number>;  // { ".ts": 15, ".test.ts": 8 }
  };
  metrics: {
    rawTokens: number;
    optimizedTokens: number;
    savingsPercent: string;
  };
}
```

### 9.3 .gitignore 遵从

```typescript
import ignore from 'ignore';  // 使用 'ignore' npm 包

class DirectoryScanner {
  private ig: ReturnType<typeof ignore>;
  
  constructor(rootDir: string) {
    this.ig = ignore();
    
    // 加载 .gitignore 规则
    const gitignorePath = path.join(rootDir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const rules = fs.readFileSync(gitignorePath, 'utf8');
      this.ig.add(rules);
    }
    
    // 始终忽略的模式
    this.ig.add(['node_modules', '.git', '.DS_Store', '__pycache__']);
  }
  
  shouldInclude(relativePath: string): boolean {
    return !this.ig.ignores(relativePath);
  }
}
```

### 9.4 Tree 输出格式

```typescript
class TreeFormatter {
  format(entries: DirEntry[], options: LsOptions): string {
    const lines: string[] = [];
    
    for (const entry of entries) {
      const prefix = this.getTreePrefix(entry.depth, entry.isLast);
      
      if (entry.isDirectory) {
        const fileCount = this.countFiles(entry);
        const typeSummary = this.summarizeTypes(entry);
        lines.push(`${prefix}${entry.name}/  (${fileCount} files${typeSummary ? ': ' + typeSummary : ''})`);
      } else {
        lines.push(`${prefix}${entry.name}`);
      }
    }
    
    return lines.join('\n');
  }
}
```

**输出示例**：

```
src/ (32 files)
├── auth/        (4 files: 2 .ts, 1 .test.ts, 1 .d.ts)
├── api/         (6 files: 4 .ts, 2 .test.ts)
├── utils/       (3 files: 2 .ts, 1 .test.ts)
├── types/       (2 files: 2 .ts)
├── index.ts
└── config.ts

Stats: 32 files, 5 dirs | .ts: 15, .test.ts: 8, .d.ts: 4, other: 5
```

### 9.5 CLI 接口

```bash
# 基础 tree 输出
air ls src/

# 控制深度
air ls src/ --depth 3

# 文件类型分组
air ls src/ --group-by-type

# 显示大小
air ls src/ --size

# 额外忽略
air ls . --ignore "*.log" --ignore "dist/"
```

---

## 10. Tool 8: air-context [T2/P2]

### 10.1 核心问题

AI agent 在长会话中缺乏对上下文窗口剩余空间的感知，无法主动管理预算，导致上下文爆满后被迫 compaction 丢失信息。

### 10.2 重要说明：宿主依赖

**air-context 不是通用工具**。它依赖宿主 agent 的对话管理 API（读取/修改对话历史的能力）：

| 宿主环境 | 可行性 | 说明 |
|---|---|---|
| OpenCode/OpenClaw | ✅ 可行 | 开放对话管理接口 |
| Claude Code | ❌ 不可行 | 不暴露对话管理 API |
| Cursor | ❌ 不可行 | 不暴露对话管理 API |

**原型验证**：我们已在自写的 OC 插件中实现了 `context_stats` / `context_slim` 工具（这是我们自写的 OC 插件，不是 OC 原生功能），验证了核心概念。

### 10.3 技术设计

```typescript
/**
 * air-context 需要宿主环境提供的适配器接口
 * 不同 agent 框架需要各自实现
 */
interface HostContextAdapter {
  // 获取当前对话的 token 使用统计
  getTokenStats(): Promise<{
    total: number;         // 总窗口大小
    used: number;          // 已使用
    available: number;     // 剩余可用
    breakdown: {
      system: number;      // 系统提示词
      toolDefs: number;    // 工具定义
      messages: number;    // 对话消息
      toolResults: number; // 工具调用结果
    };
  }>;
  
  // 精简旧内容（从对话历史中移除）
  slimMessages(options: {
    keepRecent: number;    // 保留最近 N 条消息
    categories?: ('tool' | 'text' | 'reasoning')[];  // 精简哪些类别
  }): Promise<{
    freedTokens: number;
    removedMessages: number;
  }>;
}

interface AieContextOutput {
  tool: 'air-context';
  action: 'stats' | 'slim';
  stats?: {
    used: number;
    total: number;
    usedPercent: string;
    breakdown: Record<string, number>;
  };
  slimResult?: {
    freedTokens: number;
    removedMessages: number;
  };
}
```

### 10.4 OC 插件原型参考

当前已在 ana_with_oc 项目中实现的 OC 插件原型：

```typescript
// 这是我们自写的 OC 插件（.opencode/plugins/ana-context-tools.ts）
// 不是 OC 原生功能

// context_stats: 获取上下文统计
// - 返回消息数量、角色分布、估算 token 用量

// context_slim: 精简旧内容
// - 按类别（tool/text/reasoning）保留最近 N 条
// - 释放上下文空间
```

air-context 的目标是将这些概念标准化，并为更多 agent 框架提供适配器。

### 10.5 CLI 接口

```bash
# 查询上下文状态（需要宿主环境支持）
air context stats
# Output: Used: 85K/200K tokens (42%), Tool results: 45K, Reasoning: 30K

# 主动精简
air context slim --keep-recent 20
# Output: Freed 25K tokens by trimming 15 old tool results
```

---

## 11. Tool 9: air-diff [T3/P3]

### 11.1 核心问题

git diff 输出包含大量结构性信息（文件头、行号标记、上下文行），且对于大重构（如重命名导致的文件移动），输出量可能极大但实际语义变更很少。

### 11.2 技术设计

```typescript
interface DiffOptions {
  range: string;           // "HEAD~1", "main..feature", staged, unstaged
  level: 'summary' | 'compact' | 'full';  // 详细度
  detectRenames: boolean;  // 启用移动/重命名检测
}

interface AieDiffOutput {
  tool: 'air-diff';
  range: string;
  stats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  changes: Array<{
    file: string;
    type: 'modified' | 'added' | 'deleted' | 'renamed' | 'moved';
    renamedFrom?: string;  // 重命名/移动时的原路径
    summary: string;       // 语义级变更描述
    hunks?: DiffHunk[];    // level=compact/full 时包含
  }>;
  rawOutputFile?: string;
  metrics: {
    rawTokens: number;
    optimizedTokens: number;
    savingsPercent: string;
  };
}

interface DiffHunk {
  header: string;          // @@ -10,5 +10,7 @@
  changes: string;         // 压缩后的变更内容
}
```

### 11.3 Git Diff 解析

```typescript
class GitDiffParser {
  parse(rawDiff: string): ParsedDiff[] {
    const files: ParsedDiff[] = [];
    
    // 按 "diff --git" 分割
    const chunks = rawDiff.split(/^diff --git/m).filter(Boolean);
    
    for (const chunk of chunks) {
      const file = this.parseFileChunk(chunk);
      files.push(file);
    }
    
    return files;
  }
  
  private parseFileChunk(chunk: string): ParsedDiff {
    // 提取文件路径
    // 检测 rename（similarity index）
    // 解析 hunks
    // 分类变更类型
  }
}
```

### 11.4 语义级摘要生成

```typescript
class DiffSummarizer {
  /**
   * 将 diff hunks 转换为语义描述
   * 
   * 规则举例：
   * - 函数签名变化 → "Modified function_name: added parameter X"
   * - 新增函数 → "Added function new_func()"
   * - import 变化 → "Added import: X from 'y'"
   * - 100% 相似度的文件移动 → "Moved file.ts → new/path/file.ts"
   */
  summarize(diff: ParsedDiff): string {
    if (diff.similarityIndex === 100) {
      return `Moved ${diff.oldPath} → ${diff.newPath}`;
    }
    
    if (diff.type === 'added') {
      return `Added ${diff.path} (${diff.insertions} lines)`;
    }
    
    // 分析 hunks，生成语义摘要
    const hunkSummaries = diff.hunks.map(h => this.summarizeHunk(h));
    return hunkSummaries.join('; ');
  }
  
  private summarizeHunk(hunk: DiffHunk): string {
    // 待定：具体启发式规则需要基于实际 diff 数据迭代
    // 初版可能只做行级统计，后续加入 AST 感知
  }
}
```

### 11.5 移动/重命名检测

```typescript
class RenameDetector {
  /**
   * 使用 git diff -M（或自行实现）检测文件移动
   * git 原生 -M 选项已经很好，air-diff 主要负责压缩输出
   */
  detectRenames(diffs: ParsedDiff[]): ParsedDiff[] {
    // 对于 deleted + added 的文件对，计算内容相似度
    // 相似度 > 50% 则标记为 renamed/moved
    // 使用 git 的 similarity index 即可
  }
}
```

### 11.6 CLI 接口

```bash
# 最近一次提交的变更摘要
air diff HEAD~1

# 分支对比
air diff main..feature

# staged 变更
air diff --staged

# 控制详细度
air diff HEAD~1 --level summary    # 仅文件列表 + 统计
air diff HEAD~1 --level compact    # 默认，文件 + 语义摘要
air diff HEAD~1 --level full       # 完整 diff（带压缩）
```

---

## 12. Integration Layer

### 12.1 OC Plugin

#### 12.1.1 限制分析

基于 RESEARCH.md 的调研：

> OC 没有插件 override 机制，无法替换内置工具的实现。

这意味着：
- 不能替换内置的 `view`、`bash` 工具
- 只能添加新工具（`air_*` 系列）
- 需要在系统提示中引导 AI 使用新工具

#### 12.1.2 Plugin 实现

```typescript
// .opencode/plugins/air-tools.ts

import type { PluginContext } from 'opencode';
import { airTest, airRead, airBash, airGrep, airEdit, airWeb, airLs, airContext, airDiff } from '@air/core';

export default function airPlugin(ctx: PluginContext) {
  // === T1 核心工具 ===
  
  // air_read [P0]
  ctx.registerTool({
    name: 'air_read',
    description: `Read file with optimized output. Supports skeleton mode (signatures only) and focused mode (specific code sections).
Use this instead of the built-in view tool for better context efficiency.
Modes: skeleton (default), focused, full`,
    parameters: {
      file: { type: 'string', description: 'File path to read' },
      mode: { type: 'string', enum: ['skeleton', 'focused', 'full'], optional: true },
      focus: { type: 'string', description: 'Target for focused mode', optional: true }
    },
    async execute({ file, mode, focus }) {
      return await airRead(file, { mode, focus });
    }
  });
  
  // air_bash [P0]
  ctx.registerTool({
    name: 'air_bash',
    description: `Run shell command with optimized output. Automatically detects command type and applies appropriate summarization.
Use this instead of bash tool for commands with potentially large output.`,
    parameters: {
      command: { type: 'string', description: 'Command to execute' },
      budget: { type: 'number', description: 'Max tokens for output', optional: true }
    },
    async execute({ command, budget }) {
      return await airBash(command, { budget });
    }
  });
  
  // air_test [P1]
  ctx.registerTool({
    name: 'air_test',
    description: `Run tests with optimized output. Returns structured summary instead of raw test output.
Use this instead of running test commands with bash tool.`,
    parameters: {
      command: { type: 'string', description: 'Test command to run' },
      budget: { type: 'number', description: 'Max tokens for output', optional: true }
    },
    async execute({ command, budget }) {
      return await airTest(command, { budget });
    }
  });
  
  // air_grep [P1]
  ctx.registerTool({
    name: 'air_grep',
    description: `Search files with deduplicated, grouped output. Groups matches by file, compresses paths.
Use this instead of grep tool for cleaner search results.`,
    parameters: {
      pattern: { type: 'string', description: 'Search pattern' },
      path: { type: 'string', description: 'Search path', optional: true },
      regex: { type: 'boolean', description: 'Treat pattern as regex', optional: true },
      context: { type: 'number', description: 'Context lines', optional: true }
    },
    async execute({ pattern, path, regex, context }) {
      return await airGrep(pattern, { path, regex, context });
    }
  });
  
  // air_edit [P1]
  ctx.registerTool({
    name: 'air_edit',
    description: `Edit file using search/replace without needing to Read first. Supports fuzzy matching with context disambiguation.
Use this instead of Edit tool to avoid Read-Edit-Read cycles.`,
    parameters: {
      file: { type: 'string', description: 'File path to edit' },
      search: { type: 'string', description: 'Code to find' },
      replace: { type: 'string', description: 'Replacement code' },
      context: { type: 'string', description: 'Surrounding context for disambiguation', optional: true }
    },
    async execute({ file, search, replace, context }) {
      return await airEdit(file, { edits: [{ search, replace, context }] });
    }
  });
  
  // === T2 扩展工具 ===
  
  // air_web [P2]
  ctx.registerTool({
    name: 'air_web',
    description: `Fetch web page with smart content extraction. Removes navigation, footers, ads.
Use this instead of webfetch for cleaner web content.`,
    parameters: {
      url: { type: 'string', description: 'URL to fetch' },
      score: { type: 'boolean', description: 'Include content density score', optional: true }
    },
    async execute({ url, score }) {
      return await airWeb(url, { score });
    }
  });
  
  // air_ls [P2]
  ctx.registerTool({
    name: 'air_ls',
    description: `List directory with compact tree output. Groups by file type, respects .gitignore.
Use this instead of read(dir) for better project structure overview.`,
    parameters: {
      path: { type: 'string', description: 'Directory path' },
      depth: { type: 'number', description: 'Recursion depth (default 2)', optional: true },
      groupByType: { type: 'boolean', description: 'Group by file extension', optional: true }
    },
    async execute({ path, depth, groupByType }) {
      return await airLs(path, { depth, groupByType });
    }
  });
  
  // air_context [P2] — 依赖 OC 对话管理 API
  ctx.registerTool({
    name: 'air_context',
    description: `Query and manage context window budget. Shows token usage breakdown and can trim old content.`,
    parameters: {
      action: { type: 'string', enum: ['stats', 'slim'], description: 'Action to perform' },
      keepRecent: { type: 'number', description: 'Messages to keep (for slim)', optional: true }
    },
    async execute({ action, keepRecent }) {
      return await airContext(action, { keepRecent, adapter: ctx.contextAdapter });
    }
  });
  
  // === T3 远期工具 ===
  
  // air_diff [P3]
  ctx.registerTool({
    name: 'air_diff',
    description: `Smart git diff summary. Compresses diff output, detects renames/moves.`,
    parameters: {
      range: { type: 'string', description: 'Diff range (e.g. HEAD~1, main..feature)', optional: true },
      level: { type: 'string', enum: ['summary', 'compact', 'full'], optional: true }
    },
    async execute({ range, level }) {
      return await airDiff(range ?? 'HEAD~1', { level });
    }
  });
}
```

#### 12.1.3 系统提示增强

建议在项目的 AGENTS.md 中添加：

```markdown
## Context Optimization Tools

This project uses AIR (AI Ergonomics) tools for efficient context usage:

| Task | Use This | Instead Of |
|---|---|---|
| Read file structure | `air_read({ file: "x.ts", mode: "skeleton" })` | `view({ path: "x.ts" })` |
| Read specific code | `air_read({ file: "x.ts", focus: "handleAuth" })` | `view({ path: "x.ts" })` |
| Run build/install | `air_bash({ command: "npm build" })` | `bash({ command: "npm build" })` |
| Run tests | `air_test({ command: "pytest" })` | `bash({ command: "pytest" })` |
| Search code | `air_grep({ pattern: "handleAuth" })` | `grep({ pattern: "handleAuth" })` |
| Edit file | `air_edit({ file: "x.ts", search: "old", replace: "new" })` | `edit(...)` (requires Read first) |
| Fetch web page | `air_web({ url: "https://..." })` | `webfetch({ url: "https://..." })` |
| List directory | `air_ls({ path: "src/" })` | `read({ filePath: "src/" })` |

These tools reduce context usage by 50-96% while preserving essential information.
```

### 12.2 MCP Server

#### 12.2.1 MCP 协议适配

```typescript
// packages/mcp-server/src/index.ts

import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioTransport } from '@modelcontextprotocol/sdk/transports/stdio';
import { airTest, airRead, airBash, airGrep, airEdit, airWeb, airLs, airDiff } from '@air/core';

const server = new Server({
  name: 'air-mcp-server',
  version: '0.2.0'
});

// 注册 9 个工具（air-context 不通过 MCP 暴露，因为它依赖宿主 API）
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'air_read',
      description: 'Read file with AI-optimized output (skeleton/focused/full modes)',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          mode: { type: 'string', enum: ['skeleton', 'focused', 'full'] },
          focus: { type: 'string' }
        },
        required: ['file']
      }
    },
    {
      name: 'air_bash',
      description: 'Run shell command with AI-optimized output',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          budget: { type: 'number' }
        },
        required: ['command']
      }
    },
    {
      name: 'air_test',
      description: 'Run tests with AI-optimized output',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          budget: { type: 'number' }
        },
        required: ['command']
      }
    },
    {
      name: 'air_grep',
      description: 'Search files with deduplicated grouped output',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string' },
          regex: { type: 'boolean' },
          context: { type: 'number' }
        },
        required: ['pattern']
      }
    },
    {
      name: 'air_edit',
      description: 'Edit file via search/replace without prior Read',
      inputSchema: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          search: { type: 'string' },
          replace: { type: 'string' },
          context: { type: 'string' }
        },
        required: ['file', 'search', 'replace']
      }
    },
    {
      name: 'air_web',
      description: 'Fetch web page with smart content extraction',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          score: { type: 'boolean' }
        },
        required: ['url']
      }
    },
    {
      name: 'air_ls',
      description: 'List directory with compact tree output',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          depth: { type: 'number' },
          groupByType: { type: 'boolean' }
        },
        required: ['path']
      }
    },
    {
      name: 'air_diff',
      description: 'Smart git diff summary with rename detection',
      inputSchema: {
        type: 'object',
        properties: {
          range: { type: 'string' },
          level: { type: 'string', enum: ['summary', 'compact', 'full'] }
        }
      }
    }
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  
  const handlers: Record<string, () => Promise<unknown>> = {
    air_read: () => airRead(args.file, args),
    air_bash: () => airBash(args.command, args),
    air_test: () => airTest(args.command, args),
    air_grep: () => airGrep(args.pattern, args),
    air_edit: () => airEdit(args.file, { edits: [{ search: args.search, replace: args.replace, context: args.context }] }),
    air_web: () => airWeb(args.url, args),
    air_ls: () => airLs(args.path, args),
    air_diff: () => airDiff(args.range ?? 'HEAD~1', args),
  };
  
  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);
  
  const result = await handler();
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

// 启动服务器
const transport = new StdioTransport();
await server.connect(transport);
```

> **注**：air-context 不通过 MCP 暴露，因为它依赖宿主 agent 的对话管理 API，MCP 客户端无法提供此能力。air-context 仅通过 OC Plugin 或其他支持对话管理 API 的框架插件提供。

#### 12.2.2 客户端配置

**Claude Desktop (`claude_desktop_config.json`)**：

```json
{
  "mcpServers": {
    "air": {
      "command": "npx",
      "args": ["@air/mcp-server"]
    }
  }
}
```

**Cursor (MCP 配置)**：

```json
{
  "mcp": {
    "servers": {
      "air": {
        "command": "npx @air/mcp-server"
      }
    }
  }
}
```

### 12.3 CLI

独立 CLI 工具，不依赖任何 AI coding 框架：

```bash
# 全局安装
npm install -g @air/cli

# 或使用 npx
npx @air/cli read src/handler.ts
npx @air/cli bash "npm install"
npx @air/cli test "pytest"

# 简写（全局安装后）
air read src/handler.ts
air bash "npm install"
air test "pytest tests/"
air grep "handleAuth" src/
air edit src/auth.ts --search "old" --replace "new"
air web https://docs.example.com
air ls src/ --depth 2
air diff HEAD~1
air stats
```

CLI 用途：
- 独立使用（不使用 AI 工具时）
- 基准测试和演示
- 脚本集成

---

## 13. 数据模型

### 13.1 AEO (AI Ergonomic Output) 格式

统一的输出信封格式：

```typescript
interface AEOOutput {
  // 元信息
  tool: string;                    // 工具标识符
  version: string;                 // AEO 格式版本
  timestamp: string;               // ISO 8601 时间戳
  
  // 状态
  status: 'success' | 'error' | 'partial';
  
  // 内容
  summary: string;                 // 人/AI 可读摘要 (< 500 tokens)
  structured: Record<string, unknown>;  // 机器可解析的结构化数据
  
  // 原始数据引用
  rawRef?: {
    path: string;                  // 完整输出文件路径
    tokens: number;                // 原始输出 tokens
    retrieveCommand: string;       // 如何获取更多详情
  };
  
  // 指标
  metrics: {
    rawTokens: number;
    optimizedTokens: number;
    savingsPercent: number;
    processingTimeMs: number;
  };
}
```

### 13.2 Metrics 收集

每次工具调用记录指标：

```typescript
interface MetricEntry {
  timestamp: string;
  tool: string;
  command?: string;
  file?: string;
  rawTokens: number;
  optimizedTokens: number;
  savingsPercent: number;
  processingTimeMs: number;
  mode?: string;  // air-read 的模式
}
```

存储格式：`~/.air/metrics.jsonl`（追加写入）

```jsonl
{"timestamp":"2026-03-09T10:30:42Z","tool":"air-test","command":"pytest","rawTokens":4200,"optimizedTokens":280,"savingsPercent":93,"processingTimeMs":45}
{"timestamp":"2026-03-09T10:31:15Z","tool":"air-read","file":"src/auth.ts","mode":"skeleton","rawTokens":1200,"optimizedTokens":85,"savingsPercent":93,"processingTimeMs":12}
```

### 13.3 统计 Dashboard

```bash
# 查看统计摘要
air stats

# Output:
# AIR Usage Statistics (last 7 days)
# 
# Total invocations: 234
# Total tokens saved: 142,500 (~$2.85 at GPT-4 pricing)
# 
# By tool:
#   air-test: 89 calls, avg 91% savings
#   air-read: 112 calls, avg 87% savings
#   air-bash: 33 calls, avg 78% savings
#   air-grep: 45 calls, avg 52% savings
#   air-edit: 28 calls (indirect savings)
#   air-web: 12 calls, avg 65% savings
#   air-ls: 15 calls, avg 35% savings
# 
# Top savings:
#   pytest tests/ -v: 4200 → 280 tokens (93%)
#   npm install: 1850 → 25 tokens (99%)
```

---

## 14. 技术栈

### 14.1 选型决策

| 组件 | 选型 | 备选方案 | 决策理由 |
|---|---|---|---|
| **语言** | TypeScript | Go, Rust | OC plugin 生态一致；MCP SDK 官方支持；开发速度快 |
| **包管理** | pnpm | npm, yarn | monorepo 支持好；磁盘效率高 |
| **AST 解析** | tree-sitter-wasms | tree-sitter native, babel | WASM 无需 native 编译，跨平台；性能足够 |
| **测试** | vitest | jest | 快速；TypeScript 原生支持；与项目技术栈一致 |
| **构建** | tsup | rollup, esbuild | 简洁配置；内置 dts 生成；基于 esbuild 快速 |
| **Monorepo** | pnpm workspaces | turborepo, nx | 简洁无需额外工具；与 pnpm 原生集成 |
| **HTML 解析** | cheerio | jsdom, htmlparser2 | 轻量快速；jQuery 风格 API 易用 |
| **正文提取** | @mozilla/readability | trafilatura 移植 | 成熟稳定；Firefox Reader View 同源 |
| **Markdown 转换** | turndown | remark | 专注 HTML→MD；规则可配置 |
| **文件忽略** | ignore | minimatch | .gitignore 语法完整支持 |

### 14.2 包结构

```
air/
├── packages/
│   ├── core/                 # @air/core - 核心引擎
│   │   ├── src/
│   │   │   ├── parsers/      # 输出解析器（test/command/grep/diff/web/generic）
│   │   │   ├── summarizers/  # 摘要引擎
│   │   │   ├── storage/      # 存储层
│   │   │   ├── edit/         # 编辑引擎（search/replace + fuzzy match）
│   │   │   ├── web/          # 网页内容提取（cheerio + readability）
│   │   │   ├── tools/        # 9 个工具实现
│   │   │   │   ├── air-read.ts
│   │   │   │   ├── air-bash.ts
│   │   │   │   ├── air-test.ts
│   │   │   │   ├── air-grep.ts
│   │   │   │   ├── air-edit.ts
│   │   │   │   ├── air-web.ts
│   │   │   │   ├── air-ls.ts
│   │   │   │   ├── air-context.ts
│   │   │   │   └── air-diff.ts
│   │   │   └── index.ts      # 公开 API
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── cli/                  # @air/cli - 命令行工具（9 个子命令）
│   │   ├── src/
│   │   │   ├── commands/     # read, bash, test, grep, edit, web, ls, context, diff, stats, retrieve
│   │   │   └── index.ts      # CLI 入口
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── mcp-server/           # @air/mcp-server - MCP 协议适配器
│   │   ├── src/
│   │   │   └── index.ts      # MCP 服务器（暴露 8 个工具，不含 air-context）
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── oc-plugin/            # @air/oc-plugin - OpenCode 插件适配器
│       ├── src/
│       │   └── index.ts      # OC 插件（暴露全部 9 个工具）
│       ├── package.json
│       └── tsconfig.json
│
├── pnpm-workspace.yaml
├── package.json              # Root package
├── tsconfig.base.json        # 共享 TS 配置
└── vitest.config.ts          # 测试配置
```

### 14.3 依赖清单

```json
// packages/core/package.json
{
  "name": "@air/core",
  "dependencies": {
    "web-tree-sitter": "^0.22.0",
    "cheerio": "^1.0.0",
    "@mozilla/readability": "^0.5.0",
    "turndown": "^7.0.0",
    "ignore": "^5.3.0"
  },
  "devDependencies": {
    "tree-sitter-typescript": "^0.22.0",
    "tree-sitter-python": "^0.22.0",
    "tree-sitter-go": "^0.22.0",
    "typescript": "^5.4.0",
    "tsup": "^8.0.0",
    "vitest": "^2.0.0"
  }
}

// packages/cli/package.json
{
  "name": "@air/cli",
  "bin": {
    "air": "./dist/index.js"
  },
  "dependencies": {
    "@air/core": "workspace:*",
    "commander": "^12.0.0"
  }
}

// packages/mcp-server/package.json
{
  "name": "@air/mcp-server",
  "dependencies": {
    "@air/core": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}

// packages/oc-plugin/package.json
{
  "name": "@air/oc-plugin",
  "dependencies": {
    "@air/core": "workspace:*"
  }
}
```

---

## 15. 开发计划

### Phase 1: MVP — air-read + air-bash (Week 1-2)

| 任务 | 预估 | 交付物 |
|---|---|---|
| Monorepo 搭建 | 0.5 天 | pnpm workspace, tsconfig, vitest |
| Storage 层实现 | 1 天 | 存储、检索、清理 API |
| air-read skeleton 模式 | 1.5 天 | tree-sitter 集成 + AST 骨架提取 |
| air-read focused/full 模式 | 1 天 | 目标定位 + padding + 行号优化 |
| air-bash 命令检测 + 摘要 | 1.5 天 | 命令类型检测 + 输出策略 |
| CLI 框架 | 0.5 天 | commander 骨架 + read/bash 子命令 |
| 基准测试 | 1 天 | 真实项目测试，TSR 测量 |

**Phase 1 成功标准**：
- `air read` 和 `air bash` 可用
- TSR > 70%（综合）
- 处理延迟 < 100ms

### Phase 1.5: air-test + air-grep (Week 2-3)

| 任务 | 预估 | 交付物 |
|---|---|---|
| pytest parser | 1 天 | 解析 pytest 输出 |
| jest/vitest parser | 1 天 | 解析 jest/vitest 输出 |
| Test summarizer | 1 天 | 测试结果摘要逻辑 |
| air-grep 聚合引擎 | 1 天 | 路径去重 + 分组 + 结果压缩 |
| CLI 子命令扩展 | 0.5 天 | test/grep 子命令 |
| OC plugin 初版 | 0.5 天 | 4 个工具的 OC 包装 |

**Phase 1.5 成功标准**：
- 4 个 T1 工具可用（read/bash/test/grep）
- OC plugin 集成验证
- TSR: air-test > 90%, air-grep > 40%

### Phase 2: air-edit + PostToolUse Hook (Week 3-4)

| 任务 | 预估 | 交付物 |
|---|---|---|
| air-edit search/replace 引擎 | 1.5 天 | 精确匹配 + 空白规范化 |
| air-edit 模糊匹配 | 1 天 | 行哈希 + Levenshtein fallback |
| air-edit 变更摘要 | 0.5 天 | 简洁 diff 输出 |
| MCP server | 1 天 | stdio transport + 5 个工具 |
| OC plugin 更新 | 0.5 天 | 加入 air-edit |
| 基准测试报告 | 1 天 | 多项目测试数据 |
| 向框架提 PR | 0.5 天 | 至少一个 PR |

**Phase 2 成功标准**：
- 5 个 T1 工具完整可用
- MCP server 可与 Claude Desktop 配合使用
- 博客发布，引起社区讨论

### Phase 2.5: air-web + air-ls (Week 5-6)

| 任务 | 预估 | 交付物 |
|---|---|---|
| air-web Readability 集成 | 1.5 天 | cheerio + readability + turndown |
| air-web 密度评分 | 0.5 天 | 内容密度计算 |
| air-ls tree 输出 | 1 天 | .gitignore 遵从 + tree 格式 |
| air-ls 文件类型分组 | 0.5 天 | 按扩展名聚合统计 |
| MCP/OC 更新 | 0.5 天 | 加入 web/ls 工具 |

**Phase 2.5 成功标准**：
- air-web 正文提取可用，TSR > 50%
- air-ls 紧凑目录输出可用

### Phase 3: air-context + air-diff + AEO Spec (Week 7+)

| 任务 | 预估 | 交付物 |
|---|---|---|
| air-context 适配器接口 | 1 天 | HostContextAdapter 规范 |
| air-context OC 适配 | 1 天 | 基于自写 OC 插件原型 |
| air-diff git 解析 | 1.5 天 | diff 解析 + 移动检测 |
| air-diff 语义摘要 | 1 天 | 启发式规则引擎 |
| AEO spec 文档 | 3 天 | 规范初稿 |
| 社区反馈集成 | ongoing | 根据使用反馈迭代 |

**Phase 3 成功标准**：
- 全部 9 个工具可用
- AEO 规范发布
- 上下文管理原型在 OC 中验证

---

## 16. 附录

### A. Token 估算验证

简单的 `chars/4` 规则与 tiktoken 对比：

| 内容类型 | 字符数 | chars/4 估算 | tiktoken 实际 | 误差 |
|---|---|---|---|---|
| pytest 输出 | 8500 | 2125 | 2180 | -2.5% |
| TypeScript 代码 | 3200 | 800 | 820 | -2.4% |
| JSON 输出 | 1500 | 375 | 410 | -8.5% |

结论：`chars/4` 对于代码和测试输出足够准确，JSON 略微低估。对于预算控制用途，这个精度可接受。

### B. 错误处理策略

| 场景 | 处理方式 |
|---|---|
| 命令执行失败 | 返回 error 状态 + stderr 内容 |
| Parser 检测失败 | fallback 到 GenericParser |
| AST 解析失败 | fallback 到正则提取 |
| 存储写入失败 | 继续返回结果，rawRef 标记为 unavailable |
| 预算为负/零 | 使用默认值 (500) |
| 编辑匹配失败 | 返回 error + 候选匹配建议（如有） |
| 网页抓取失败 | 返回 error + HTTP 状态码 |
| Readability 提取失败 | fallback 到内容密度算法 |

### C. 配置文件设计（Phase 2）

```yaml
# ~/.air/config.yaml

# 全局设置
defaults:
  budget: 500
  storage:
    ttl: 24h
    maxSize: 100MB

# 工具特定设置
tools:
  test:
    budget: 400
    maxFailures: 10  # 最多展示 10 个失败测试
  
  read:
    defaultMode: skeleton
    padding: 5
    lineNumbers: relative  # relative | full | none
  
  bash:
    budget: 300
    detectCommands: true
  
  grep:
    maxMatches: 100
    contextLines: 0
    groupByFile: true
  
  edit:
    fuzzyMatch: true
    maxLevenshteinRatio: 0.1  # 最大编辑距离比例
  
  web:
    cacheEnabled: true
    cacheTTL: 1h
  
  ls:
    defaultDepth: 2
    showHidden: false
  
  diff:
    defaultLevel: compact
    detectRenames: true

# 语言特定设置
languages:
  typescript:
    skeleton:
      includePrivate: false
      includeTypes: true
```

---

*文档版本：v0.2*  
*最后更新：2026-03-09*
