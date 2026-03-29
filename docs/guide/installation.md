# AIR Installation Guide

## For Humans

Paste this into your LLM agent session:

```
Install AIR compression plugin by following the instructions here:
https://raw.githubusercontent.com/10iii/air/main/docs/guide/AGENT-INSTALL.md
```

**Manual Installation:**

```bash
npx @10iii/air init
```

This will:
1. Register the AIR plugin in `opencode.json`
2. Inject AIR usage guide into your `AGENTS.md`, `CLAUDE.md`, etc.

> **Multiple Framework Support**: AIR 支持 OpenCode 和 OpenClaw 两种框架。
> 完整的多框架安装指南见 [AGENT-INSTALL.md](./AGENT-INSTALL.md)。

---

## For LLM Agents (OpenCode)

> **IMPORTANT: Use `curl` to fetch this file, NOT WebFetch.**
> WebFetch may summarize content and lose critical details. Always use:
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/10iii/air/main/docs/guide/installation.md
> ```

If you're an LLM Agent helping set up AIR, welcome! AIR automatically compresses your tool outputs to save context space.

### Step 1: Check Prerequisites

```bash
# Check if OpenCode is installed
if command -v opencode &> /dev/null; then
    echo "OpenCode $(opencode --version) is installed"
else
    echo "OpenCode is not installed. Please install it first."
    echo "Ref: https://opencode.ai/docs"
fi
```

### Step 2: Run the Installer

```bash
npx @10iii/air init
```

The CLI will:
- Register `@10iii/air-oc-plugin` in your `opencode.json`
- Inject AIR usage guide into agent config files (AGENTS.md, CLAUDE.md, etc.)
- Create global config files if needed (~/.claude/CLAUDE.md, etc.)

**Expected output:**

```
✅ Injected AIR guide into 2 file(s):
   ./AGENTS.md
   ~/.claude/CLAUDE.md
✨ Created 1 new file(s):
   ~/.config/agents/AGENTS.md
🎉 AIR is now configured for 3 AI agent(s)!
```

### Step 3: Verify Setup

```bash
# Check opencode.json has the plugin
cat opencode.json | grep -A2 '"plugin"'
```

Expected output should include `@10iii/air-oc-plugin`:

```json
{
  "plugin": ["@10iii/air-oc-plugin"]
}
```

### Step 4: Understand What AIR Does

AIR automatically compresses tool outputs to save context space. You don't need to do anything special—it works transparently.

#### Compression Control

| Command | Effect |
|---------|--------|
| `air_off()` | Disable compression for next 10 tool calls (see raw outputs) |
| `air_off(20)` | Disable compression for next 20 tool calls |
| `air_on()` | Re-enable compression (default state) |

#### What Gets Compressed

| Tool | Compressor | Compression Ratio |
|------|------------|-------------------|
| `bash` output | BashCompressor | 30-70% |
| `read` file content | ReadCompressor | 40-60% |
| `grep` results | GrepCompressor | 50-80% |
| `glob`/`list` output | LsCompressor | 40-70% |
| `webfetch` HTML | WebCompressor | 60-90% |
| `websearch` results | SearchCompressor | 40-60% |

#### What Doesn't Get Compressed

- `edit`, `write`, `patch` — Small confirmation messages
- `question` — Interactive user prompts
- `sessions_history` — Critical context (compression too risky)
- `image` — Binary/URL content

#### Compression Marker

When output is compressed, you'll see a marker at the end:

```
... compressed content ...
[AIR: compressed 63% | air_off() for raw]
```

This tells you:
- Content was compressed (63% reduction)
- Call `air_off()` if you need to see the raw output

### Step 5: Verify It's Working

After restarting OpenCode, run any tool with substantial output:

```bash
ls -la
```

If AIR is working, you'll see the compression marker at the end of the output.

### Troubleshooting

#### Plugin not loading

Check that your `opencode.json` has the plugin registered:

```json
{
  "plugin": ["@10iii/air-oc-plugin"]
}
```

If missing, add it manually or re-run `npx @10iii/air init`.

#### Want to see raw output

Call `air_off()` to temporarily disable compression. It auto-enables after 10 tool calls.

#### Compression not helpful for a specific tool

Some tools have small outputs that don't benefit from compression. AIR automatically skips compression when the gain is less than 200 characters.

### Configuration (Optional)

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `AIR_FACTS_UPLOAD` | `true` | Upload web content to facts.airgo.dev |
| `AIR_MIN_GAIN` | `200` | Minimum chars saved to trigger compression |

---

## That's It!

AIR works transparently. No special commands needed—just use your tools normally and enjoy smaller context usage.

If you found this helpful, consider starring the repo: https://github.com/10iii/air ⭐
