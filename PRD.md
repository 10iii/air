> **变更日志**
> - v0.3 (2026-03-09): 工具清单从 5 扩展至 9 个（新增 T2: air-web/air-ls/air-context，T3: air-diff），路线图细化为 5 阶段，删除 air-repomap（与 ai-see scout 重叠）
> - v0.2 (2026-03-09): 对齐 TOOL-INVENTORY 调研结论，扩展工具清单（3→5），air-run 更名 air-bash，新增 air-grep/air-edit
> - v0.1 (2026-03-09): 初版

# AIR (AI Ergonomics) — 产品需求文档

## 1. 产品愿景

AIR 是一套"适AI化改造"工具集。

这个名字借鉴了"适老化改造"的概念：当社会进入老龄化，基础设施需要重新设计来适应老年人的需求。同样地，当 AI 成为开发工具的主要用户，工具的输出格式需要从"人类可读"进化为"AI 高效"。

**核心问题：上下文窗口是 AI coding 工具最稀缺的资源。**

一个 200K token 的上下文窗口听起来很大，但实际使用中：
- 一次 `npm install` 输出可能吃掉 2000+ tokens
- 一次完整的测试报告可能消耗 5000+ tokens
- 一个中等大小的文件可能占用 1000+ tokens

更关键的是，这些输出中有 50-96% 是噪音。进度条、空行、重复信息、AI 根本不需要的细节。

现有的解决方案是 **Cleanup**：让 AI 在拿到输出后自己总结，或者用 compaction 机制压缩历史。这是事后补救，问题已经发生了。

AIR 的方案是 **Prevention**：在工具输出的那一刻就拦截和优化，让无用信息根本不进入上下文窗口。

## 2. 目标用户

三类核心用户：

**AI coding 工具的开发者**
Cursor, Windsurf, OpenCode, Cline, Aider, Claude Code... 这些团队都在解决同一个问题：如何让 AI 在有限的上下文窗口里做更多事。AIR 提供可复用的解决方案，减少重复造轮子。

**AI 编程工作流的重度用户**
每天与 AI pair programming 的开发者。他们切身体会到"上下文被测试输出撑爆"的痛苦，需要立即可用的工具来改善体验。

**AI agent 框架开发者**
构建 autonomous agent 的团队。Agent 的运行时间更长、执行的工具更多，上下文效率问题被成倍放大。

## 3. 核心价值主张

**量化的价值**
- 减少 50-96% 的上下文浪费（可测量、可验证）
- 让更多 token 用于推理而非读取噪音
- 延长 AI agent 的有效工作时间

**技术的价值**
- 跨工具兼容：不绑定任何特定 IDE 或框架
- 规则引擎驱动：不依赖额外的 LLM API 调用
- 开源透明：所有优化逻辑可审查、可定制

**生态的价值**
- 定义"AI Ergonomic Output"标准
- 推动整个工具链向 AI-first 演进

## 4. MVP 产品范围
### 4.1 核心工具清单（9 个）

基于 [TOOL-INVENTORY.md](./TOOL-INVENTORY.md) 对 7 款主流 AI coding 产品的调研，以下 9 个工具按优先级分为三个梯队。

**T1 (P0-P1) — 核心工具**

| 优先级 | 工具 | 替代目标 | 核心价值 | 预期 Token 节省 |
|---|---|---|---|---|
| P0 | **air-read** | 所有产品的 Read/read_file | 去行号前缀(15-30%浪费)，智能截断，结构感知 | 50-80% |
| P0 | **air-bash** | Bash/execute_command 输出 | 智能摘要(30-80%噪音消除)，命令输出过滤与结构化 | 60-90% |
| P1 | **air-test** | pytest/jest/go test 等测试输出 | 测试输出解析，仅保留失败信息 | 90%+ |
| P1 | **air-grep** | Grep/search_files 搜索结果 | 去冗余上下文(20-40%浪费)，路径去重，智能聚合 | 40-60% |
| P1 | **air-edit** | Edit/edit_file 编辑工具 | 免前置Read直接编辑(search/replace) + 消除行移动噪音 | 间接节省 |

**T2 (P2) — 扩展工具**

| 优先级 | 工具 | 替代目标 | 核心价值 | 预期 Token 节省 |
|---|---|---|---|---|
| P2 | **air-web** | WebFetch/web_search | 网页正文智能提取（去导航/页脚/广告）+ 内容密度评分 | 50-80% |
| P2 | **air-ls** | LS/list_files/list_dir | tree 风格紧凑输出 + 可配置深度 + 文件类型分组 | 20-40% |
| P2 | **air-context** | (无直接对应) | 主动上下文预算管理；依赖宿主 agent 的对话管理 API，非通用工具 | 变化 |

**T3 (P3) — 远期工具**

| 优先级 | 工具 | 替代目标 | 核心价值 | 预期 Token 节省 |
|---|---|---|---|---|
| P3 | **air-diff** | git diff | 智能变更摘要：压缩结构化 git diff 输出 | 40-70% |

> **注**：air-repomap 已删除——ai-see 项目的 scout 命令已提供类似的代码库结构感知功能，不再重复建设。
#### Tool 1: air-read — 智能文件读取 [P0]

**问题**
AI 请求读取一个 500 行的文件，往往只是为了找一个函数。整个文件都进入上下文，浪费惊人。更糟的是，几乎所有工具（Claude Code, OpenCode, Cursor, Windsurf, Roo Code）都给每行加上行号前缀 `N: content`，每行增加 ~5-8 字符，对 2000 行文件意味着 ~12K-16K 字符的纯噪音。

**方案**
air-read 提供多种输出模式，根据使用目的选择最优方案：

```bash
# 只看结构
air-read src/auth.ts --mode=skeleton

# 聚焦特定代码
air-read src/auth.ts --focus="handleAuth function"

# 完整内容（fallback）
air-read src/auth.ts --mode=full
```

**skeleton 模式输出示例**

```typescript
// src/auth.ts (287 lines)

export interface AuthConfig { ... }
export class AuthService {
  constructor(config: AuthConfig)
  async login(credentials: Credentials): Promise<Session>
  async logout(sessionId: string): Promise<void>
  private validateToken(token: string): boolean
}
export function createAuthMiddleware(service: AuthService): Middleware
```

**focused 模式**
结合代码分析，只返回目标代码段及其最小依赖上下文（imports, 相关类型定义）。

**行号处理**
传统工具的行号前缀 `123: ` 对人类有用，对 AI 是纯噪音（调研发现这是行业通病，7/7 产品均存在）。air-read 使用更紧凑的标记，或者完全省略行号（依赖 fuzzy matching 来定位）。

**预期 token 节省：50-80%**

#### Tool 2: air-bash — 命令输出智能摘要 [P0]

**问题**
执行 `npm install` 或 `docker build` 可能产生上千行输出。成功时 AI 只需要知道"成功了"；失败时需要错误信息，但不需要之前 500 行的进度日志。调研发现所有 7 款产品都将 Shell 命令输出原样传回，没有任何智能处理。

> 注：原名 air-run，更名为 air-bash——调研发现它替代的本质是各产品的 Bash/Shell 命令输出处理，而非单纯的"运行命令"功能。

**方案**
air-bash 包装 shell 命令执行，智能处理输出：

```bash
# 成功时
air-bash "npm install"
# Output: ✓ npm install completed (47 packages, 3.2s)

# 失败时
air-bash "npm run build"
# Output:
# ✗ npm run build failed (exit code 1)
# 
# Error: Cannot find module './missing-file'
#   at src/index.ts:15
#
# Full output: /tmp/air-bash-xyz789.log
```

**智能策略**
- 成功命令：仅返回摘要（命令、耗时、关键结果）
- 失败命令：错误信息 + 最相关的上下文行
- 可配置 token budget：超出时自动截断，保留头尾
- 识别常见输出模式（进度条、ANSI 码、重复行、banner）并过滤

**预期 token 节省：60-90%**

#### Tool 3: air-test — 测试输出智能摘要 [P1]

**问题**
运行一次 `pytest` 可能产生 500+ 行输出。大部分是进度点、框架 banner、重复的 traceback。AI 真正需要的信息可能只有 20 行：哪些测试失败了、为什么。

**方案**
air-test 包装现有测试运行器（pytest, jest, vitest, go test 等），将输出转化为结构化摘要：

```
# air-test pytest tests/

Tests: 45 passed, 2 failed, 1 skipped

FAILED:
- test_auth.py::test_login_invalid_password
  AssertionError: Expected 401, got 500
  
- test_api.py::test_create_user_duplicate
  IntegrityError: UNIQUE constraint failed: users.email

Full output saved to: /tmp/air-test-abc123.log
```

**设计原则**
- 成功的测试不需要细节，一个数字足够
- 失败的测试需要：测试名 + 简短错误描述
- 去重：相同类型的错误合并展示
- 完整输出始终保留，AI 需要时可以检索

**预期 token 节省：90%+（96% 压缩在典型场景中可实现）**

#### Tool 4: air-grep — 搜索结果智能聚合 [P1]

**问题**
Grep/search_files 是所有 AI coding 工具的标配（7/7 出现率），但搜索结果存在大量冗余：每个匹配返回完整文件路径（路径重复）、行号前缀、上下文行（经常不相关），20-40% 的输出是重复路径和无关上下文。

**方案**
air-grep 对搜索结果进行智能聚合和压缩：

```bash
# 传统 grep 输出（冗长）
src/services/auth/authService.ts:15:  async login(credentials: Credentials)
src/services/auth/authService.ts:42:  async logout(sessionId: string)
src/services/auth/authService.ts:67:  private validateToken(token: string)
src/services/user/userService.ts:23:  async getUser(userId: string)

# air-grep 输出（聚合）
src/services/auth/authService.ts (3 matches):
  :15 async login(credentials: Credentials)
  :42 async logout(sessionId: string)
  :67 private validateToken(token: string)
src/services/user/userService.ts (1 match):
  :23 async getUser(userId: string)
```

**设计原则**
- 按文件分组，路径只出现一次
- 可配置上下文行数（默认 0，按需展开）
- 匹配计数摘要（快速判断搜索精度）
- 支持结果数量上限（超出时返回统计而非全部）

**预期 token 节省：40-60%**

#### Tool 5: air-edit — 免读取直接编辑 [P2]

**问题**
调研发现编辑工具存在两大流派，各有痛点：

**行号标签派（Claude Code, OpenCode）的三个问题：**
1. **行号偏移失效**：编辑后文件行号变化，之前获取的 LINE#ID 标签全部失效
2. **Read-Edit-Read-Edit 循环**：每次编辑后必须重新 Read 获取新标签才能继续编辑，产生连锁上下文浪费
3. **行移动噪音**：编辑后的差异报告中包含大量"行移动"信息（未变更的代码因插入/删除导致行号变化），这些信息对 AI 理解变更毫无帮助

**Search/Replace 派（Cursor, Aider）的问题：**
- 模糊匹配可能定位错误（代码中存在相似片段时）

**方案**
air-edit 采用 search/replace 模式（参考 Cursor 和 Aider 的设计），同时解决两派的痛点：

```bash
# 不需要先 Read 获取行号/标签
air-edit src/auth.ts \
  --search "async login(credentials: Credentials): Promise<Session>" \
  --replace "async login(credentials: Credentials, options?: LoginOptions): Promise<Session>"

# 编辑确认只返回变更摘要，不返回完整 diff
# Output: ✓ src/auth.ts: 1 replacement made (line 15)
```

**设计原则**
- 不依赖行号/标签：使用文本匹配定位，免去 Read 前置步骤
- 变更摘要优先：编辑确认只返回变更摘要（哪些行被改了、改成什么），不返回完整 diff 或行移动信息
- 上下文辅助匹配：支持提供周围代码上下文来消除歧义（解决模糊匹配问题）
- 多处编辑合并：同一文件多处修改在一次调用中完成

**预期 token 节省：间接但显著——消除 Read-Edit-Read 循环，每轮编辑节省一次完整文件读取的上下文**

### 4.2 T2/T3 扩展工具详细设计

以下工具优先级较低（T2/T3），但已明确设计方向，将在核心工具验证成功后逐步推进。

#### Tool 6: air-web — 网页正文智能提取 [P2]

**问题**
AI 获取网页内容时（WebFetch/web_search），网页转 markdown 后包含大量导航栏、页脚、侧边栏、广告等无关内容。调研发现有用信息可能仅占网页总内容的 10-30%，其余 70-90% 是结构性噪音。

**方案**
air-web 对网页内容进行正文智能提取：

```bash
# 只提取正文
air-web https://docs.example.com/api/auth
# Output: 纯正文内容，去除导航/页脚/广告

# 内容密度评分
air-web https://docs.example.com/api/auth --score
# Output: 正文内容 + 内容密度: 35% (原始 12K chars → 提取 4.2K chars)
```

**设计原则**
- DOM 解析 + 正文提取算法（参考 Readability/Trafilatura 等成熟方案）
- 内容密度评分：量化提取效果，辅助判断提取质量
- 结构化输出：自动识别标题层级、代码块、表格等
- 缓存机制：相同 URL 短时间内不重复抓取

**预期 token 节省：50-80%**

#### Tool 7: air-ls — 目录列表紧凑输出 [P2]

**问题**
LS/list_files/list_dir 在大项目中返回冗长的文件列表，缺少层次感和分组，AI 难以快速把握项目结构。

**方案**
air-ls 提供 tree 风格的紧凑输出：

```bash
# tree 风格输出
air-ls src/ --depth 2
# Output:
# src/
#   auth/        (4 files: 2 .ts, 1 .test.ts, 1 .d.ts)
#   api/         (6 files)
#   utils/       (3 files)
#   index.ts

# 文件类型分组
air-ls src/ --group-by-type
# Output:
# TypeScript: 15 files
# Tests: 8 files
# Config: 3 files
```

**设计原则**
- 可配置深度：默认 2 层，避免深层展开
- 文件类型分组：按扩展名聚合，快速了解项目构成
- 忽略规则：自动尊重 .gitignore，支持额外忽略模式
- 统计摘要：文件数、目录数、总大小

**预期 token 节省：20-40%**

#### Tool 8: air-context — 主动上下文预算管理 [P2]

**问题**
AI agent 在长会话中缺乏对上下文窗口剩余空间的感知，无法主动管理预算，导致上下文爆满后被迫 compaction 丢失信息。

**方案**
air-context 提供上下文状态查询和主动精简能力：

```bash
# 查询当前上下文状态
air-context stats
# Output: Used: 85K/200K tokens (42%), Tool results: 45K, Reasoning: 30K, Text: 10K

# 主动精简旧内容
air-context slim --keep-recent 20
# Output: Freed 25K tokens by trimming old tool results
```

**重要说明**
air-context 依赖宿主 agent 的对话管理 API（如读取/修改对话历史的能力），因此**不是通用工具**：
- ✅ 可行：OpenCode/OpenClaw 等开放对话管理接口的框架
- ❌ 不可行：Claude Code / Cursor 等不暴露对话管理 API 的产品
- 原型已在我们自写的 OC 插件中实现（context_stats / context_slim），验证了核心概念

**预期 token 节省：取决于使用时机和策略**

#### Tool 9: air-diff — 智能变更摘要 [P3]

**问题**
git diff 输出包含大量结构性信息（文件头、行号标记、上下文行），且对于大重构（如重命名导致的文件移动），输出量可能极大但实际语义变更很少。

**方案**
air-diff 对 git diff 输出进行压缩和结构化：

```bash
air-diff HEAD~1
# Output:
# 3 files changed (+25 -10)
#
# src/auth.ts: Modified login() - added options parameter
# src/types.ts: Added LoginOptions interface
# tests/auth.test.ts: Added 2 test cases for new options
```

**设计原则**
- 语义级摘要：描述"改了什么"而非"哪些行变了"
- 移动/重命名检测：识别文件移动并简洁报告，不重复展示内容
- 可配置详细度：从一行摘要到完整 diff 之间的多档选择
- 支持 staged/unstaged/commit 等多种 diff 范围

**预期 token 节省：40-70%**

### 4.6 Phase 2: 中间件层（PostToolUse Hook）

Phase 1 的工具是独立的、需要手动使用。Phase 2 将优化能力集成到 AI coding 框架内部。

**PostToolUse Hook**

在工具执行完成、结果返回给 AI 之前，插入一个处理层：

```
Tool Execution → PostToolUse Hook → AI Receives Output
                       ↓
              [air-read/air-bash/air-test/air-grep/air-edit 优化逻辑]
```

**任务感知**

中间件层的优势是可以获取更多上下文：AI 当前在做什么任务？这决定了摘要策略。

- 如果 AI 正在调试测试失败，失败信息需要详细展示
- 如果 AI 只是验证修复是否生效，"all tests passed"就足够了

**框架集成**

目标：向 Cursor, Claude Code, OpenCode 等项目提交 PR，将 AIR 集成为可选的后处理层。

### 4.7 Phase 3: 标准与生态

**AI Ergonomic Output (AEO) 规范**

定义一套工具输出的"适AI化"标准：
- 结构化优先（JSON/YAML 优于纯文本）
- 分层信息（摘要 + 可展开的详情）
- 确定性输出（同样输入产生同样输出，便于缓存）
- Token-aware（输出带有 token 计数元信息）

**合规性检查**

工具开发者可以用 AIR 提供的检查器验证输出是否符合 AEO 标准。

**传播**

通过博客、论文、会议演讲，将"适AI化"概念推广到更广泛的开发者工具社区。

## 5. 非功能性需求

**性能**
工具包装增加的延迟 < 100ms。用户不应感知到 AIR 的存在。输出处理使用流式方式，大文件不阻塞。

**兼容性**
- 操作系统：Windows, macOS, Linux
- 运行时：Node.js 18+
- 包管理器：npm, pnpm, yarn

**无外部依赖**
摘要逻辑使用规则引擎，不调用 LLM API。这意味着：
- 零额外成本
- 确定性输出
- 无网络延迟
- 离线可用

**可度量**
每次使用记录：原始 token 数、优化后 token 数、处理耗时。支持导出统计数据。

## 6. 度量标准

**核心指标**

| 指标 | 定义 | 目标 |
|---|---|---|
| Token Savings Rate (TSR) | (原始tokens - 优化后tokens) / 原始tokens | > 70% |
| Information Retention Rate (IRR) | 优化后输出是否保留关键信息（人工评测） | > 95% |
| Latency Overhead | 额外处理时间 | < 100ms |

**生态指标**

| 指标 | 定义 | 目标 (6个月) |
|---|---|---|
| GitHub Stars | 项目受欢迎程度 | > 500 |
| npm Downloads | 实际使用量 | > 1000/周 |
| PR Acceptance | 被主流框架采纳 | >= 1 |

## 7. 风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|---|---|---|---|
| 摘要丢失关键信息 | 中 | 高 | 完整输出始终保留；提供 verbose 模式；IRR 指标监控 |
| 各框架 hook 机制不统一 | 高 | 中 | Phase 1 做独立工具，无框架依赖；Phase 2 逐个适配，接受部分框架不支持 |
| AI 工具快速迭代导致方案失效 | 中 | 中 | 核心原则（Prevention > Cleanup）不变；实现层设计为可插拔 |
| npm 包名 "air" 被占用 | 已确认 | 低 | 该包为僵尸包（7年无更新），可走 npm 争议流程；备选方案：@air/core |
| 用户不愿改变工具习惯 | 中 | 高 | 设计为 drop-in replacement（air-test 用法与 pytest 几乎相同） |

## 8. 路线图

| 阶段 | 时间 | 交付物 | 成功标准 |
|---|---|---|---|
| Phase 1 MVP | 2-3 周 | air-read + air-bash | 2 个 P0 工具可用，TSR > 70% |
| Phase 1.5 | +2 周 | air-test + air-grep | 4 个工具可用，覆盖主要浪费场景 |
| Phase 2 | +3 周 | air-edit + PostToolUse hook | 免读取编辑可用；向至少一个框架提交 PR |
| Phase 2.5 | +2 周 | air-web + air-ls | 网页正文提取 + 紧凑目录列表可用 |
| Phase 3 | +4 周 | air-context + air-diff + AEO spec | 上下文管理原型；智能 diff；规范文档发布 |

## 9. 开放问题

几个尚未完全确定的设计决策：

**Q1: air-read 的 focused 模式是否需要 tree-sitter？**
精确的代码分析需要解析 AST。Tree-sitter 是成熟方案，但增加了依赖复杂度。替代方案：正则 + 启发式规则，精度换简单性。

**Q2: 如何处理非英文输出？**
测试框架可能输出中文错误信息。规则引擎需要语言无关的模式匹配。初版可能只优化英文输出，后续迭代支持多语言。

**Q3: 是否需要配置文件？**
用户可能想自定义摘要规则。但配置文件增加复杂度。倾向于：Phase 1 硬编码合理默认值，Phase 2 根据反馈决定是否加配置。

**Q4: air-bash 的"智能摘要"如何实现？**
三种可能路径：纯规则引擎（正则 + 模式匹配）、LLM 辅助（调用轻量模型做摘要）、混合方案（规则兜底 + LLM 增强）。纯规则与 §5 的"无外部依赖"原则一致，但覆盖率有限；LLM 辅助效果好但引入成本和延迟。需要在 Phase 1 中用实际数据评估。

**Q5: air-edit 的 search/replace 如何处理模糊匹配？**
当代码中存在多处相似片段时，纯文本匹配可能定位错误。可能的策略：要求精确匹配（安全但不灵活）、上下文辅助匹配（提供周围 N 行作为锚点）、AST 感知匹配（语义级别定位）。需要收集真实编辑场景数据来决定。

**Q6: 与 ai-see 项目的功能边界？**
ai-see = 组合创新/创造新功能（如视觉分析、多模态理解）；AIR = 替代现有工具/做得更经济（同样的事，更少的 token）。两者互补但需要明确边界，避免功能重叠。

---

*文档版本：v0.3*  
*最后更新：2026-03-09*
