# AIR 改进方案：从 AI Coding 工具优化到通用 AI Agent 输出优化

> **版本**: v1.0
> **日期**: 2026-03-15
> **触发**: 用户提出的战略问题——订阅制 AI 编程工具（Claude Code / OpenAI 套餐）普及后，AIR 项目是否还有价值？
> **来源**: context_log #318-323，OpenClaw 调研，飞书讨论

---

## 1. 战略背景

### 1.1 原始问题

2026 年 3 月，AI coding 工具进入订阅制时代：
- **Claude Code**: 月费 $200，Max 套餐 token 用量大幅提升
- **OpenAI**: ChatGPT Pro + Codex，包月制降低了用户对 token 成本的敏感度
- **Cursor / Windsurf**: IDE 级别订阅，内置 context 管理

在这一背景下，AIR 原始的价值主张——"节省 token = 节省钱"——受到挑战。当用户不再按 token 付费时，"节省 50-96% 上下文浪费"的卖点是否还成立？

### 1.2 分析结论

**AIR 的核心价值不是省钱，是提升 AI 决策质量。**

即使 token 不限量，上下文窗口仍然有限（200K token 并不大）。噪音占据上下文窗口 → AI 注意力被稀释 → 推理质量下降。AIR 的真正价值是：
- 让 AI 在有限窗口内看到**更多有效信息**
- 减少 compaction 频率 → 保留更多历史上下文
- 延长 agent 的**有效工作时间**（不是计费时间）

### 1.3 市场机会：通用 AI Agent

通过对 OpenClaw（314K stars）的深度调研，发现了比 AI coding 更大的市场：

| 维度 | AI Coding 工具 | 通用 AI Agent |
|---|---|---|
| 代表产品 | Cursor, Claude Code, OpenCode | OpenClaw, AutoGPT, AgentGPT |
| 计费模型 | 订阅制（token 不敏感） | **API 直付**（token 极度敏感） |
| 工具集 | Read/Edit/Bash/Grep（文件为中心） | Shell + Browser + 消息 + 设备（多模态） |
| 运行时长 | 分钟级 | **小时级甚至持续运行** |
| 上下文压力 | 中等 | **极大**（长对话 + 多工具 + 多模态） |
| AIR 价值 | 中（订阅制削弱了 token 节省价值） | **高**（每个 token 直接计费） |

**结论：AIR 应从"AI coding 工具优化"转向"通用 AI agent 输出优化"。**

---

## 2. 当前状态

### 2.1 已完成（Phase 1 — 2026-03-13）

| 组件 | 状态 | 说明 |
|---|---|---|
| air-read | ✅ 已完成 | 注释/import 折叠，空行压缩，max-lines 截断 |
| air-bash | ✅ 已完成 | ANSI 剥离，进度条过滤，重复行折叠 |
| air-test | ✅ 已完成 | pytest/jest/vitest/go test 解析，失败信息提取 |
| air-grep | ✅ 已完成 | 按文件分组，路径去重，块截断 |
| air-edit | ✅ 已完成 | search/replace 免前置 Read，精确 + 模糊匹配 |
| air-web | ✅ 已完成 | Readability + Markdown 转换 |
| air-ls | ✅ 已完成 | tree 风格输出（代码存在，测试未完善） |
| air-diff | ✅ 已完成 | 结构化 diff 解析（代码存在，测试未完善） |
| air-context | ✅ 原型 | OC 插件中实现（context_stats/context_slim） |
| CLI | ✅ 已完成 | 8 个 CLI 命令 |
| MCP Server | ✅ 已完成 | stdio 模式 |
| OC Plugin | ✅ 已完成 | 9 个 air_* 工具 |
| 测试 | ✅ 376 tests 全绿 | vitest |
| Git | ✅ 已提交 | commit `1bff82e` |

### 2.2 Phase 1 基准测试结果

| 压缩器 | 实际节省率 | PRD 预期 | 差距分析 |
|---|---|---|---|
| air-read（默认） | 1-23% | 50-80% | ⚠️ 远低于预期；skeleton/focus 模式未实现 |
| air-read（max-lines） | 72-98% | - | ✅ 截断模式效果好，但属于暴力截断 |
| air-bash | 0-23% | 60-90% | ⚠️ 仅 npm install 有效，编译/测试/git 输出无压缩 |
| air-test | 未单独基准 | 90%+ | 待验证 |
| air-grep | 未单独基准 | 40-60% | 待验证 |

**关键发现**：Phase 1 的规则引擎压缩效果**显著低于 PRD 预期**。原因是纯规则覆盖率有限，真正的"智能摘要"需要更深层的语义理解或模式匹配。

---

## 3. 改进计划

### 3.1 战略转向

```
原路线                                新路线
─────                                ─────
AI Coding 工具优化                    通用 AI Agent 输出优化
  ↓                                    ↓
Phase 1: 独立工具                     Phase 1: 独立工具 ✅ (已完成)
Phase 2: PostToolUse Hook             Phase 2A: 现有工具增强 ← 你在这里
Phase 3: AEO 标准                     Phase 2B: 新增 Agent 专用工具
                                      Phase 3: Agent 框架集成 + AEO 标准
```

### 3.2 现有工具增强（Phase 2A）

#### air-web 升级：DOM Snapshot 压缩模式

**动机**：通用 AI agent（如 OpenClaw）大量使用浏览器自动化。`browser.snapshot` 返回的 DOM 快照动辄数万 token，但 agent 通常只需要交互元素和关键文本。

**改进内容**：
- 新增 `--mode=snapshot` 模式：压缩浏览器 DOM 快照（保留交互元素 + 文本内容，去除样式/脚本/隐藏元素）
- 新增 `--mode=extract` 模式：基于 CSS 选择器或 XPath 精确提取目标内容
- 内容密度评分增强：输出压缩前后的 token 计数对比

**预期效果**：DOM 快照压缩 60-80%

#### air-bash 升级：系统运维命令 Profile

**动机**：通用 AI agent 不只执行 `npm install`，还执行系统管理命令（`systemctl status`、`docker ps`、`df -h`、`top` 等）。当前 air-bash 的规则引擎仅覆盖 npm/yarn 模式。

**改进内容**：
- 新增命令 profile 系统：按命令类型加载不同的压缩规则
  - `package-manager` profile: npm, yarn, pnpm, pip（现有）
  - `build-tool` profile: make, gradle, cargo, go build
  - `container` profile: docker, podman, kubectl
  - `system` profile: systemctl, journalctl, df, top, ps
  - `git` profile: git log, git status, git diff（部分与 air-diff 重叠）
- 自动 profile 检测：根据命令前缀自动选择 profile
- 可扩展：用户可通过配置文件自定义 profile

**预期效果**：从当前 0-23% 提升到 40-70%

#### air-context 升级：跨框架抽象层

**动机**：原 air-context 仅适配 OpenCode。要支持通用 AI agent，需要抽象化接口。

**改进内容**：
- 定义 `ContextProvider` 接口：`getStats()`, `slim()`, `getHistory()`
- 实现 OpenCode adapter（已有原型）
- 预留 OpenClaw adapter 接口（依赖 OpenClaw 的 compaction API）
- Token 预算管理：设定阈值，自动建议或执行精简

### 3.3 新增 Agent 专用工具（Phase 2B）

#### 🆕 air-session — 长对话历史压缩（最高 ROI）

**问题**：通用 AI agent 运行数小时，对话历史膨胀到上下文窗口极限。现有方案是暴力 compaction（让 LLM 自己总结），代价是一次额外 API 调用 + 信息丢失不可控。

**方案**：基于规则的对话历史压缩，在 compaction 之前做一层预处理：
- 工具调用结果压缩：将历史中的工具调用结果替换为摘要（利用已有的 air-read/air-bash/air-test 等压缩器）
- 重复模式检测：识别"Read → Edit → Read → Edit"循环，合并为摘要
- 时间衰减：越旧的消息压缩越激进
- 锚点保留：保留用户明确标记为重要的消息

**输入**：对话历史 JSON（OpenAI 格式的 messages 数组）
**输出**：压缩后的 messages 数组

**预期效果**：在不调用 LLM 的前提下，将对话历史压缩 40-60%
**ROI 最高的原因**：这个工具直接解决通用 agent 最核心的痛点——长时间运行的上下文爆满

#### 🆕 air-api — JSON/API 响应裁剪

**问题**：AI agent 调用外部 API（REST/GraphQL），返回的 JSON 通常包含大量 agent 不需要的字段（metadata、pagination、nested objects、null 值等）。

**方案**：
- 自动字段裁剪：移除空值/null/默认值字段
- 深度限制：JSON 嵌套超过 N 层自动折叠为 `{...}`
- 数组截断：超过 N 个元素的数组显示前几个 + 计数
- Schema 感知：如果提供了 JSON Schema，只保留 schema 中标记为 required 的字段
- 大小限制：超过 token budget 时智能截断

**示例**：
```json
// 原始 API 响应 (2000 tokens)
{
  "data": [
    {"id": 1, "name": "Alice", "email": "a@b.com", "created_at": "...", "updated_at": "...", "avatar_url": null, "preferences": {"theme": "dark", "locale": "en", ...}, ...},
    // ... 50 more items
  ],
  "meta": {"total": 1234, "page": 1, "per_page": 50, "total_pages": 25},
  "links": {"self": "...", "next": "...", "prev": null}
}

// air-api 输出 (400 tokens)
{
  "data": [
    {"id": 1, "name": "Alice", "email": "a@b.com"},
    {"id": 2, "name": "Bob", "email": "b@c.com"},
    // ... (50 items, showing first 3)
  ],
  "meta": {"total": 1234, "page": 1}
}
```

**预期效果**：API 响应压缩 50-80%

#### 🆕 air-media — 转录文本清洗

**问题**：AI agent 处理音频/视频转录文本（Whisper、语音消息等），转录输出包含大量冗余：时间戳标记、说话人标签重复、填充词（"嗯"、"啊"、"you know"）、重复句子（转录错误）。

**方案**：
- 时间戳压缩：将逐词时间戳折叠为段落级时间戳
- 填充词过滤：移除无语义贡献的填充词
- 重复检测：合并因转录错误产生的重复/相似句子
- 说话人合并：连续同一说话人的发言合并为一段
- 语言感知：支持中文/英文/日文等常见语言的填充词库

**预期效果**：转录文本压缩 30-50%

### 3.4 优先级调整

| 工具 | 原优先级 | 新优先级 | 调整原因 |
|---|---|---|---|
| air-read | T1 (P0) | T1 (P0) | 不变，核心工具 |
| air-bash | T1 (P0) | T1 (P0) ↑ | 不变但需增强 profile 系统 |
| air-web | T2 (P2) | **T1 (P1) ↑** | DOM snapshot 压缩对通用 agent 价值极高 |
| air-context | T2 (P2) | **T1 (P1) ↑** | 跨框架上下文管理是 agent 核心需求 |
| **air-session** | 不存在 | **T1 (P0) 🆕** | 最高 ROI，直接解决长运行 agent 核心痛点 |
| **air-api** | 不存在 | **T2 (P1) 🆕** | API 调用是 agent 主要信息来源 |
| **air-media** | 不存在 | **T2 (P2) 🆕** | 语音/视频 agent 场景 |
| air-test | T1 (P1) | **T2 (P2) ↓** | coding 专用，通用 agent 较少使用 |
| air-edit | T1 (P1) | **T2 (P2) ↓** | coding 专用，通用 agent 较少使用 |
| air-diff | T3 (P3) | **T3 (P3)** | 不变，优先级最低 |
| air-grep | T1 (P1) | T1 (P1) | 不变 |
| air-ls | T2 (P2) | T2 (P2) | 不变 |

### 3.5 Phase 1 压缩率提升措施

Phase 1 基准测试暴露了规则引擎覆盖率不足的问题。除了新增工具外，需要提升现有工具的压缩效果：

| 工具 | 当前问题 | 改进方向 |
|---|---|---|
| air-read | skeleton/focus 模式未实现 | 实现 tree-sitter AST 解析，支持 skeleton 提取 |
| air-bash | 仅匹配 npm 模式 | profile 系统（见 3.2） |
| air-test | 基准未测 | 补充基准测试 |
| air-grep | 基准未测 | 补充基准测试 |
| air-web | 功能已有 | DOM snapshot 新模式 |

---

## 4. 实施路线

| 阶段 | 时间估计 | 交付物 | 关键指标 |
|---|---|---|---|
| Phase 2A-1 | 1 周 | air-bash profile 系统 + air-read skeleton 模式 | 压缩率提升到 PRD 预期的 70%+ |
| Phase 2A-2 | 1 周 | air-web DOM snapshot 模式 | DOM 快照压缩 60%+ |
| Phase 2B-1 | 2 周 | **air-session** 长对话压缩 | 对话历史压缩 40%+ |
| Phase 2B-2 | 1 周 | **air-api** JSON 响应裁剪 | API 响应压缩 50%+ |
| Phase 2B-3 | 1 周 | **air-media** 转录清洗 | 转录文本压缩 30%+ |
| Phase 2C | 2 周 | air-context 跨框架抽象 | 支持 2+ agent 框架 |
| Phase 3 | 持续 | AEO 规范 + 框架集成 PR | 至少 1 个框架采纳 |

---

## 5. 目标用户更新

原 PRD 定义的三类用户需要扩展：

| 用户类型 | 原 PRD | 新增/调整 |
|---|---|---|
| AI coding 工具开发者 | ✅ 保留 | 价值定位从"省钱"调整为"提升 AI 决策质量" |
| AI 编程工作流重度用户 | ✅ 保留 | - |
| AI agent 框架开发者 | ✅ 保留 | **升级为首要目标用户** |
| 🆕 通用 AI agent 产品 | 不存在 | OpenClaw、AutoGPT 等个人 AI 助手产品 |
| 🆕 企业 AI agent 平台 | 不存在 | 内部 agent 平台（API 计费，token 成本敏感） |

---

## 6. 风险更新

| 风险 | 概率 | 影响 | 缓解策略 |
|---|---|---|---|
| 通用 agent 市场碎片化 | 高 | 中 | air-session 和 air-api 不依赖特定框架，输入输出都是标准格式 |
| OpenClaw 等产品自建压缩 | 中 | 高 | 先发优势 + 开源生态 + AIR 做得更专业（他们是产品，我们是工具） |
| 规则引擎天花板 | 高 | 中 | 考虑引入轻量级 ML 模型（如 distilled 的小模型）做辅助判断，不依赖外部 API |
| air-session 的对话格式兼容性 | 中 | 中 | 以 OpenAI messages 格式为主，适配其他格式 |

---

## 7. 与原 PRD 的关系

本文档**不替代** `PRD.md`，而是作为 Phase 2+ 的战略补充：
- `PRD.md` v0.3 → 定义了 9 个工具的完整设计（Phase 1 已交付）
- `IMPROVEMENT-PLAN.md` v1.0 → 定义了战略转向 + 新增工具 + 优先级调整（Phase 2+）

当本文档方案稳定后，应将核心内容合并回 `PRD.md` v0.4。

---

*文档版本：v1.0*
*最后更新：2026-03-15*
*决策来源：context_log #318, #319, #323*
