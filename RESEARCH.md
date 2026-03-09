# AIR (AI eRgonomics) 调研文档

> **核心命题**：当前 AI coding tools 的工具输出专为人类设计，导致宝贵的 context window 被大量无关信息填满。本项目探索"适AI化改造"——让开发者工具对 AI 友好，如同"适老化改造"让基础设施适配新用户群体。

---

## 1. 问题定义

主流 AI coding tools（Cursor、Windsurf、Cline、OC/Crush、Aider、Claude Code）都面临同一个结构性困境：它们调用的底层工具——测试框架、grep、文件读取、终端命令——全部是为人类阅读设计的。

人类喜欢详细的错误堆栈、彩色高亮、渐进式日志。AI 不需要这些。AI 需要的是：**结构化、最小化、与当前任务相关的信息**。

Context window 是 AI 的工作记忆。当前主流模型的窗口在 120K 到 200K tokens 之间，听起来很大，实际上工具噪音可以轻松吃掉 30% 到 60%。一次失败的 pytest 运行、一个大文件的完整读取、一次 grep 搜索返回 200 个匹配——这些都在蚕食 AI 真正思考和工作的空间。

这不是"优化"问题，是"可用性"问题。当 context 被噪音填满，AI 的表现会显著下降：遗漏关键信息、重复犯错、无法保持长程任务的连贯性。

**类比**：适老化改造不是让老人"适应"不友好的设计，而是改造设计本身。同理，AIR 不是让 AI "忍受"人类工具，而是让工具输出适配 AI 作为主要消费者。

---

## 2. 痛点清单（按严重程度排序）

### 2.1 测试与构建输出——最大的 context 杀手

这是目前最严重的问题。

一个典型场景：pytest 跑 1400 个测试，3 个失败。输出超过 500 行，塞进 context。AI 真正需要的信息——哪 3 个测试失败、失败原因是什么——可能只有 20 行。

**浪费比例：约 96%**

Cline 的 issue #5646 是这个问题的极端案例：单次命令输出直接触发 429 "Request too large" 错误。用户的会话被一次测试运行彻底摧毁。

为什么测试输出特别糟糕？因为测试框架的设计哲学是"信息越多越好"：
- 完整的 fixture 设置日志
- 每个通过测试的确认信息
- 失败时的完整堆栈追踪（往往 20+ 层）
- 本地变量的 repr 输出
- 相似测试的重复错误信息

对人类调试有用。对 AI 是噪音洪流。

### 2.2 大文件读取——隐性 token 税

几乎所有工具的 View/Read 功能都会在每行前加行号。OC 的实现是 `%6s|` 格式——6 个字符的行号加一个分隔符。看起来无害，但累积起来：

- 500 行文件 = 3500 个额外字符（约 1000 tokens）
- 这些 tokens 纯粹是格式噪音

更隐蔽的问题是：AI 请求读取一个文件，往往只需要其中 20 行。但工具返回全部 500 行。Claude Code 的 issue #28783 揭示了一个危险情况：当文件被截断时，末尾的关键指令（guardrails）被静默丢弃，导致安全隐患。

**Aider 的解法值得关注**：repo-map 用图排序（graph-ranked）生成代码骨架——只保留函数签名、类型定义、导入关系，控制在约 1K tokens。这是目前最优雅的文件上下文方案，但仅限于代码结构，不处理命令输出。

### 2.3 搜索与 Grep 结果——无界输出

搜索工具的默认行为是返回所有匹配。用户搜 `useState`，返回 150 个匹配。AI 可能只需要前 5 个最相关的。

问题在于：
- 没有结果数量的默认限制
- 没有相关性排序（按文件路径字母序，或按出现顺序）
- 每个匹配都带完整上下文行

一次搜索轻松消耗 5K tokens，而有用信息可能只在前 500 tokens。

### 2.4 命令输出——终端的无限可能性

终端命令可以输出任意内容。npm install 的依赖树、docker build 的层层日志、编译器的警告洪流……

Cline 的两个 issue 说明了问题的严重性：
- #6708：大量终端输出导致插件冻结
- #6637：JetBrains 集成在大命令输出时完全不可用

这不只是 context 浪费，是工具崩溃。没有任何 AI coding tool 有成熟的命令输出截断或摘要机制。

### 2.5 Diff 输出——变更的海洋

`git diff` 在大 PR 上可以轻松产出 1000+ 行。AI 需要的可能只是"哪些文件改了、改了什么类型的内容"，不是每一行的具体变化。

目前没有工具支持"diff 摘要"——只能全量注入或完全不看。

### 2.6 重复文件读取——对话的记忆税

AI 在 turn 3 读了 `utils.py`，turn 7 再读一次，turn 12 又读一次。每次都是完整内容注入 context。

没有工具实现文件内容去重。Context 随对话长度线性增长，很大一部分是重复信息。

### 2.7 LSP 诊断——冗长的类型错误

TypeScript 的类型错误信息可以非常长——泛型嵌套、联合类型展开、完整的期望 vs 实际对比。一个错误信息 50 行很常见。

堆栈追踪同理：完整的 20 层调用栈，AI 可能只需要前 3 层。

---

## 3. 现有方案对比

### 3.1 Aider 的 Repo Map——文件上下文的标杆

Aider 的 repo-map 是目前最成熟的文件上下文优化方案。核心思路：
1. 用 tree-sitter 解析代码，提取结构（函数签名、类定义、导入）
2. 用图算法（类似 PageRank）计算文件重要性
3. 动态分配 token 预算，重要文件给更多骨架细节

**优点**：显著减少文件上下文，同时保留代码结构理解能力。

**局限**：只解决文件读取问题，完全不处理命令输出、测试结果、搜索结果等场景。

### 3.2 Cline 的系统提示自限——模型遵从的脆弱性

PR #7910 尝试了一个轻量方案：在系统提示中添加 COMMAND_BEST_PRACTICES 常量，指导模型主动使用 `| head -N`、`grep -i "error"` 等命令来限制输出。

**结局**：合并后又被 revert，理由是"需要更多测试"。

**根本问题**：依赖模型遵从指令。模型可能忘记、可能误判、可能在压力下跳过这些"最佳实践"。这不是可靠的工程方案。

### 3.3 Claude Code 的输出限制与自动压缩——事后补救

Claude Code 提供两个机制：
- `--output-limit`：硬性 token 上限
- `auto-compact`：context 达到约 80% 时触发，摘要整个对话

**问题**：这是反应式方案，不是预防式方案。噪音已经进入 context，再去清理。清理本身也消耗 tokens 和延迟。

Issue #31279 是这个问题最清晰的讨论，提出了 PostToolUse hook 的想法——在工具输出进入 context 前拦截和处理。标记为 triaged 但没有进展。

Issue #28863 提出"压缩被截断的响应"，被标记为 #31279 的 duplicate。社区明显在收敛到同一个认知：需要输出层面的干预。

### 3.4 Cursor 的 Diff-based Edit——编辑输出的优化

Cursor 的编辑操作只返回 diff 格式的变更，不返回完整文件。这是正确的方向。

但 Cursor 没有公开文档说明其 context 优化策略。搜索、grep、命令输出等场景也没有明确的处理机制。

### 3.5 OC/Crush——精简但不可扩展

OC（现已归档，转移到 charmbracelet/crush）的 Edit 工具输出很精简——只返回一行确认信息。

但 View 工具没有任何 verbosity 配置。更关键的是：OC 没有插件 override 机制，无法替换内置工具的实现。

在 OC/Crush 的 issue 列表中，没有发现关于 context 优化的讨论。这是一个空白。

**OpenCode 版本说明**：有两个不同的 OpenCode 项目需要区分：
1. Go 版本（opencode-ai/opencode） → 已归档 → charmbracelet/crush
2. TypeScript/Bun 版本（npm: opencode-ai，维护者：thdxr/Dax Raad，v1.2.x，周下载量 510K）

AIR 使用的是第二个（TypeScript 版本）。

---

## 4. 核心设计原则

从以上调研中，可以提炼几个设计原则：

### 4.1 Prevention > Cleanup

Claude Code #31279 的讨论达成了一个共识：**预防噪音进入 context，远比事后清理更高效**。

原因：
- 清理需要额外的 LLM 调用（摘要/压缩）
- 清理有信息丢失风险
- 清理增加延迟
- 噪音已经占用过 context 空间（即使后来被清理）

正确的干预点是 **PostToolUse**——工具执行完成、输出进入 context 之前。在这个点做过滤、摘要、结构化。

### 4.2 Task-Aware Summarization

为什么通用的 BM25 关键词索引不够用？因为工具输出的"相关性"取决于当前任务。

同一个 500 行的测试输出：
- 如果任务是"修复 test_user_login 的失败"，只需要那个测试的错误信息
- 如果任务是"检查测试覆盖率"，需要通过/失败的统计
- 如果任务是"加速测试运行"，需要每个测试的耗时

**摘要层必须理解任务上下文**，不能只做静态关键词匹配。这意味着需要把当前任务的描述传给摘要逻辑。

### 4.3 Structured Output

人类喜欢 prose，AI 喜欢 structure。

测试结果：
```json
{"passed": 1397, "failed": 3, "failures": [{"test": "test_login", "error": "AssertionError", "line": 42}]}
```

比 500 行的 pytest 输出对 AI 更有用。

**设计方向**：机器可读格式优先，附带人类可读摘要。完整原始输出存储在 context 外，AI 需要时可以请求查看。

### 4.4 Progressive Disclosure

不要一次性把所有信息塞给 AI。先给骨架/摘要，AI 判断需要深入时再请求详情。

Aider 的 repo-map 就是这个思路：先给代码结构，AI 认为需要看某个函数实现时再读取完整内容。

这个原则可以推广到所有工具类型：
- 测试结果：先给统计，需要时展开失败详情
- 搜索结果：先给匹配文件列表，需要时展开具体行
- 命令输出：先给退出码和摘要，需要时展开完整日志

---

## 5. 竞争格局与机会

### 5.1 学术空白

截至 2026 年 3 月，没有发现关于"AI-friendly tool output design"的学术论文。搜索 ACM、arXiv、Google Scholar，相关主题（LLM context optimization、agent tool design）的论文关注的是模型层面或 prompt 层面，不是工具输出层面。

**发表机会**：这是一个可以定义新问题空间的领域。一篇系统性的论文，定义问题、量化浪费、提出框架、实验验证，有首发优势。

### 5.2 社区动量

多个主流工具的 issue 列表都有相关讨论：
- Cline：#5646、#6637、#6708、PR #7910
- Claude Code：#31279、#28783、#28863

讨论活跃，但没有收敛到一个共识方案。社区处于"问题已识别，方案未确定"阶段。

Claude Code 的 context-mode 社区插件尝试用 BM25 做 context 压缩，但受限于关键词匹配的局限性。

### 5.3 差异化定位

AIR 的定位：
1. **系统性**：不是修某个工具的某个 bug，是定义一套完整的框架
2. **跨工具**：不绑定单一 IDE 或 AI coding tool
3. **预防+智能清理**：既有输出层优化（prevention），也有任务感知摘要（intelligent cleanup）

---

## 6. 技术架构方向（初步）

### 6.1 方案 A：Tool Output Middleware

在工具执行和 context 注入之间插入一层中间件：

```
Tool Execute → Raw Output → [AIR Middleware] → Optimized Output → Context
```

中间件职责：
- 解析工具类型（test、grep、read、bash...）
- 应用对应的输出优化策略
- 保留完整原始输出（供后续 drill-down）
- 返回结构化、最小化的摘要

**挑战**：需要 AI coding tool 提供 hook 点。目前只有 Claude Code 的讨论提到 PostToolUse，还没实现。OC/Crush 没有插件 override 机制。

**可行路径**：先在支持插件的平台（如 VS Code 扩展形式的 Cline）验证，再推动其他平台支持。

### 6.2 方案 B：Replacement Tools

不依赖现有工具，创建一套"AI-native"工具：

- `air-test`：跑测试，返回结构化结果
- `air-grep`：搜索，返回排序后的 top-N 匹配
- `air-read`：读文件，支持 skeleton 模式
- `air-run`：跑命令，自动截断+摘要

**优点**：不依赖外部 hook，完全可控。

**挑战**：用户需要改变习惯（用新工具名）、配置迁移成本。

### 6.3 方案 C：Protocol/Standard

定义"AI Ergonomic Output"规范：
- 输出格式要求（JSON schema）
- 摘要与详情分离
- Token 预算声明

工具开发者可以自行实现、自我认证。

**挑战**：需要生态认可，冷启动难。没有实际工具先行，标准难以获得关注。

### 6.4 推荐：A + B 组合

**短期（0-6 个月）**：
- 开发 Replacement Tools（方案 B）
- 在实际项目中验证效果
- 量化 context 节省比例
- 发布工具 + 论文/博客

**中期（6-12 个月）**：
- 推动主流平台支持 Middleware hook（方案 A）
- 将 Replacement Tools 改写为 Middleware 插件
- 减少用户迁移成本

**长期（12+ 个月）**：
- 基于实践经验，提炼 Protocol/Standard（方案 C）
- 推动生态采纳

---

## 7. 数据来源与参考链接

### Cline
- PR #7910 (COMMAND_BEST_PRACTICES): https://github.com/cline/cline/pull/7910
- Issue #5646 (429 Request too large): https://github.com/cline/cline/issues/5646
- Issue #4389: https://github.com/cline/cline/issues/4389
- Issue #6637 (JetBrains unusable): https://github.com/cline/cline/issues/6637
- Issue #6708 (terminal freeze): https://github.com/cline/cline/issues/6708

### Claude Code
- Issue #31279 (PostToolUse proposal): https://github.com/anthropics/claude-code/issues/31279
- Issue #28783 (truncation drops guardrails): https://github.com/anthropics/claude-code/issues/28783
- Issue #28863 (compress truncated): https://github.com/anthropics/claude-code/issues/28863

### Aider
- Repo Map 文档: https://aider.chat/docs/repomap.html

### OC / Crush
- OC Edit 源码: https://github.com/opencode-ai/opencode/blob/main/internal/llm/tools/edit.go
- OC View 源码: https://github.com/opencode-ai/opencode/blob/main/internal/llm/tools/view.go
- Crush (OC 继任者): https://github.com/charmbracelet/crush

---

## 附录：下一步行动

1. **量化实验**：在真实项目中测量各类工具输出的 token 消耗和有用信息比例
2. **原型开发**：先做 `air-test` 原型，验证测试输出优化的可行性
3. **社区参与**：在 Claude Code #31279 等 issue 中参与讨论，了解官方态度
4. **论文准备**：收集数据，准备问题定义和实验设计

---

*文档版本：v0.1 | 更新日期：2026-03-09*
