# AIR Tool Inventory - AI 工具内建工具调研

> 调研日期：2026-03-09
> 调研目的：为 AIR (AI eRgonomics) 项目识别各 AI coding/agent 工具的内建系统工具，评估上下文浪费程度和 AIR 替代价值。

## 调研方法

- **源码分析**：通过 GitHub 搜索 anthropics/claude-code, openclaw/openclaw, sst/opencode, RooCodeInc/Roo-Code 等仓库的工具定义代码
- **官方文档**：Anthropic 官方文档、Roo Code 文档站 (docs.roocode.com)、Aider 官方文档 (aider.chat)
- **架构分析**：OpenClaw 架构深度分析文章（enricopiovano.com）
- **系统提示词**：Claude Code Action 源码中的 allowedTools 列表、Cursor 社区泄露的 system prompt
- **直接观察**：OpenCode 工具清单来自当前运行环境的系统提示词

---

## 1. Claude Code (Anthropic)

**产品类型**：终端/IDE/桌面/Web AI 编程助手
**信息来源**：anthropics/claude-code 仓库源码 + 官方文档

### 工具列表

| 工具名 | 功能 | 输出浪费 | AIR替代价值 | 说明 |
|---|---|---|---|---|
| **Read** | 读取文件内容 | Y - 行号前缀 `N: content`，每行增加 ~5-8 字符 | **H** | 行号前缀占输出 ~15-25%。对 2000 行文件，行号本身消耗 ~10K 字符。AI 大多数时候不需要行号 |
| **Write** | 写入/创建文件 | N - 输入工具，无输出浪费 | L | 写入操作本身不产生冗余输出 |
| **Edit** | 基于 LINE#ID 的精确编辑 | Y - 需要先 Read 获取 LINE#ID 标签 | **H** | LINE#ID 格式 (`123#ZP`) 增加每行 ~6 字符。且编辑前必须先 Read，双重消耗 |
| **MultiEdit** | 批量编辑（同文件多处修改） | 同 Edit | **H** | 同 Edit，但支持批量减少了来回次数 |
| **Bash** | 执行 shell 命令 | Y - 原始命令输出，经常包含大量噪音 | **H** | 命令输出无截断/智能摘要。`npm install` 输出上百行进度条、`git log` 输出完整 diff，大量噪音 |
| **Glob** | 文件模式匹配搜索 | M - 返回完整文件路径列表 | M | 路径列表相对精简，但大项目可能返回数百条路径 |
| **Grep** | 文件内容正则搜索 | Y - 返回匹配行+上下文+文件路径 | **H** | 搜索结果包含完整文件路径重复、行号前缀、上下文行（可能是噪音） |
| **LS** | 列出目录内容 | M - 目录条目列表 | M | 条目较多时冗长，但结构化程度尚可 |
| **WebFetch** | 获取网页内容 | Y - 网页转 markdown，大量无关内容 | **H** | 网页包含导航栏、页脚、广告等噪音，有用信息可能仅占 10-30% |
| **WebSearch** | 网络搜索 | M - 搜索结果摘要 | M | 摘要相对精简，但可能包含不相关结果 |
| **NotebookRead** | 读取 Jupyter notebook | Y - cell 元数据、输出等冗余 | M | Notebook 格式本身有大量元数据 |
| **TodoWrite** | 管理任务列表 | N - 输入工具 | L | 无输出浪费 |
| **BashOutput** | 获取后台 Bash 输出 | Y - 同 Bash | **H** | 同 Bash 的输出问题 |
| **KillShell** | 终止 shell 进程 | N - 控制工具 | L | 无输出浪费 |

### 关键发现
- **最大浪费点**：Read 工具的行号前缀系统 + Edit 的 LINE#ID 标签。每次文件读取都在每行添加 `N#XX: ` 前缀（~6-8字符/行），2000行文件额外消耗 ~12K-16K 字符
- **Bash 输出无智能处理**：命令输出原样返回，无截断、过滤或摘要
- **编辑模型依赖 Read**：Edit/MultiEdit 需要先 Read 获取 LINE#ID，两步操作双重消耗上下文
- Claude Code 有输出截断机制（超过 2000 行写入文件），但截断前的数据仍全量进入上下文

---

## 2. OpenCode (sst/opencode, by Dax Raad)

**产品类型**：开源终端 AI coding agent（Go 实现）
**信息来源**：当前运行环境系统提示词直接观察 + GitHub 仓库

### 工具列表

| 工具名 | 功能 | 输出浪费 | AIR替代价值 | 说明 |
|---|---|---|---|---|
| **Read** | 读取文件/目录（默认 2000 行） | Y - `N: content` 行号前缀 | **H** | 与 Claude Code 相同的行号前缀问题。每行 ~5-8 字符开销 |
| **Write** | 写入/覆盖文件 | N | L | 要求先 Read 再 Write（安全机制），间接增加上下文 |
| **Edit** | LINE#ID 精确编辑 | Y - 依赖 Read 的 LINE#ID | **H** | 与 Claude Code 同源设计。LINE#ID (`123#ZP`) 增加每行 ~6 字符 |
| **Bash** | 执行 shell 命令 | Y - 原始输出，超 2000行/51200字节截断 | **H** | 截断阈值较高，大量命令输出在截断前已消耗大量上下文 |
| **Glob** | 文件模式搜索（100文件上限） | M - 文件路径列表 | M | 有 100 文件安全限制，相对可控 |
| **Grep** | 正则内容搜索（256KB输出上限） | Y - 匹配行+文件路径 | **H** | 256KB 上限仍然很大。三种模式：content/files/count |
| **LSP 工具组** | 代码语义操作 | M | M | |
| ├ lsp_goto_definition | 跳转到定义 | M - 返回位置信息 | L | 输出精简 |
| ├ lsp_find_references | 查找所有引用 | Y - 可能返回大量引用位置 | M | 大项目中引用数量可能很多 |
| ├ lsp_symbols | 获取文件/工作区符号 | M - 符号列表 | M | 结构化输出，但大文件可能很长 |
| ├ lsp_diagnostics | 获取诊断信息 | M - 错误/警告列表 | L | 通常输出精简 |
| ├ lsp_prepare_rename | 重命名预检 | N - 简短验证结果 | L | 非常精简 |
| └ lsp_rename | 工作区重命名 | M - 影响的文件列表 | L | 输出变更摘要 |
| **ast_grep_search** | AST 感知模式搜索 | Y - 匹配结果+上下文 | M | 比 Grep 更精准但输出格式类似 |
| **ast_grep_replace** | AST 感知替换 | M - dry-run 差异 | M | 支持 dry-run，输出可控 |
| **WebFetch** | 获取网页内容 | Y - 转 markdown | **H** | 同 Claude Code 问题 |
| **TodoWrite** | 任务管理 | N | L | 输入工具 |
| **Context 工具组** | 上下文管理 | | | |
| ├ context_stats | 上下文统计 | N - 简短统计 | L | OC 特有，非常精简 |
| └ context_slim | 上下文精简 | N - 操作确认 | L | OC 特有，用于主动管理上下文 |
| **DB 工具组** | 数据库操作 | | | |
| ├ db_query | SQL 查询 | M - 表格结果 | L | 项目特定插件 |
| ├ db_exec | SQL 写入 | N | L | 项目特定插件 |
| └ db_log | 快捷日志写入 | N | L | 项目特定插件 |
| **Agent 调度** | 子代理系统 | | | |
| ├ call_omo_agent | 调用子代理 | Y - 子代理完整输出 | M | 子代理输出可能很长 |
| ├ background_output | 获取后台任务输出 | Y - 同上 | M | |
| └ background_cancel | 取消后台任务 | N | L | |
| **Session 工具组** | 会话管理 | | | |
| ├ session_list | 列出会话 | M | L | |
| ├ session_read | 读取会话历史 | Y - 完整消息历史 | M | |
| ├ session_search | 搜索会话内容 | M | L | |
| └ session_info | 会话元数据 | N | L | |
| **look_at** | 分析媒体文件 | M - 分析结果 | L | |
| **interactive_bash** | tmux 交互终端 | N - 控制工具 | L | |
| **grep_app_searchGitHub** | GitHub 代码搜索 | Y - 匹配片段+仓库信息 | M | 外部搜索结果 |
| **websearch_web_search_exa** | 网络搜索 (Exa) | Y - 搜索结果+摘要 | M | |
| **context7 工具组** | 文档查询 | | | |
| ├ context7_resolve-library-id | 解析库 ID | M | L | |
| └ context7_query-docs | 查询文档 | Y - 文档片段 | M | |
| **skill** | 加载技能指令 | M - 指令文本 | L | |

### 关键发现
- **与 Claude Code 共享核心设计**：Read/Edit/Bash 的输出格式几乎相同（行号前缀、LINE#ID 系统）
- **工具数量膨胀**：内建 30+ 工具，系统提示词中工具定义本身占用大量上下文（估算 ~8K-15K tokens）
- **独有优势**：context_stats/context_slim 是主动上下文管理工具，AIR 理念的先驱
- **子代理系统**：通过 call_omo_agent 委派任务可以节省主会话上下文，但子代理输出返回时仍然全量

---

## 3. Cursor

**产品类型**：AI IDE（VS Code fork）
**信息来源**：社区泄露 system prompt + 官方文档 + 用户行为观察

### 工具列表

| 工具名 | 功能 | 输出浪费 | AIR替代价值 | 说明 |
|---|---|---|---|---|
| **codebase_search** | 语义代码库搜索 | M - 返回匹配代码片段 | M | 语义搜索较精准，但仍返回完整代码块 |
| **read_file** | 读取文件内容 | Y - 行号前缀，支持行范围 | **H** | 同样的行号前缀问题。支持 start_line/end_line 范围读取有助于减少浪费 |
| **list_dir** | 列出目录内容 | M - 文件/目录列表 | M | 相对精简 |
| **grep_search** | 正则文件搜索 | Y - 匹配行+上下文 | **H** | 同其他工具的 grep 问题 |
| **file_search** | 模糊文件名搜索 | M - 文件路径列表 | M | 相对精简 |
| **edit_file** | 编辑文件（search/replace 或生成） | M - 确认信息 | M | Cursor 的编辑不需要先读取行号标签，直接 search/replace |
| **run_terminal_command** | 执行终端命令 | Y - 原始命令输出 | **H** | 同其他产品的 Bash 输出问题 |
| **delete_file** | 删除文件 | N | L | |
| **reapply** | 重新应用上次编辑 | N | L | Cursor 特有的重试机制 |
| **parallel_apply** | 并行应用多文件编辑 | M | M | 减少串行编辑的上下文消耗 |
| **create_file** | 创建新文件 | N | L | |

### 关键发现
- **编辑优于 Claude Code**：Cursor 的 edit_file 使用 search/replace 或整块生成，不依赖行号标签系统，减少了一轮 Read + 行号标签的上下文消耗
- **IDE 集成优势**：codebase_search 利用 IDE 索引进行语义搜索，比纯文本 grep 更精准、输出更少噪音
- **range read 支持**：read_file 支持 start_line/end_line，可以只读取需要的部分
- **命令输出仍是痛点**：run_terminal_command 的输出与其他产品一样缺少智能处理

---

## 4. Aider

**产品类型**：开源终端 AI pair programmer (Python 实现)
**信息来源**：aider.chat 官方文档 + GitHub 仓库

### 架构说明
Aider 与其他产品**架构根本不同**——它不使用「工具调用」(tool_use) API。它通过「编辑格式」(edit formats) 让 LLM 在自然语言回复中直接输出代码变更，由 Aider 的 Python 代码解析并应用。

### "工具" 等价物

| 等价功能 | 实现方式 | 输出浪费 | AIR替代价值 | 说明 |
|---|---|---|---|---|
| **文件读取** | 自动将 /add 的文件全文注入上下文 | **Y - 整文件注入** | **H** | 没有按需读取——一次性把所有 /add 的文件全量放入上下文。这是最大的浪费来源 |
| **repo-map** | tree-sitter 生成的代码库结构图 | Y - 占用固定 token 预算 | M | 默认 1024 tokens，提供仓库结构感知。精巧但仍占上下文 |
| **代码编辑** | 5种 edit format: whole, diff, diff-fenced, udiff, search/replace | 各有不同 | **H** | `whole` 格式要求 LLM 输出整个文件（极度浪费），`diff` 格式高效但 LLM 可能出错 |
| **Shell 执行** | /run 命令 | Y - 原始输出注入上下文 | **H** | 命令输出直接进入聊天上下文 |
| **Git 操作** | 自动 git commit | N | L | 自动提交变更，不消耗上下文 |
| **Lint/Test** | /lint, /test 命令 | Y - 错误输出注入上下文 | M | 输出会注入上下文供 AI 修复 |
| **Web 内容** | URL 自动获取 | Y - 网页转文本 | M | 与其他工具类似的问题 |
| **Voice** | 语音输入 | N | L | 输入方式，不影响输出 |

### 关键发现
- **最大差异**：Aider 不使用 tool_use API，所有文件内容以 system message 形式全量注入
- **whole 编辑格式最浪费**：要求 LLM 输出完整文件，即使只改一行也要输出全部内容
- **无按需文件读取**：一旦 /add 文件，该文件全量常驻上下文直到 /drop。无法只读部分
- **repo-map 是亮点**：用 tree-sitter 生成紧凑的代码结构图，用 ~1024 tokens 提供全局视野。这个思路值得 AIR 借鉴
- **diff 格式的 search/replace 设计**：`<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE` 是 search/replace 编辑的优秀设计，无需行号

---

## 5. Cline / Roo Code

**产品类型**：VS Code 插件（Roo Code 是 Cline 的增强 fork）
**信息来源**：docs.roocode.com 官方文档 + GitHub 仓库 + 源码

### 工具列表

| 工具名 | 功能 | 输出浪费 | AIR替代价值 | 说明 |
|---|---|---|---|---|
| **read_file** | 读取文件内容（带行号） | Y - 行号前缀 | **H** | 与 Claude Code/OpenCode 相同的行号前缀问题 |
| **search_files** | 正则搜索文件内容 | Y - 匹配行+路径+上下文 | **H** | 大项目搜索结果可能很长 |
| **list_files** | 列出目录文件 | M - 文件列表 | M | |
| **codebase_search** | 语义代码搜索 | M - 语义匹配结果 | M | 利用 VS Code 索引 |
| **read_command_output** | 读取被截断的命令输出 | Y - 可能很长 | M | 用于获取被截断的完整输出 |
| **write_to_file** | 创建/覆盖文件 | N | L | |
| **apply_diff** | 精确代码编辑 (diff) | M - 确认信息 | M | 比整文件重写高效 |
| **apply_patch** | 多文件 unified diff | M | M | 支持多文件批量修改 |
| **edit** | search/replace（首次匹配） | M | M | |
| **edit_file** | search/replace（所有匹配+计数验证） | M | M | |
| **search_replace** | 简单 search/replace | M | L | |
| **execute_command** | 执行终端命令 | Y - 原始命令输出 | **H** | 同其他产品 Bash 问题 |
| **generate_image** | AI 图像生成 | N | L | 特色功能 |
| **ask_followup_question** | 向用户提问 | N | L | 工作流工具 |
| **attempt_completion** | 标记任务完成 | N | L | 工作流工具 |
| **switch_mode** | 切换操作模式 | N | L | 工作流工具 |
| **new_task** | 创建子任务 | N | L | Boomerang Tasks |
| **update_todo_list** | 更新任务清单 | N | L | |
| **skill** | 加载预定义技能 | M | L | |
| **use_mcp_tool** | 使用 MCP 外部工具 | M - 取决于 MCP 工具 | M | MCP 扩展点 |
| **access_mcp_resource** | 访问 MCP 资源 | M - 取决于资源 | M | |
| **run_slash_command** | 执行预定义命令模板 | M | L | 实验性功能 |

### 关键发现
- **编辑工具过多**：6种编辑工具 (write_to_file, apply_diff, apply_patch, edit, edit_file, search_replace)，工具定义本身占用大量上下文
- **read_file 行号问题**：与 Claude Code 相同的行号前缀开销
- **模式系统（Modes）是亮点**：Code/Ask/Architect 模式根据任务类型限制可用工具，减少工具定义占用的上下文
- **MCP 扩展**：通过 MCP 协议支持无限外部工具扩展，但每个 MCP 工具的定义也消耗上下文

---

## 6. OpenClaw (Peter Steinberger)

**产品类型**：自主 AI agent 框架（TypeScript，通过 WhatsApp/Telegram 控制）
**信息来源**：openclaw/openclaw GitHub 源码 (tool-catalog.ts, pi-tools.ts) + 架构分析文章

### 工具列表

| 工具名 | 功能 | 输出浪费 | AIR替代价值 | 说明 |
|---|---|---|---|---|
| **read** | 读取文件内容（文本/二进制） | Y - 全文件内容 | M | 通用 agent 场景，文件可能很大 |
| **write** | 创建/覆盖文件 | N | L | |
| **edit** | 语义 diff 编辑 (apply_patch) | M | M | |
| **exec** | Shell 执行（PTY 支持） | Y - 原始命令输出 | **H** | 与 coding 工具相同的输出问题，但 OpenClaw 还执行系统管理命令 |
| **process** | 后台进程管理 | M | L | |
| **cd** | 改变工作目录 | N | L | |
| **browser.action** | 浏览器自动化（点击/输入/导航） | M | M | |
| **browser.snapshot** | 浏览器截图 | Y - 图像数据 | M | 视觉模型消耗大量 token |
| **canvas.push** | 发送 A2UI 渲染内容 | N | L | OpenClaw 特色 |
| **canvas.reset** | 清除画布 | N | L | |
| **canvas.eval** | 画布执行 JavaScript | M | L | |
| **canvas.snapshot** | 画布截图 | M | L | |
| **send** | 路由消息到频道 | N | L | 消息平台工具 |
| **camera.snap** | 拍照（移动设备） | M | L | IoT/移动工具 |
| **screen.record** | 屏幕录制 | M | L | |
| **location.get** | 获取 GPS 位置 | N | L | |
| **notify** | 发送推送通知 | N | L | |

### 关键发现
- **非 coding 专用**：工具集面向通用 AI agent（文件操作 + shell + 浏览器 + 消息平台 + 设备控制），与 coding 工具有本质区别
- **上下文管理是核心挑战**：OpenClaw 使用自动 compaction 机制——上下文满时先写重要信息到持久文件，再裁剪旧对话
- **Docker 沙箱**：exec 工具有 Docker 沙箱隔离，安全但不影响上下文效率
- **AIR 相关性较低**：OpenClaw 的工具集与 coding 场景重叠有限，但其 compaction 和记忆架构思路值得参考

---

## 7. Windsurf / Cascade

**产品类型**：AI IDE（VS Code fork，原 Codeium，现属 Cognition AI）
**信息来源**：官方文档 (windsurf.com/cascade) + 评测文章 + 社区信息

### 工具列表

| 工具名 | 功能 | 输出浪费 | AIR替代价值 | 说明 |
|---|---|---|---|---|
| **read_file** | 读取文件内容 | Y - 行号前缀 | **H** | 与其他 coding 工具相同问题 |
| **write_file** | 写入文件 | N | L | |
| **edit_file** | 编辑文件（多种模式） | M | M | |
| **search** | 代码搜索（语义+文本） | Y - 匹配结果 | M | Windsurf 的搜索利用全项目索引 |
| **run_command** | 执行终端命令 | Y - 原始输出 | **H** | 同其他产品 |
| **list_directory** | 目录列表 | M | M | |
| **create_file** | 创建新文件 | N | L | |
| **delete_file** | 删除文件 | N | L | |

### 关键发现
- **Flow Awareness 是亮点**：Cascade 追踪用户的所有操作（编辑、命令、剪贴板、终端），自动推断意图，减少显式上下文注入
- **工具集与 Cursor 高度相似**：核心工具功能几乎相同
- **闭源限制**：具体工具实现细节不公开，输出格式无法确认
- **全项目索引**：声称比 Cursor 的代码库索引更快更可靠（500+文件项目）

---

## 8. 综合分析

### 跨产品通用工具（所有/大多数产品都有的核心工具）

| 功能类别 | 通用工具名 | 出现率 | 上下文浪费严重度 |
|---|---|---|---|
| **文件读取** | Read/read_file | 7/7 (100%) | 🔴 高 - 行号前缀是行业通病 |
| **文件写入** | Write/write_to_file | 7/7 (100%) | 🟢 低 |
| **文件编辑** | Edit/edit_file/apply_diff | 7/7 (100%) | 🟡 中-高 (取决于实现) |
| **Shell 执行** | Bash/execute_command | 7/7 (100%) | 🔴 高 - 命令输出无智能处理 |
| **文件搜索** | Grep/search_files | 7/7 (100%) | 🔴 高 - 搜索结果冗长 |
| **目录列表** | LS/list_files/list_dir | 6/7 (86%) | 🟡 中 |
| **模式搜索** | Glob/file_search | 5/7 (71%) | 🟡 中 |
| **语义搜索** | codebase_search | 3/7 (43%) | 🟡 中 (比 grep 精准) |

### 最高替代价值工具 TOP 5

| 排名 | 工具功能 | 痛点 | 估算浪费比例 | AIR 替代方案方向 |
|---|---|---|---|---|
| **#1** | **文件读取 (Read)** | 行号前缀每行+5-8字符；LINE#ID 标签每行+6字符；整文件读取无法按需 | **15-30%** 输出是行号/标签开销 | 无行号读取 + 按需区间读取 + 智能摘要 |
| **#2** | **Shell 执行 (Bash)** | 命令输出原样返回，含进度条/ANSI码/重复日志/构建噪音 | **30-80%** 输出是噪音 (取决于命令) | 命令输出智能过滤/摘要/结构化提取 |
| **#3** | **文件搜索 (Grep)** | 每个匹配返回完整路径+行号+上下文行，路径重复 | **20-40%** 是重复路径和无关上下文 | 去重路径 + 精简上下文 + 结果分组 |
| **#4** | **文件编辑 (Edit)** | 依赖先 Read（双重消耗）；LINE#ID 系统增加标签开销 | **间接浪费**：编辑前必须 Read | 免读取直接编辑 (search/replace) 或语义编辑 |
| **#5** | **网页获取 (WebFetch)** | 网页转 markdown 包含大量导航/页脚/广告噪音 | **50-80%** 是网页噪音 | 智能内容提取，只保留正文 |

### AIR 工具清单建议

基于调研，AIR 应优先构建以下替代工具：

#### Tier 1 - 必须有（最高 ROI）

| AIR 工具 | 替代的传统工具 | 核心创新 |
|---|---|---|
| **air-read** | Read/read_file | 无行号前缀 + 智能区间 + 结构感知摘要（对大文件返回结构概览而非全文） |
| **air-bash** | Bash/execute_command | 命令输出智能过滤：去 ANSI 码、压缩重复行、提取错误/关键信息、可配置详细度 |
| **air-edit** | Edit/edit_file | 免前置 Read 的直接编辑：search/replace 模式（参考 Aider 的 diff 格式设计） |
| **air-grep** | Grep/search_files | 结果去重分组 + 路径压缩 + 可配置上下文行数 + 匹配计数摘要 |

#### Tier 2 - 应该有（中等 ROI）

| AIR 工具 | 替代的传统工具 | 核心创新 |
|---|---|---|
| **air-web** | WebFetch/web_search | 网页正文智能提取（去导航/页脚/广告）+ 内容密度评分 |
| **air-ls** | LS/list_files/list_dir | tree 风格紧凑输出 + 可配置深度 + 文件类型分组 |
| **air-context** | (无直接对应) | 主动上下文预算管理（参考 OpenCode 的 context_stats/slim 和 OpenClaw 的 compaction） |

#### Tier 3 - 可选（低 ROI 但有差异化）

| AIR 工具 | 替代的传统工具 | 核心创新 |
|---|---|---|
| **air-repomap** | (参考 Aider repo-map) | 代码库结构感知图，用 ~1K tokens 提供全局视野（Aider 验证有效的思路） |
| **air-diff** | (无直接对应) | 智能变更摘要：对 git diff 输出进行压缩和结构化 |

### 行业现状总结

1. **行号前缀是行业通病**：几乎所有 coding 工具都给文件读取输出添加行号前缀，这是为了让 AI 能精确引用位置，但代价是 15-30% 的上下文浪费
2. **命令输出是最大黑洞**：所有工具都将 Shell 命令输出原样传回，没有任何智能处理。一个 `npm install` 可能产生 200+ 行输出，其中 90% 是进度条和依赖树
3. **编辑策略分两派**：
   - **行号标签派** (Claude Code, OpenCode)：Read→获取行号标签→Edit 引用标签。精确但两步消耗
   - **Search/Replace 派** (Cursor, Aider, Roo Code)：直接用文本匹配定位编辑位置。一步到位但可能匹配错误
4. **工具定义本身的开销被忽视**：30+ 工具的系统提示词中，工具定义（名称+描述+参数 schema）可能占 8K-15K tokens，这是隐藏的上下文成本
5. **Aider 的 repo-map 是唯一真正创新**：用 tree-sitter 生成紧凑代码结构图，1K tokens 提供全局代码库感知，是最高效的上下文利用方式
