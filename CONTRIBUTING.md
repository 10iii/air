# Contributing to AIR

Thank you for your interest in contributing to AIR!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/air.git`
3. Install dependencies: `pnpm install`
4. Build: `pnpm build`
5. Run tests: `pnpm test`

## Development

This is a monorepo using pnpm workspaces:

```
packages/
├── core/         # Core compression library
├── cli/          # CLI tool
├── mcp-server/   # MCP server
└── oc-plugin/    # OpenCode plugin
```

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Specific package
cd packages/core && pnpm test
```

### Building

```bash
pnpm build
```

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Ensure tests pass: `pnpm test`
4. Ensure build passes: `pnpm build`
5. Commit with clear message
6. Push and create a PR

### Commit Messages

Use conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `test:` - Tests
- `refactor:` - Code refactoring
- `chore:` - Maintenance

## Design Documents

Before making significant changes, please read:
- [PRD.md](./PRD.md) - Product requirements
- [DESIGN.md](./DESIGN.md) - Technical design

## Code Style

- TypeScript with strict mode
- ESLint + Prettier (run via pre-commit hooks)
- Prefer functional patterns where appropriate

## Questions?

Open an issue for discussion before starting major work.
