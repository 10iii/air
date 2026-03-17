> **变更日志**
> - v0.5 (2026-03-17): DB 审计后更新 — air-context 限定为 OC-Only（不跨框架）；360 搜索列为待评估提案；区域检测增加辅助判定条件；air-web 大页面智能过滤；air-read skeleton/focused 两步走方案确定；路线图 Phase 2B/2C/2D 标记为已完成；新增开放问题 4&5
> - v0.4 (2026-03-17): 整合 PRD-SEARCH / IMPROVEMENT-PLAN，扩展为统一 PRD；新增 Tool 10 (air-search)、Tool 11-13 (air-session/air-api/air-media)；战略转向"通用 AI Agent 输出优化"；优先级重排
> - v0.3 (2026-03-09): 工具清单从 5 扩展至 9 个（新增 T2: air-web/air-ls/air-context，T3: air-diff），路线图细化为 5 阶段，删除 air-repomap（与 ai-see scout 重叠）
> - v0.2 (2026-03-09): 对齐 TOOL-INVENTORY 调研结论，扩展工具清单（3->5），air-run 更名 air-bash，新增 air-grep/air-edit
> - v0.1 (2026-03-09): 初版

# AIR (AI Ergonomics) — 产品需求文档

## 1. 产品愿景

AIR 是一套"适AI化改造"工具集。

这个名字借鉴了"适老化改造"的概念：当社会进入老龄化，基础设施需要重新设计来适应老年人的需求。同样地，当 AI 成为开发工具的主要用户，工具的输出格式需要从"人类可读"进化为"AI 高效"。

**核心问题：上下文窗口是 AI 最稀缺的资源。**

一个 200K token 的上下文窗口听起来很大，但实际使用中：
- 一次 `npm install` 输出可能吃掉 2000+ tokens
- 一次完整的测试报告可能消耗 5000+ tokens
- 一个中等大小的文件可能占用 1000+ tokens

更关键的是，这些输出中有 50-96% 是噪音。进度条、空行、重复信息、AI 根本不需要的细节。

**AIR 的核心价值不是省钱，是提升 AI 决策质量。** 即使 token 不限量（订阅制），上下文窗口仍然有限。噪音占据上下文窗口 → AI 注意力被稀释 → 推理质量下降。AIR 的真正价值是：
- 让 AI 在有限窗口内看到**更多有效信息**
- 减少 compaction 频率 → 保留更多历史上下文
- 延长 agent 的**有效工作时间**

现有的解决方案是 **Cleanup**：让 AI 在拿到输出后自己总结。这是事后补救，问题已经发生了。

AIR 的方案是 **Prevention**：在工具输出的那一刻就拦截和优化，让无用信息根本不进入上下文窗口。

## 2. 战略定位

### 2.1 从 AI Coding 到通用 AI Agent

2026 年 3 月，AI coding 工具进入订阅制时代（Claude Code $200/月、OpenAI Codex 包月），用户对 token 成本敏感度下降。但通用 AI Agent 市场（OpenClaw 314K stars、AutoGPT 等）仍然 API 直付、token 极度敏感、运行时间长达数小时。

**AIR 应从"AI coding 工具优化"转向"通用 AI agent 输出优化"。**

| 维度 | AI Coding 工具 | 通用 AI Agent |
|---|---|---|
| 代表产品 | Cursor, Claude Code, OpenCode | OpenClaw, AutoGPT, AgentGPT |
| 计费模型 | 订阅制（token 不敏感） | **API 直付**（token 极度敏感） |
| 运行时长 | 分钟级 | **小时级甚至持续运行** |
| 上下文压力 | 中等 | **极大** |
| AIR 价值 | 中（提升决策质量） | **高**（每个 token 直接计费 + 质量提升） |

### 2.2 设计原则

| 原则 | 说明 |
|---|---|
| **Prevention > Cleanup** | 在输出层拦截噪音，不让无用信息进入 context |
| **Rule-based > LLM-based** | 摘要引擎使用确定性规则，不依赖 LLM API |
| **Progressive Disclosure** | 先给骨架/摘要，AI 需要时再请求详情 |
| **Cross-platform** | 不绑定特定 IDE 或 AI coding 工具 |
| **Zero API Key** | 不要求用户购买任何 API（air-search 等网络工具同理） |

## 3. 目标用户

| 用户类型 | 优先级 | 说明 |
|---|---|---|
| **AI agent 框架开发者** | 首要 | OpenClaw、AutoGPT 等，token 成本敏感，运行时间长 |
| AI coding 工具开发者 | 重要 | Cursor, OpenCode, Cline 等 |
| AI 编程重度用户 | 重要 | 每天 AI pair programming 的开发者 |
| 企业 AI agent 平台 | 扩展 | 内部 agent 平台，API 计费 |

## 4. 核心价值主张

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

## 5. 工具清单（13 个）

### 5.1 T1 (P0-P1) — 核心工具（已完成 Phase 1）

| 优先级 | 工具 | 替代目标 | 核心价值 | 预期 TSR |
|---|---|---|---|---|
| P0 | **air-read** | Read/read_file | 去行号前缀，智能截断，结构感知 | 50-80% |
| P0 | **air-bash** | Bash/execute_command | 智能摘要，命令输出过滤与结构化 | 60-90% |
| P1 | **air-test** | pytest/jest/go test | 测试输出解析，仅保留失败信息 | 90%+ |
| P1 | **air-grep** | Grep/search_files | 去冗余上下文，路径去重，智能聚合 | 40-60% |
| P1 | **air-edit** | Edit/edit_file | 免前置 Read 直接编辑(search/replace) | 间接 |

### 5.2 T2 (P1-P2) — 扩展工具

| 优先级 | 工具 | 替代目标 | 核心价值 | 预期 TSR |
|---|---|---|---|---|
| **P0** | **air-session** 🆕 | (无对应) | 长对话历史压缩（最高 ROI） | 40-60% |
| P1 | **air-web** | WebFetch/web_search | 网页正文智能提取 + DOM snapshot 模式 | 50-80% |
| P1 | **air-context** | (无对应) | 跨框架主动上下文预算管理 | 变化 |
| **P1** | **air-api** 🆕 | (无对应) | JSON/API 响应裁剪 | 50-80% |
| P2 | **air-search** 🆕 | (无对应) | 客户端搜索聚合（零 API key） | >50% |
| P2 | **air-ls** | LS/list_files | tree 风格紧凑输出 | 20-40% |
| **P2** | **air-media** 🆕 | (无对应) | 转录文本清洗 | 30-50% |

### 5.3 T3 (P3) — 远期工具

| 优先级 | 工具 | 替代目标 | 核心价值 | 预期 TSR |
|---|---|---|---|---|
| P3 | **air-diff** | git diff | 智能变更摘要 | 40-70% |

## 6. 工具详细设计

### Tool 1: air-read — 智能文件读取 [P0] ✅

**问题**：AI 请求读取 500 行文件，往往只需找一个函数。整个文件进入上下文，且所有工具（7/7 产品）都给每行加行号前缀 `N: content`，每行增加 ~5-8 字符。

**方案**：多种输出模式（skeleton/focus/full），根据使用目的选择最优方案。去除行号前缀噪音。

**当前实现**（Phase 1）：行号去除、注释/import 折叠、空行合并、智能截断。实测 TSR 1-23%。

**Skeleton/Focused 模式增强（两步走）**：

Step 1 — 正则 + 缩进启发式（近期，Phase 2A）：
- 语言特定正则模式提取函数/类签名（Python: `def/class`、JS/TS: `function/class/export`、Go: `func/type`）
- 按缩进层级识别代码块边界，折叠函数体
- 零依赖、零延迟、体积不变
- 精度约 80%，预期 TSR 提升至 30-50%

Step 2 — tree-sitter WASM 精准模式（远期，可选依赖）：
- `web-tree-sitter`（4.5MB）+ `tree-sitter-wasms`（52MB，按需加载 ~15MB）
- 作为 optional peer dependency，用户手动安装后自动启用
- 未安装时降级到 Step 1 正则模式（零感知）
- 精准 AST skeleton：函数签名 + 参数类型 + 返回类型，不含函数体
- Focused 模式：AST query 精准定位目标函数/类
- 预期 TSR 50-80%

**参考实现**：Cline、Continue、Roo Code、repomix 均采用 `web-tree-sitter` + `tree-sitter-wasms` WASM 方案

**预期 TSR：30-50%（Step 1）→ 50-80%（Step 2）**

### Tool 2: air-bash — 命令输出智能摘要 [P0] ✅

**问题**：所有 7 款产品都将 Shell 命令输出原样传回，没有任何智能处理。

**方案**：包装 shell 命令执行，智能处理输出。成功时仅返回摘要；失败时返回错误信息 + 最相关上下文行。支持命令 profile 系统（npm/make/docker/systemctl 等）。

**预期 TSR：60-90%**

### Tool 3: air-test — 测试输出智能摘要 [P1] ✅

**问题**：测试框架输出 500+ 行，AI 真正需要的信息可能只有 20 行。

**方案**：包装测试运行器（pytest/jest/vitest/go test/cargo test），将输出转化为结构化摘要。成功测试只需一个数字，失败测试需要：测试名 + 简短错误描述。

**预期 TSR：90%+**

### Tool 4: air-grep — 搜索结果智能聚合 [P1] ✅

**问题**：搜索结果 20-40% 的输出是重复路径和无关上下文。

**方案**：按文件分组（路径只出现一次）、可配置上下文行数、匹配计数摘要、结果数量上限。

**预期 TSR：40-60%**

### Tool 5: air-edit — 免读取直接编辑 [P1] ✅

**问题**：行号标签派（Claude Code/OpenCode）需要 Read-Edit-Read-Edit 循环；Search/Replace 派（Cursor/Aider）可能模糊匹配错误。

**方案**：采用 search/replace 模式，同时支持精确匹配 + 模糊匹配 + 上下文辅助匹配。不依赖行号/标签。

**预期 TSR：间接但显著**

### Tool 6: air-session — 长对话历史压缩 [P0] 🆕

> **最高 ROI** — 直接解决通用 agent 最核心的痛点

**问题**：通用 AI agent 运行数小时，对话历史膨胀到上下文窗口极限。现有方案是暴力 compaction（让 LLM 自己总结），代价是一次额外 API 调用 + 信息丢失不可控。

**方案**：基于规则的对话历史压缩，在 compaction 之前做一层预处理：
- 工具调用结果压缩：将历史中的工具调用结果替换为摘要（利用已有的 air-read/air-bash/air-test 等压缩器）
- 重复模式检测：识别"Read → Edit → Read → Edit"循环，合并为摘要
- 时间衰减：越旧的消息压缩越激进
- 锚点保留：保留用户明确标记为重要的消息

**输入**：对话历史 JSON（OpenAI 格式的 messages 数组）
**输出**：压缩后的 messages 数组

**预期 TSR：40-60%（不调用 LLM）**

### Tool 7: air-web — 网页正文智能提取 [P1] ✅

**问题**：网页转 markdown 后 70-90% 是导航栏、页脚、广告等结构性噪音。

**方案**：DOM 解析 + 正文提取算法（Readability）+ 内容密度评分。新增 DOM snapshot 压缩模式（面向通用 agent 的浏览器自动化场景）。

**大页面智能过滤**（>5MB）：对于大型页面，需要智能过滤界面标签、广告、导航等非内容元素，避免 token 爆炸。

**预期 TSR：50-80%**

### Tool 8: air-context — 主动上下文预算管理 [P1] (OC-Only)

**问题**：AI agent 在长会话中缺乏对上下文窗口剩余空间的感知。

**方案**：定义 `ContextProvider` 接口（`getStats()`/`slim()`/`getHistory()`），作为 OpenCode 专用插件实现。已有 OpenCode adapter 原型。

**限制**：
- **仅限 OpenCode**，不做跨框架适配
- 理由：其他框架未必提供相应接口；上下文管理属于敏感操作，跨框架适配可能引发"效率下降/agent 崩溃/任务失败"等问题
- 依赖宿主 agent 的对话管理 API

### Tool 9: air-api — JSON/API 响应裁剪 [P1] 🆕

**问题**：AI agent 调用外部 API，返回的 JSON 通常包含大量 agent 不需要的字段（metadata、pagination、nested objects、null 值等）。

**方案**：
- 自动字段裁剪：移除空值/null/默认值字段
- 深度限制：JSON 嵌套超过 N 层自动折叠为 `{...}`
- 数组截断：超过 N 个元素的数组显示前几个 + 计数
- Schema 感知：如果提供了 JSON Schema，只保留 required 字段
- 大小限制：超过 token budget 时智能截断

**预期 TSR：50-80%**

### Tool 10: air-search — 客户端搜索聚合 [P2] 🆕

**问题**：AI agent 需要搜索能力但商业搜索 API 昂贵（Exa/Tavily $100/10K），且工具的工具不应让用户购买 API。

**方案**：客户端聚合 + 区域分流架构。零 API Key，零服务器成本。

**核心特性**：
- **区域自动检测**：安装时 ping Google（2s 超时），判断中国/海外，存入配置。辅助判定条件：检测系统语言/时区、DNS 解析测试等多重验证，避免单一条件误判
- **引擎组合**：
  | 区域 | 引擎 1（主） | 引擎 2 | 引擎 3（可选） |
  |---|---|---|---|
  | 中国大陆 | Baidu (JSON API) | Bing (HTML 解析) | Sogou (HTML 解析) |
  | 海外 | DuckDuckGo (npm API) | Bing (HTML 解析) | — |
- **待评估引擎**：360 搜索（需 Cookie 预获取，选择器 `.res-list/.res-title`）— 列为进一步讨论/改进提案
- **聚合去重**：URL 规范化去重 + 多引擎交叉验证加分
- **降级容错**：单引擎失败不影响其他引擎结果

**关键技术**：
- 百度隐藏 JSON API：`baidu.com/s?wd=QUERY&tn=json`，返回结构化 `data.feed.entry[]`
- Bing URL base64 解码：`/ck/a?u=a1XXX` → strip "a1" + base64 decode
- cheerio HTML 解析（Bing/Sogou）
- `duck-duck-scrape` npm 包（DDG）

**预期 TSR：>50%（vs 原始搜索结果）**

> 详细技术设计见 `DESIGN.md` air-search 章节

### Tool 11: air-ls — 目录列表紧凑输出 [P2] ✅

**方案**：tree 风格紧凑输出 + 可配置深度 + 文件类型分组。

**预期 TSR：20-40%**

### Tool 12: air-media — 转录文本清洗 [P2] 🆕

**问题**：AI agent 处理音频/视频转录文本，包含大量冗余（时间戳标记、填充词、重复句子）。

**方案**：时间戳压缩、填充词过滤、重复检测、说话人合并、多语言支持。

**预期 TSR：30-50%**

### Tool 13: air-diff — 智能变更摘要 [P3] ✅

**方案**：语义级摘要（描述"改了什么"而非"哪些行变了"）+ 移动/重命名检测 + 可配置详细度。

**预期 TSR：40-70%**

## 7. 中间件层与生态（Phase 3+）

### 7.1 PostToolUse Hook

在工具执行完成、结果返回给 AI 之前，插入处理层：

```
Tool Execution → PostToolUse Hook → AI Receives Output
                       ↓
              [AIR 优化逻辑]
```

目标：向 Cursor, Claude Code, OpenCode 等项目提交 PR，将 AIR 集成为可选后处理层。

### 7.2 AI Ergonomic Output (AEO) 规范

定义一套工具输出的"适AI化"标准：
- 结构化优先（JSON/YAML 优于纯文本）
- 分层信息（摘要 + 可展开的详情）
- 确定性输出（同样输入产生同样输出，便于缓存）
- Token-aware（输出带有 token 计数元信息）

## 8. 非功能性需求

| 需求 | 目标 |
|---|---|
| 处理延迟 | < 100ms（用户无感知） |
| 零外部依赖 | 摘要逻辑规则引擎驱动，不调用 LLM API |
| 零 API Key | 所有工具无需付费 API（包括 air-search） |
| 确定性输出 | 同样输入产生同样输出 |
| 跨平台 | Windows, macOS, Linux |
| 运行时 | Node.js 18+ |
| 离线可用 | 网络依赖仅限 air-search/air-web |

## 9. 度量标准

**核心指标**

| 指标 | 定义 | 目标 |
|---|---|---|
| Token Savings Rate (TSR) | (原始 tokens - 优化后 tokens) / 原始 tokens | > 70% |
| Information Retention Rate (IRR) | 优化后输出是否保留关键信息 | > 95% |
| Latency Overhead | 额外处理时间 | < 100ms |
| Anti-bot Resilience | 搜索引擎反爬后成功降级比例 | > 95% |

**生态指标**

| 指标 | 定义 | 目标 (6 个月) |
|---|---|---|
| GitHub Stars | 项目受欢迎程度 | > 500 |
| npm Downloads | 实际使用量 | > 1000/周 |
| PR Acceptance | 被主流框架采纳 | >= 1 |

## 10. 风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|---|---|---|---|
| 摘要丢失关键信息 | 中 | 高 | 完整输出始终保留；提供 verbose 模式；IRR 监控 |
| 各框架 hook 不统一 | 高 | 中 | 先做独立工具，后逐个适配 |
| 通用 agent 市场碎片化 | 高 | 中 | air-session/air-api 不依赖特定框架，输入输出标准格式 |
| 主流产品自建压缩 | 中 | 高 | 先发优势 + 开源生态 + 专业工具 vs 通用产品 |
| 规则引擎天花板 | 高 | 中 | 考虑轻量级 ML 辅助判断 |
| 搜索引擎反爬 | 中 | 中 | 多引擎降级 + 限速 + UA 轮换 |
| 百度 JSON API 变更 | 低 | 高 | SearXNG 长期稳定使用；可回退 HTML 解析 |
| npm 包名 "air" 被占 | 已确认 | 低 | 僵尸包可争议；备选 @air/core |

## 11. 路线图

| 阶段 | 交付物 | 状态 |
|---|---|---|
| **Phase 1** | air-read + air-bash + air-test + air-grep + air-edit + air-web + air-ls + air-diff (8 工具) + CLI + MCP + OC Plugin + 376 tests | ✅ 已完成 |
| **Phase 2A** | air-bash profile 系统 + air-read skeleton 模式增强 | 📋 规划 |
| **Phase 2B-1** | **air-session** 长对话压缩 | ✅ 已完成 |
| **Phase 2B-2** | **air-api** JSON 响应裁剪 | ✅ 已完成 |
| **Phase 2C** | **air-search** 客户端搜索聚合（Baidu/DDG/Bing/Sogou） | ✅ 已完成（引擎为 stub，聚合逻辑完成） |
| **Phase 2D** | **air-media** 转录清洗 + air-web DOM snapshot + air-context OC-Only | ✅ air-media 已完成 / DOM snapshot 📋 / air-context 📋 |
| **Phase 3** | PostToolUse Hook + AEO 规范 + 框架集成 PR | 📋 远期 |

## 12. 开放问题

1. **air-read 的 focused 模式是否需要 tree-sitter？** ✅ 已决策：两步走方案。Step 1 正则启发式（零依赖），Step 2 tree-sitter WASM（可选依赖，降级透明）。
2. **air-session 的对话格式兼容性？** 以 OpenAI messages 格式为主，适配其他格式。（✅ 已实现）
3. **air-search 的搜索引擎 HTML 结构变更如何应对？** 选择器抽象化，变更时只需更新选择器。
4. **360 搜索引擎是否纳入？** 需 Cookie 预获取机制，技术可行但增加复杂度。列为提案待讨论。
5. **区域检测除 Google ping 外还需要哪些辅助条件？** 系统语言/时区、DNS 解析测试等方案待确认。

## 13. 参考文献

- **调研来源**：Claude Code #31279 (PostToolUse)、Cline #5646/#6637/#6708、Aider repo-map
- **工具调研**：7 款 AI 产品（Claude Code, OpenCode, Cursor, Aider, Roo Code, OpenClaw, Windsurf）工具内建分析（详见 git 历史 `TOOL-INVENTORY.md`）
- **SearXNG 引擎参考**：`searx/engines/baidu.py`、`bing.py`、`sogou.py`、`360search.py`

---

*文档版本：v0.5*
*最后更新：2026-03-17*
