---
features:
  # ============================================
  # Core Package (@10iii/air-core)
  # ============================================

  # --- Compressors ---
  - id: F001
    title: Read Compressor
    summary: 文件内容压缩，支持 skeleton（函数签名）、focused（行范围）、truncate（智能截断）模式
    impl: [core/src/compressors/read.ts#ReadCompressor]
    tests: [core/src/__tests__/read.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F002
    title: Bash Compressor
    summary: 命令输出压缩，识别 npm/pnpm/yarn/git 等模式，移除进度条和噪音
    impl: [core/src/compressors/bash.ts#BashCompressor]
    tests: [core/src/__tests__/bash.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F003
    title: Grep Compressor
    summary: 搜索结果压缩，路径去重、上下文优化、文件分组
    impl: [core/src/compressors/grep.ts#GrepCompressor]
    tests: [core/src/__tests__/grep.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F004
    title: Test Compressor
    summary: 测试输出解析，支持 pytest/jest/vitest/go/cargo 多种测试框架
    impl: [core/src/compressors/test.ts#TestCompressor]
    tests: [core/src/__tests__/test.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F005
    title: Web Compressor
    summary: 网页内容提取，使用 Readability 算法提取正文，转换为 Markdown
    impl: [core/src/compressors/web.ts#WebCompressor]
    tests: [core/src/__tests__/web.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F006
    title: Ls Compressor
    summary: 目录列表压缩，树形结构展示，智能过滤 node_modules/dist 等
    impl: [core/src/compressors/ls.ts#LsCompressor]
    tests: [core/src/__tests__/ls.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F007
    title: Diff Compressor
    summary: Diff 输出压缩，支持 summary/compact/full 三级详略
    impl: [core/src/compressors/diff.ts#DiffCompressor]
    tests: [core/src/__tests__/diff.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F008
    title: Edit Compressor
    summary: 文件编辑辅助，search/replace 模式，支持模糊匹配
    impl: [archived/core-compressors/edit.ts#EditCompressor]
    tests: [core/src/__tests__/edit.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z
    deprecated_at: 2026-03-28T00:00:00Z
    deprecated_reason: Low usage, moved to archived/

  - id: F009
    title: Session Compressor
    summary: 会话历史压缩，支持 time-decay/tool-focused/balanced 策略
    impl: [archived/core-compressors/session.ts#SessionCompressor]
    tests: [core/src/__tests__/session.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z
    deprecated_at: 2026-03-28T00:00:00Z
    deprecated_reason: Low usage, moved to archived/

  - id: F010
    title: API Compressor
    summary: API 响应压缩，JSON 字段过滤、数组截断、深度限制
    impl: [core/src/compressors/api.ts#ApiCompressor]
    tests: [core/src/__tests__/api.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F011
    title: Search Compressor
    summary: 搜索结果压缩（用于 air search 输出的后处理）
    impl: [core/src/compressors/search.ts#SearchCompressor]
    tests: [core/src/__tests__/search.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F012
    title: Media Compressor
    summary: 媒体文件元数据提取和转写压缩（SRT/VTT/text 字幕）
    impl: [archived/core-compressors/media.ts#MediaCompressor]
    tests: [core/src/__tests__/media.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z
    deprecated_at: 2026-03-28T00:00:00Z
    deprecated_reason: Low usage, moved to archived/

  # --- Search ---
  - id: F020
    title: Search Aggregator
    summary: 多搜索引擎聚合，结果去重和排序
    impl: [core/src/search/aggregator.ts#SearchAggregator]
    tests: [core/src/__tests__/aggregator.test.ts]
    depends: [F021, F022, F023, F024, F025]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F021
    title: DuckDuckGo Engine
    summary: DuckDuckGo 搜索引擎适配器
    impl: [core/src/search/engines.ts#DuckDuckGoEngine]
    tests: [core/src/__tests__/engines.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F022
    title: Bing Engine
    summary: Bing 搜索引擎适配器（含 URL base64 解码）
    impl: [core/src/search/engines.ts#BingEngine]
    tests: [core/src/__tests__/engines.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F023
    title: Baidu Engine
    summary: 百度搜索引擎适配器（使用隐藏 JSON API）
    impl: [core/src/search/engines.ts#BaiduEngine]
    tests: [core/src/__tests__/engines.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F024
    title: Sogou Engine
    summary: 搜狗搜索引擎适配器
    impl: [core/src/search/engines.ts#SogouEngine]
    tests: [core/src/__tests__/engines.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F025
    title: AirFacts Engine
    summary: AIR Facts API 搜索引擎适配器（内部知识库）
    impl: [core/src/search/engines.ts#AirFactsEngine]
    tests: [core/src/__tests__/engines.test.ts]
    depends: []
    designed_at: 2026-03-24T00:00:00Z
    implemented_at: 2026-03-24T00:00:00Z
    tested_at: 2026-03-24T00:00:00Z

  - id: F026
    title: Region-based Engine Selection
    summary: 根据用户地区自动选择搜索引擎（中国/海外分流）
    impl: [core/src/search/engines.ts#getEnginesForRegion]
    tests: [core/src/__tests__/engines.test.ts]
    depends: [F021, F022, F023, F024]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  # --- Telemetry ---
  - id: F030
    title: Telemetry Client
    summary: 匿名使用统计收集（内容哈希、压缩率、元数据）
    impl: [core/src/telemetry/index.ts#TelemetryClient]
    tests: [core/src/__tests__/telemetry.test.ts]
    depends: [F031]
    designed_at: 2026-03-22T00:00:00Z
    implemented_at: 2026-03-22T00:00:00Z
    tested_at: 2026-03-22T00:00:00Z

  - id: F031
    title: Telemetry Config
    summary: 遥测配置管理（opt-in/opt-out）
    impl: [core/src/telemetry/config.ts#getTelemetryConfig, core/src/telemetry/config.ts#setTelemetryEnabled]
    tests: [core/src/__tests__/telemetry.test.ts]
    depends: []
    designed_at: 2026-03-22T00:00:00Z
    implemented_at: 2026-03-22T00:00:00Z
    tested_at: 2026-03-22T00:00:00Z

  # --- Parsers & Utils ---
  - id: F040
    title: Language Detection
    summary: 源代码语言检测和注释/导入行识别
    impl: [core/src/parsers/file.ts#detectLanguage, core/src/parsers/file.ts#isLineComment, core/src/parsers/file.ts#isImportLine]
    tests: [core/src/__tests__/read.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F041
    title: Token Estimation
    summary: Token 数量估算（用于压缩限制）
    impl: [core/src/utils/index.ts#estimateTokens]
    tests: [core/src/__tests__/read.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F042
    title: Tree-sitter Integration
    summary: 可选的 tree-sitter 语法解析支持（用于更精确的 skeleton 模式）
    impl: [core/src/parsers/tree-sitter.ts]
    tests: [core/src/__tests__/tree-sitter.test.ts]
    depends: [F001]
    designed_at: 2026-03-20T00:00:00Z
    implemented_at: null
    tested_at: null

  # ============================================
  # CLI Package (@10iii/air)
  # ============================================

  - id: F100
    title: CLI Entry
    summary: CLI 主入口，命令解析和路由
    impl: [cli/src/cli.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: []
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F101
    title: CLI Read Command
    summary: air read 命令实现
    impl: [cli/src/commands/read.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F001, F100]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F102
    title: CLI Bash Command
    summary: air bash 命令实现
    impl: [cli/src/commands/bash.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F002, F100]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F103
    title: CLI Grep Command
    summary: air grep 命令实现
    impl: [cli/src/commands/grep.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F003, F100]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F104
    title: CLI Test Command
    summary: air test 命令实现
    impl: [cli/src/commands/test.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F004, F100]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F105
    title: CLI Web Command
    summary: air web 命令实现
    impl: [cli/src/commands/web.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F005, F100]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F106
    title: CLI Ls Command
    summary: air ls 命令实现
    impl: [cli/src/commands/ls.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F006, F100]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F107
    title: CLI Diff Command
    summary: air diff 命令实现
    impl: [cli/src/commands/diff.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F007, F100]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F108
    title: CLI Edit Command
    summary: air edit 命令实现
    impl: [archived/cli-commands/edit.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F008, F100]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z
    deprecated_at: 2026-03-28T00:00:00Z
    deprecated_reason: Low usage, moved to archived/

  - id: F109
    title: CLI Session Command
    summary: air session 命令实现
    impl: [archived/cli-commands/session.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F009, F100]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z
    deprecated_at: 2026-03-28T00:00:00Z
    deprecated_reason: Low usage, moved to archived/

  - id: F110
    title: CLI API Command
    summary: air api 命令实现
    impl: [cli/src/commands/api.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F010, F100]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F111
    title: CLI Search Command
    summary: air search 命令实现
    impl: [cli/src/commands/search.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F020, F100]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  - id: F112
    title: CLI Media Command
    summary: air media 命令实现
    impl: [archived/cli-commands/media.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F012, F100]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z
    deprecated_at: 2026-03-28T00:00:00Z
    deprecated_reason: Low usage, moved to archived/

  - id: F113
    title: CLI Config Command
    summary: air config 命令实现（包括 telemetry opt-out）
    impl: [cli/src/commands/config.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F031, F100]
    designed_at: 2026-03-22T00:00:00Z
    implemented_at: 2026-03-22T00:00:00Z
    tested_at: 2026-03-22T00:00:00Z

  - id: F114
    title: CLI Init Command
    summary: air init 命令实现（项目初始化）
    impl: [cli/src/commands/init.ts]
    tests: [cli/src/__tests__/e2e.test.ts]
    depends: [F100]
    designed_at: 2026-03-14T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: 2026-03-16T00:00:00Z

  # ============================================
  # MCP Server Package (@10iii/air-mcp-server) - ARCHIVED
  # ============================================

  - id: F200
    title: MCP Server
    summary: MCP 协议服务器，暴露所有压缩器为 MCP tools（已归档，不再维护）
    impl: [archived/mcp-server/src/index.ts]
    tests: []
    depends: [F001, F002, F003, F004, F005, F006, F007, F008, F009, F010, F011, F012, F020]
    designed_at: 2026-03-16T00:00:00Z
    implemented_at: 2026-03-16T00:00:00Z
    tested_at: null
    deprecated: true

  # ============================================
  # OC Plugin Package (@10iii/air-oc-plugin)
  # ============================================

  - id: F300
    title: OpenCode Plugin
    summary: OpenCode 插件，通过 hook 系统拦截工具输出并压缩
    impl: [oc-plugin/src/index.ts]
    tests: [oc-plugin/src/__tests__/]
    depends: [F001, F002, F003, F004, F005, F006, F007, F008, F009, F010, F011, F012]
    designed_at: 2026-03-27T00:00:00Z
    implemented_at: 2026-03-28T00:00:00Z
    tested_at: 2026-03-28T00:00:00Z

  # ============================================
  # OpenClaw Plugin Package (@10iii/air-openclaw-plugin)
  # ============================================

  - id: F400
    title: OpenClaw Plugin Entry
    summary: OpenClaw 插件主入口，注册所有 hooks 和 tools
    impl: [openclaw-plugin/src/index.ts]
    tests: [openclaw-plugin/src/__tests__/]
    depends: [F401, F402, F403]
    designed_at: 2026-03-27T00:00:00Z
    implemented_at: 2026-03-28T00:00:00Z
    tested_at: 2026-03-28T00:00:00Z

  - id: F401
    title: OpenClaw Hooks
    summary: OpenClaw hook 处理器（tool_result_persist 输出压缩）
    impl: [openclaw-plugin/src/hooks.ts]
    tests: [openclaw-plugin/src/__tests__/]
    depends: [F403]
    designed_at: 2026-03-27T00:00:00Z
    implemented_at: 2026-03-28T00:00:00Z
    tested_at: 2026-03-28T00:00:00Z

  - id: F402
    title: OpenClaw Tools
    summary: OpenClaw tool 定义（air_* 工具集）
    impl: [openclaw-plugin/src/tools.ts]
    tests: [openclaw-plugin/src/__tests__/]
    depends: [F403]
    designed_at: 2026-03-27T00:00:00Z
    implemented_at: 2026-03-28T00:00:00Z
    tested_at: 2026-03-28T00:00:00Z

  - id: F403
    title: OpenClaw Compressor Wrapper
    summary: 统一的压缩器调用接口
    impl: [openclaw-plugin/src/compressor.ts]
    tests: [openclaw-plugin/src/__tests__/]
    depends: [F001, F002, F003, F004, F005, F006, F007, F008, F009, F010, F011, F012]
    designed_at: 2026-03-27T00:00:00Z
    implemented_at: 2026-03-28T00:00:00Z
    tested_at: 2026-03-28T00:00:00Z

  - id: F404
    title: OpenClaw State Management
    summary: 插件状态管理（启用/禁用、配置）
    impl: [openclaw-plugin/src/state.ts]
    tests: [openclaw-plugin/src/__tests__/]
    depends: []
    designed_at: 2026-03-27T00:00:00Z
    implemented_at: 2026-03-28T00:00:00Z
    tested_at: 2026-03-28T00:00:00Z

  # ============================================
  # Planned Features
  # ============================================

  - id: F500
    title: Direct Call Mode
    summary: 压缩器直接调用模式（绕过 stdin 管道）
    impl: []
    tests: []
    depends: [F001, F002, F003, F006, F007]
    designed_at: 2026-03-25T00:00:00Z
    implemented_at: 2026-03-25T00:00:00Z
    tested_at: null

  - id: F501
    title: P1 Direct Call (web/api/search)
    summary: Web/API/Search 压缩器的直接调用模式
    impl: []
    tests: []
    depends: [F500, F005, F010, F020]
    designed_at: null
    implemented_at: null
    tested_at: null

  # --- Dual-Source Search Merge (讨论于 2026-03-28) ---

  - id: F510
    title: Dual-Source Search Merge
    summary: |
      双源搜索合并：LLM 工具执行后，串行调用 AIR 免费引擎，
      结果聚合去重后返回。当 API key 耗尽时仍有结果。
    impl: []
    tests: []
    depends: [F020, F300, F400]
    designed_at: 2026-03-28T00:00:00Z
    implemented_at: null
    tested_at: null
    design_notes: |
      ## 核心架构（串行方案）
      - after-hook 触发时：
        1. 解析 LLM 工具（Exa/Tavily）返回的结果
        2. 串行调用 AIR 搜索引擎（DDG/Bing/Baidu/Sogou）
        3. 使用 SearchAggregator 合并去重
        4. 使用 SearchCompressor 压缩输出

      ## 优势
      - 无状态共享，单 hook 实现
      - 代码简单，调试容易
      - 延迟增加 ~2-3s（可接受）

      ## 容错设计
      - Exa 成功 + AIR 成功 → 合并去重
      - Exa 失败 + AIR 成功 → 纯 AIR 结果（关键！API key 耗尽时仍可用）
      - Exa 成功 + AIR 失败 → 纯 Exa 结果
      - 双失败 → 返回错误信息

      ## 工具名适配
      - OC: websearch_* 前缀匹配（MCP 桥接格式）
      - OpenClaw: web_search 固定名

  - id: F511
    title: AIR Search Core Function
    summary: 从 CLI 抽取可复用的搜索核心函数（async），供插件调用
    impl: [core/src/search/search.ts]
    tests: [core/src/__tests__/search-fn.test.ts]
    depends: [F020, F021, F022, F023, F024, F025]
    designed_at: 2026-03-28T00:00:00Z
    implemented_at: 2026-03-28T00:00:00Z
    tested_at: 2026-03-28T00:00:00Z
    design_notes: |
      ## 函数签名
      ```typescript
      export async function airSearch(
        query: string,
        options?: { maxResults?: number; timeout?: number }
      ): Promise<AirSearchResult>
      ```

      ## 返回类型
      ```typescript
      interface AirSearchResult {
        results: AggregatedResult[];
        successfulEngines: string[];
        failedEngines: string[];
        totalTimeMs: number;
      }
      ```

      ## 实现
      - 复用现有 getEngines() + SearchAggregator
      - 添加超时控制（默认 10s）
      - 返回聚合后的结果数组 + 元数据

  - id: F512
    title: OC Plugin Search Merge Hook
    summary: OpenCode 插件的双源搜索 after-hook 实现（串行）
    impl: [oc-plugin/src/search-merge.ts]
    tests: [oc-plugin/src/__tests__/search-merge.test.ts]
    depends: [F510, F511, F300]
    designed_at: 2026-03-28T00:00:00Z
    implemented_at: 2026-03-28T15:45:00Z
    tested_at: 2026-03-28T15:45:00Z
    design_notes: |
      ## 工具名匹配
      - 匹配 `websearch_*` 前缀（支持不同 MCP 服务商）
      - 当前已知: websearch_web_search_exa

      ## 输出解析
      - 尝试解析 Exa JSON 格式
      - 失败时视为空结果，继续用 AIR

      ## 实现细节
      - 串行调用 AIR 搜索（after-hook 内）
      - 合并 Exa + AIR 结果，URL 去重
      - 优雅降级：AIR 失败时仍返回 Exa 结果
      - 9 个测试全通过

  - id: F513
    title: OpenClaw Plugin Search Merge Hook
    summary: OpenClaw 插件的双源搜索 hook 实现（串行）
    impl: [openclaw-plugin/src/search-merge.ts, openclaw-plugin/src/hooks.ts]
    tests: [openclaw-plugin/src/__tests__/search-merge.test.ts]
    depends: [F510, F511, F400]
    designed_at: 2026-03-28T00:00:00Z
    implemented_at: 2026-03-28T16:25:00Z
    tested_at: 2026-03-28T16:25:00Z
    design_notes: |
      ## 工具名匹配
      - 固定匹配 `web_search`

      ## 与 OC 版本差异
      - 使用 tool_result_persist hook（而非 tool.execute.after）
      - Message 结构不同，需适配
      - hook handler 改为 async 以支持搜索合并

      ## 实现细节
      - 串行调用 AIR 搜索（hook 内部）
      - 合并 LLM + AIR 结果，URL 去重
      - 优雅降级：AIR 失败时返回 LLM-only 格式化结果
      - 10 个测试全通过（含集成测试）

  - id: F514
    title: Facts Upload on Web/Search Hooks
    summary: |
      在 webfetch/websearch after-hook 中，无论压缩是否生效，
      都将内容上传到 facts.airgo.dev 构建知识库。
    impl: [oc-plugin/src/index.ts, openclaw-plugin/src/hooks.ts]
    tests: []
    depends: [F300, F400]
    designed_at: 2026-03-28T00:00:00Z
    implemented_at: 2026-03-28T17:20:00Z
    tested_at: 2026-03-28T17:20:00Z
    design_notes: |
      ## 决策记录
      - 2026-03-28: 用户决定初期就做，不延后
      - CLI `air web` & `air search` 已与 facts.airgo.dev 全链路打通
      - 服务器端已在工作

      ## 核心原则
      **无论 AIR 压缩是否生效，都必须上传到 Facts**
      - 这是数据收集的核心逻辑，不依赖于压缩结果
      - AIR 压缩失败/跳过 ≠ 不上传
      - 只有明确的隐私过滤才能阻止上传

      ## 实现状态
      
      ### OC Plugin（已完成）
      - `uploadToFacts()` 函数：fire-and-forget 模式
      - 配置：`CONFIG.factsUploadEnabled` / `CONFIG.factsApiUrl`
      - 上传点：webfetch 压缩后 + 搜索合并/压缩后

      ### OpenClaw Plugin（已完成）
      - `uploadToFacts()` 函数：fire-and-forget 模式
      - 配置：`FACTS_UPLOAD_ENABLED` / `FACTS_API_URL` 
      - 上传点：搜索合并后 + 压缩后 + 未压缩时
      - 支持工具：web_search, browse, http

      ## 环境变量
      - `AIR_FACTS_UPLOAD=false` 可禁用上传（默认启用）

      ## 隐私考虑
      - 默认开启，可通过 AIR_FACTS_UPLOAD=false 关闭
      - 不上传敏感 URL（localhost, 内网 IP, file://）
      - README 明确声明数据收集行为

  - id: F520
    title: Facts Search API
    summary: |
      facts.airgo.dev/v1/search API：Agent 专用的知识库搜索，
      返回众包收集的高质量内容。
    impl: [air-facts-api/]
    tests: []
    depends: [F514]
    designed_at: 2026-03-28T00:00:00Z
    implemented_at: 2026-03-28T00:00:00Z
    tested_at: null
    design_notes: |
      ## 状态
      - 2026-03-28: 服务器端已在工作（Cloudflare Workers）
      - 配置文件：`packages/air-facts-api/wrangler.toml`

      ## API 设计
      GET /v1/search?q={query}&limit={n}
      
      Response:
      {
        "ok": true,
        "results": [
          {
            "url": "...",
            "title": "...",
            "snippet": "...",
            "source": "webfetch|websearch",
            "freshness": "2026-03-28",
            "confidence": 0.85
          }
        ],
        "total": 42,
        "query_time_ms": 12
      }

      ## 数据来源
      - 所有 AIR 用户的 webfetch/websearch 上传
      - 去重、质量评估、新鲜度打分

      ## 商业模型
      - 免费层：10 req/min，基础结果
      - 付费层：100+ req/min，优先队列

  # ============================================
  # Bug Fixes (B-series)
  # ============================================

  - id: B001
    title: GrepCompressor OC 格式支持
    summary: |
      修复 GrepCompressor 无法解析 OpenCode grep 输出格式，
      导致所有匹配结果被丢弃的 P0 级 Bug。
    impl: [core/src/compressors/grep.ts#GrepCompressor]
    tests: [core/src/__tests__/grep.test.ts]
    depends: [F003]
    designed_at: 2026-03-30T00:00:00Z
    implemented_at: 2026-03-30T22:45:00Z
    tested_at: 2026-03-30T22:45:00Z
    severity: P0
    design_notes: |
      ## 问题描述
      OC grep 工具输出格式与标准 grep 不同，GrepCompressor 无法解析：

      ### 标准 grep 格式（当前支持）
      ```
      /path/to/file.ts:42:  function foo() {
      /path/to/file.ts:43:    return bar;
      /path/to/file.ts:44:  }
      ```

      ### OpenCode grep 格式（需支持）
      ```
      Found 3 matches
      /path/to/file.ts:
        Line 42:   function foo() {
        Line 43:     return bar;
        Line 44:   }
      ```

      ## 根因分析
      - `parseGrepLine()` 函数期望 `/path:lineNum:content` 格式
      - OC 输出使用 `Found N matches` 头部 + 路径行 + `Line N: content` 格式
      - 解析失败导致所有匹配被丢弃，输出变成 "0 matches"

      ## 修复方案

      ### 1. 检测输出格式
      ```typescript
      function detectGrepFormat(output: string): 'standard' | 'opencode' {
        if (output.startsWith('Found ') && output.includes(' matches')) {
          return 'opencode';
        }
        return 'standard';
      }
      ```

      ### 2. OC 格式解析器
      ```typescript
      function parseOCGrepOutput(output: string): GrepMatch[] {
        const lines = output.split('\n');
        const matches: GrepMatch[] = [];
        let currentFile = '';

        for (const line of lines) {
          // 跳过 "Found N matches" 头部
          if (line.startsWith('Found ') && line.includes(' matches')) continue;

          // 文件路径行: "/path/to/file.ts:"
          if (line.endsWith(':') && !line.startsWith(' ')) {
            currentFile = line.slice(0, -1);
            continue;
          }

          // 匹配行: "  Line 42:   content"
          const match = line.match(/^\s+Line (\d+):\s*(.*)$/);
          if (match && currentFile) {
            matches.push({
              file: currentFile,
              line: parseInt(match[1], 10),
              content: match[2]
            });
          }
        }

        return matches;
      }
      ```

      ### 3. 整合到 GrepCompressor
      在 `compress()` 方法开始处检测格式，选择对应解析器。

      ## 测试计划
      - 添加 OC 格式测试用例（3+ cases）
      - 验证混合格式不会相互干扰
      - 验证 "Found 0 matches" 正确处理

  - id: B002
    title: LsCompressor/GlobCompressor 纯路径列表支持
    summary: |
      经验证 LsCompressor 已支持 path-list 格式，无需修复。
      OC 插件已正确将 glob 工具路由到 LsCompressor。
    impl: [core/src/compressors/ls.ts#LsCompressor]
    tests: [core/src/__tests__/ls.test.ts]
    depends: [F006]
    designed_at: 2026-03-30T00:00:00Z
    implemented_at: 2026-03-30T22:50:00Z
    tested_at: 2026-03-30T22:50:00Z
    severity: P0
    resolution: already-supported
    design_notes: |
      ## 验证结果（2026-03-30）
      
      经手动测试验证，LsCompressor 已经支持 path-list 格式：
      
      **输入**（OC glob 输出格式）：
      ```
      src/index.ts
      src/utils.ts
      src/types.ts
      package.json
      tsconfig.json
      ```
      
      **输出**（正确压缩为 tree 格式）：
      ```
      project/ (5 files, 1 dirs)
      ├── src/
      │   ├── index.ts
      │   ├── types.ts
      │   └── utils.ts
      ├── package.json
      └── tsconfig.json
      
      Types: .ts(3), .json(2)
      ```
      
      **元数据**：
      - detectedFormat: "path-list" ✅
      - totalFiles: 5 ✅
      - totalDirs: 1 ✅
      
      ## OC 插件路由
      `TOOL_COMPRESSOR_MAP` 已正确配置：
      ```typescript
      glob: () => getCompressor("LsCompressor"),
      ```
      
      ## 原报告问题可能原因
      测试报告中的问题可能是其他因素导致：
      1. 测试时使用的是旧版本
      2. OC glob 输出格式可能有变化
      3. 需要更多真实 OC 环境测试数据
      
      ## 结论
      标记为 already-supported，无需代码修改。

  - id: B003
    title: OC webfetch 双重 AIR marker + User-Agent 反爬虫
    summary: |
      修复 webfetch 拦截时的两个问题：
      1. WebCompressor 自带 "--- air:..." footer + 插件添加 "[AIR:...]" marker 导致双重标记
      2. fetch 请求使用 Node.js 默认 User-Agent，被部分网站反爬虫拦截
    impl: [oc-plugin/src/index.ts#interceptWebfetch, core/src/compressors/web.ts#WebOptions]
    tests: [core/src/__tests__/web.test.ts, oc-plugin/src/__tests__/index.test.ts]
    depends: [F005, F300]
    designed_at: 2026-03-31T07:00:00Z
    implemented_at: 2026-03-31T07:30:00Z
    tested_at: 2026-03-31T07:30:00Z
    severity: P2
    resolution: fixed
    design_notes: |
      ## 问题描述
      
      用户报告 webfetch 输出有双重 AIR marker：
      ```
      ... content ...
      --- air: 5000 chars → 2000 chars (60% saved) ---    ← WebCompressor footer
      [AIR: compressed 60% | air_off() for raw]            ← 插件 marker
      ```
      
      同时，部分网站因 User-Agent 检测拒绝请求。
      
      ## 修复方案
      
      ### 1. 添加 noStats 选项（WebCompressor）
      ```typescript
      // core/src/compressors/web.ts
      export interface WebOptions {
        // ... existing options
        /** Skip the stats footer (--- air: ... ---) for external callers */
        noStats?: boolean;
      }
      ```
      
      使用：`let includeStats = !opts.noStats;`
      
      ### 2. 插件传递 noStats: true
      ```typescript
      // oc-plugin/src/index.ts
      let result = compressor.compress(content, { url, noStats: true });
      ```
      
      ### 3. 添加 Chrome User-Agent
      ```typescript
      const CONFIG = {
        // ... existing config
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      };
      
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml,*/*",
          "User-Agent": CONFIG.userAgent,
        },
        // ...
      });
      ```
      
      ## 测试
      - 新增 `noStats` 选项单元测试
      - 872 个测试全通过

  - id: B004
    title: OC webfetch 增强反爬虫机制
    summary: |
      增强 webfetch 拦截器的反爬虫能力：
      1. 添加 Accept-Language 头
      2. 添加 Cloudflare 403 重试逻辑（用诚实 UA 重试）
      3. 优化 Accept 头格式（添加 q-value 优先级）
    impl: [oc-plugin/src/index.ts#interceptWebfetch, oc-plugin/src/index.ts#buildWebfetchHeaders]
    tests: [oc-plugin/src/__tests__/index.test.ts]
    depends: [B003, F300]
    designed_at: 2026-03-31T07:30:00Z
    implemented_at: 2026-03-31T07:40:00Z
    tested_at: 2026-03-31T07:40:00Z
    severity: P2
    resolution: fixed
    design_notes: |
      ## 背景

      分析 OpenCode 原生 webfetch 实现后，发现以下反爬虫机制：

      | 机制 | OC 实现 | AIR 之前状态 |
      |------|---------|--------------|
      | User-Agent | Chrome 143 | Chrome 131 (B003) |
      | Accept-Language | `en-US,en;q=0.9` | ❌ |
      | Accept Header | 动态优先级 | 固定 |
      | Cloudflare 重试 | 检测 `cf-mitigated` 后用诚实 UA | ❌ |

      ## 实现

      ### 1. 新增 buildWebfetchHeaders 函数
      ```typescript
      function buildWebfetchHeaders(useBrowserUA: boolean): Record<string, string> {
        return {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": CONFIG.acceptLanguage,
          "User-Agent": useBrowserUA ? CONFIG.userAgent : CONFIG.honestUserAgent,
        };
      }
      ```

      ### 2. Cloudflare 重试逻辑
      ```typescript
      let response = await fetch(url, {
        headers: buildWebfetchHeaders(true),
        signal: AbortSignal.timeout(60000),
      });

      // Cloudflare bot detection: TLS fingerprint doesn't match browser UA
      if (
        response.status === 403 &&
        response.headers.get("cf-mitigated") === "challenge"
      ) {
        response = await fetch(url, {
          headers: buildWebfetchHeaders(false),  // 使用诚实 UA
          signal: AbortSignal.timeout(60000),
        });
      }
      ```

      ### 3. 配置更新
      ```typescript
      const CONFIG = {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
        acceptLanguage: "en-US,en;q=0.9",
        honestUserAgent: "air-opencode-plugin/0.2",
      };
      ```

      ## 无法绕过的机制
      - Anubis PoW（kernel.org/codeberg.org）：需要浏览器环境
      - 结论：无法在 Node.js fetch 中实现

      ## 测试
      - 新增 7 个测试（Headers 配置 + Cloudflare 检测逻辑）
      - 879 个测试全通过
---

# AIR Product Requirements Document

> **DITA 方法论**：Design-Implementation-Test Alignment
> 
> 本文档是 AIR 项目的**单一真相源**，与 Features YAML 保持同步。

---

## 1. Product Vision

### 1.1 Problem Statement

AI Agent 在执行工具调用时，工具输出往往包含大量冗余信息（进度条、ANSI 颜色码、重复路径等），浪费宝贵的上下文窗口空间，导致：
- Token 消耗过高
- 上下文被早期压缩，Agent 丢失关键信息
- 长任务中断或质量下降

### 1.2 Target Users

- **AI Agent 框架开发者**：OpenCode、OpenClaw、Claude Code 等框架的维护者
- **Agent 用户**：使用 AI Agent 完成编码、调研等任务的开发者
- **CLI 用户**：需要清洁输出的命令行工具用户

### 1.3 Core Value Proposition

**AIR = AI-optimized Information Representation**

1. **压缩**：移除冗余，保留语义，减少 30-70% token 消耗
2. **零配置**：自动检测输出格式，智能选择压缩策略
3. **即插即用**：提供 OC/OpenClaw 插件，一行配置启用
4. **免费搜索**：聚合 DDG/Bing/Baidu/Sogou，不需要 API key

---

## 2. Architecture Overview

```
air/
├── packages/
│   ├── core/               # @10iii/air-core
│   │   ├── compressors/    # 12 个压缩器
│   │   ├── search/         # 多引擎搜索聚合
│   │   ├── telemetry/      # 匿名遥测
│   │   └── parsers/        # 语言检测/解析
│   ├── cli/                # @10iii/air
│   ├── oc-plugin/          # @10iii/air-oc-plugin
│   └── openclaw-plugin/    # @10iii/air-openclaw-plugin
├── archived/               # 归档代码
│   ├── mcp-server/         # [ARCHIVED] MCP Server
│   └── core-compressors/   # 低使用率压缩器
└── air-facts-api/          # Cloudflare Workers API
```

### 2.1 Tech Stack

- **Runtime**: Node.js 20+ / Bun
- **Language**: TypeScript 5.x (strict mode)
- **Testing**: Vitest
- **Build**: tsup
- **Monorepo**: pnpm workspaces

---

## 3. Modules

### 3.1 Core Compressors

核心压缩器集合，每个压缩器针对特定输出格式优化。

→ **Features**: F001-F012

**Key Design Decisions:**

| Decision | Rationale |
|----------|-----------|
| 使用 Readability 算法 (F005) | Mozilla 维护的成熟方案，正文提取准确率高 |
| skeleton 模式正则启发式 (F001) | 零依赖启动，tree-sitter 作为可选增强 |
| 归档 edit/session/media (F008/F009/F012) | 使用率低，简化核心包体积 |

---

### 3.2 Search System

多搜索引擎聚合，为 Agent 提供免费的网络搜索能力。

→ **Features**: F020-F026

**Key Design Decisions:**

| Decision | Rationale |
|----------|-----------|
| 禁止任何需 API key 的引擎 | 工具的工具不该让用户额外付费 |
| 中国/海外引擎分流 (F026) | DDG 在中国被墙，需要百度+搜狗替代 |
| AirFacts 引擎 (F025) | 众包知识库，补充搜索结果 |

---

### 3.3 CLI Interface

命令行工具，直接调用各压缩器和搜索功能。

→ **Features**: F100-F114

---

### 3.4 OpenCode Plugin

OpenCode 框架插件，通过 hook 系统自动压缩工具输出。

→ **Features**: F300, F512, F514

**Key Design Decisions:**

| Decision | Rationale |
|----------|-----------|
| tool.execute.after hook | 工具输出后压缩，用户可用 air_off() 禁用 |
| 双源搜索合并 (F512) | websearch 结果串行追加 AIR 免费引擎结果 |
| Facts 上传 (F514) | 无论压缩是否生效都上传，构建知识库 |

---

### 3.5 OpenClaw Plugin

OpenClaw 框架插件，功能与 OC 插件对等。

→ **Features**: F400-F404, F513, F514

---

### 3.6 [ARCHIVED] MCP Server ⛔

MCP (Model Context Protocol) 服务器，将压缩器暴露为 MCP tools。

**Current Status**: 归档，不再维护

→ **Features**: F200 (deprecated)

**Decision History:**

| Date | Decision | Impact | Reason |
|------|----------|--------|--------|
| 2026-03-16 | 设计并实现 | F200 created | MCP 是 Anthropic 推广的协议，预期会成为标准 |
| 2026-03-28 | 归档 | F200 deprecated, F300/F400 created | 1) 配置复杂 2) 多层协议开销大 3) 原生插件更简洁 |

---

## 4. Non-Functional Requirements

### 4.1 Performance

- 压缩延迟 < 100ms（1MB 输入）
- 搜索聚合超时 10s（可配置）

### 4.2 Compatibility

- Node.js 20+
- Bun 1.0+
- 支持 ESM 和 CJS

### 4.3 Privacy

- 默认开启匿名遥测，可 opt-out
- Facts 上传可通过环境变量禁用

---

## 5. Planned Features

→ **Features**: F042, F501, F510, F520

| Feature | Priority | Notes |
|---------|----------|-------|
| F042: Tree-sitter Integration | P2 | 可选增强 skeleton 精度 |
| F501: P1 Direct Call | P3 | web/api/search 直接调用模式 |
| F510: Dual-Source Search Merge | ✅ Done | F512/F513 已实现 |
| F520: Facts Search API | P1 | 服务器端已运行 |

---

## 6. Change History

> 按时间倒序记录重大变更。

### 2026-03-31

- **B003 B004**: webfetch 双重 marker + 反爬虫增强
  - Decision: 增强反爬虫能力，但接受 Anubis PoW 无法绕过的限制
  - Impact: OC 插件更新，879 测试通过
  - Reason: 提高网页抓取成功率

### 2026-03-30

- **B001**: GrepCompressor 支持 OC 格式
  - Decision: 添加 OC grep 输出格式解析器
  - Impact: B001 fixed, 7 个新测试
  - Reason: OC grep 输出格式与标准 grep 不同

- **B002**: LsCompressor path-list 格式验证
  - Decision: 无需修复，已支持
  - Impact: B002 closed as already-supported
  - Reason: 测试验证 LsCompressor 已能处理 OC glob 输出

### 2026-03-29

- **Code Review 修复**
  - Decision: 修复多个代码质量问题
  - Impact: airSearch 超时内存泄漏修复，错误日志增强
  - Reason: 提高代码健壮性

### 2026-03-28

- **F200 归档**: MCP Server 停止维护
  - Decision: 归档而非删除，保留代码供未来参考
  - Impact: F200 deprecated, mcp-server 包停止发布
  - Reason: OC/OpenClaw 原生插件更符合实际需求

- **F510-F514**: 双源搜索合并 + Facts 上传
  - Decision: 串行方案 + 初期即做 Facts
  - Impact: 新增 F510-F514
  - Reason: 简化实现，延迟增加可接受

- **低使用率功能归档**
  - Decision: 归档 edit/session/media 压缩器
  - Impact: F008/F009/F012 deprecated
  - Reason: 减少维护负担，保持核心精简

---

## 7. Status Legend

| 状态 | 判断规则 |
|------|----------|
| draft | 三个时间戳都为 null |
| designed | designed_at 是最新的时间戳 |
| implemented | implemented_at 是最新的时间戳 |
| tested | tested_at 是最新的时间戳 |
| deprecated | deprecated: true |

---

## 8. Feature ID Ranges

| Range | Module | Notes |
|-------|--------|-------|
| F001-F012 | core/compressors | 压缩器（部分已归档） |
| F020-F026 | core/search | 搜索引擎聚合 |
| F030-F031 | core/telemetry | 遥测 |
| F040-F042 | core/parsers | 解析器 |
| F100-F114 | cli | 命令行命令（部分已归档） |
| F200 | mcp-server | [ARCHIVED] |
| F300 | oc-plugin | OpenCode 插件主入口 |
| F400-F404 | openclaw-plugin | OpenClaw 插件 |
| F510-F514 | 双源搜索 | 搜索合并 + Facts |
| F520+ | facts-api | 知识库 API |
| B001+ | bug fixes | Bug 修复 |

---

## 9. Notes

- 当前版本：0.2.16
- 测试数量：879（全绿）
- F042 (Tree-sitter) 设计中，等待需求驱动
- Facts API 服务器已在 Cloudflare Workers 运行

---

(End of file)
