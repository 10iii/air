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
---

# AIR Features

> **DITA 方法论**：Design-Implementation-Test Alignment
> 
> AI-optimized Information Representation 项目特性追踪表

## Status Legend

| 状态 | 判断规则 |
|------|----------|
| draft | 三个时间戳都为 null |
| designed | designed_at 是最新的时间戳 |
| implemented | implemented_at 是最新的时间戳 |
| tested | tested_at 是最新的时间戳 |
| deprecated | deprecated: true |

## Package Overview

```
air/
├── packages/
│   ├── core/           # @10iii/air-core (F001-F042)
│   │   ├── compressors/  # 12 个压缩器
│   │   ├── search/       # 搜索引擎聚合
│   │   ├── telemetry/    # 遥测
│   │   └── parsers/      # 解析器
│   ├── cli/            # @10iii/air (F100-F114)
│   ├── oc-plugin/      # @10iii/air-oc-plugin (F300)
│   └── openclaw-plugin/# @10iii/air-openclaw-plugin (F400-F404)
├── archived/           # 归档（不再维护）
│   └── mcp-server/     # @10iii/air-mcp-server (F200) - deprecated
```

## Feature ID Ranges

| Range | Package |
|-------|---------|
| F001-F042 | core (compressors, search, telemetry, parsers) |
| F100-F114 | cli (commands) |
| F200 | mcp-server (archived) |
| F300 | oc-plugin |
| F400-F404 | openclaw-plugin |
| F500+ | planned features |

## Change Log

| Date | Change |
|------|--------|
| 2026-03-28 | 归档 MCP Server，不再开发和发布 |
| 2026-03-28 | 初始化 FEATURES.md，记录 50+ 功能点 |

## Notes

- F042 (Tree-sitter Integration) 为 draft 状态，设计中
- F200 (MCP Server) **已归档，不再维护**（代码在 archived/mcp-server/）
- F500-F501 为计划中的功能
