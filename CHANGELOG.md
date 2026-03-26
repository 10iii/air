# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-03-26

### Added
- `air init` command to inject AIR usage guide into AI agent configuration files
- MCP Registry server.json and automated publish workflow
- Region detection and telemetry module
- AIR Facts API service for crowdsourced compression statistics
- LLM-first help system for CLI

### Changed
- Help output optimized for AI consumption (structured, minimal)

### Fixed
- MCP Registry server.json updated to schema 2025-12-11 (camelCase fields)

## [0.1.1] - 2026-03-24

### Added
- Initial release of all packages:
  - `@10iii/air` - CLI tool
  - `@10iii/air-core` - Core compression library
  - `@10iii/air-mcp-server` - MCP server for Claude/etc
  - `@10iii/air-oc-plugin` - OpenCode plugin

### Compressors
- `air-read` - File content compression with skeleton mode
- `air-bash` - Command output compression
- `air-grep` - Search result compression
- `air-test` - Test output compression (pytest, jest, vitest, go, cargo)
- `air-web` - Web page content extraction
- `air-ls` - Directory listing compression
- `air-diff` - Git diff compression
- `air-edit` - Search/replace edits
- `air-session` - AI chat session compression
- `air-api` - JSON/API response compression
- `air-media` - Media transcript compression
- `air-search` - Web search aggregation

[Unreleased]: https://github.com/10iii/air/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/10iii/air/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/10iii/air/releases/tag/v0.1.1
