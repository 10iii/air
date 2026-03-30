# AIR Plugin Installation Guide for AI Agents

> **本文档供 AI Agent 阅读**，帮助智能体为用户安装 AIR 插件。
>
> AIR 自动压缩工具输出，节省上下文空间。支持 **OpenCode** 和 **OpenClaw** 两种框架。

---

## Step 1: 检测框架类型

首先确定用户使用的是哪个 AI Agent 框架：

```bash
# 检测 OpenCode
if [ -f "opencode.json" ] || [ -f ~/.opencode.json ]; then
    echo "FRAMEWORK=opencode"
# 检测 OpenClaw
elif [ -f "openclaw.json" ] || [ -f ~/.openclaw.json ] || [ -f ~/.openclaw/config.json ]; then
    echo "FRAMEWORK=openclaw"
else
    echo "FRAMEWORK=unknown"
fi
```

---

## OpenCode 安装

AIR 提供两种使用方式，可以单独或同时使用：

| 方式 | 包名 | 作用 | 安装命令 |
|---|---|---|---|
| **OC 插件** | `@10iii/air-oc-plugin` | 自动透明压缩工具输出 | `npm install -g @10iii/air-oc-plugin` |
| **CLI 工具** | `@10iii/air` | 手动调用压缩命令 | `npm install -g @10iii/air` |

### 方式 1：OC 插件（推荐，自动透明）

安装后，所有工具输出自动压缩，无需修改任何代码。

#### Step 2a: 安装插件

```bash
npm install -g @10iii/air-oc-plugin
```

#### Step 3a: 配置全局 opencode.json

OpenCode 全局配置文件位置（按优先级）：

| 系统 | 主路径 | 备选路径（XDG 标准） |
|---|---|---|
| **macOS/Linux** | `~/.opencode.json` | `~/.config/opencode/opencode.json` |
| **Windows** | `%USERPROFILE%\.opencode.json` | `%LOCALAPPDATA%\opencode\opencode.json` |

找到或创建全局配置文件，添加插件引用：

```bash
# macOS/Linux: 检查并创建
cat ~/.opencode.json 2>/dev/null || echo '{}' > ~/.opencode.json

# Windows (PowerShell): 检查并创建
if (!(Test-Path "$env:USERPROFILE\.opencode.json")) { '{}' | Out-File "$env:USERPROFILE\.opencode.json" }
```

编辑全局配置文件，添加插件：

```json
{
  "plugin": ["@10iii/air-oc-plugin"]
}
```

如果已有其他配置，只需添加 `plugin` 数组或追加到现有数组中。

#### Step 4a: 验证安装

重启 OpenCode 后，运行任意命令测试：

```bash
ls -la
```

如果看到输出末尾有 `[AIR: compressed XX% | air_off() for raw]` 标记，说明安装成功。

### 方式 2：CLI 工具（手动调用）

Agent 可以主动调用 `air` 命令压缩输出。

#### Step 2b-cli: 安装 CLI

```bash
npm install -g @10iii/air
```

#### Step 3b-cli: 注入使用指南（可选）

```bash
npx @10iii/air init
```

这会向 AGENTS.md / CLAUDE.md 等配置文件注入 AIR CLI 使用指南，让 agent 知道可以用 `air bash`、`air web` 等命令。

**注意**：`air init` 只注入文档，不安装 OC 插件。

### 备选：通过本地入口文件安装 OC 插件

如果直接在 plugin 数组中引用包名不生效（某些 OpenCode 版本的兼容性问题），可以使用本地入口文件方式：

**Step 1**: 创建入口文件 `.opencode/plugins/air.ts`

```typescript
// AIR 插件入口 - 导入并重新导出 @10iii/air-oc-plugin
import AirPlugin from '@10iii/air-oc-plugin';
export default AirPlugin;
```

**Step 2**: 在 `opencode.json` 中引用本地文件

```json
{
  "plugin": ["file:///path/to/project/.opencode/plugins/air.ts"]
}
```

这种方式通过本地 TypeScript 文件转发，确保插件被正确加载。

---

## OpenClaw 安装

### Step 2b: 安装插件（全局）

```bash
# 全局安装
npm install -g @10iii/air-openclaw-plugin
```

### Step 3b: 配置全局 OpenClaw 配置

在**全局配置文件**中添加插件引用。OpenClaw 全局配置位置可能是：

- `~/.openclaw.json`
- `~/.openclaw/config.json`

```bash
# 检查并创建全局配置
cat ~/.openclaw.json 2>/dev/null || echo '{}' > ~/.openclaw.json
```

编辑全局配置，添加插件：

```json
{
  "plugins": ["@10iii/air-openclaw-plugin"]
}
```

**或编程方式**（在应用初始化代码中）：

```typescript
import airPlugin from "@10iii/air-openclaw-plugin";

// 在 OpenClaw 初始化时
airPlugin.activate(api);
```

### Step 4b: 推荐配置

为获得更好的压缩效果，增加 web fetch 限制（添加到全局配置）：

```json
{
  "plugins": ["@10iii/air-openclaw-plugin"],
  "webFetch": {
    "maxChars": 100000,
    "maxCharsCap": 200000,
    "maxResponseBytes": 10000000
  }
}
```

### Step 5b: 验证安装

重启 OpenClaw 后，运行任意命令测试。看到 `[AIR: compressed XX%]` 标记即为成功。

---

## 压缩控制

AIR 提供两个控制工具，两个框架通用：

### `air_off(calls?: number)`

临时禁用压缩，查看原始输出：

```
调用: air_off()      # 禁用接下来 10 次工具调用
调用: air_off(20)    # 禁用接下来 20 次工具调用
```

### `air_on()`

重新启用压缩（默认状态）。

---

## 压缩覆盖范围

### OpenCode 压缩的工具

| 工具 | 压缩器 | 典型压缩率 |
|------|--------|-----------|
| `bash` | BashCompressor | 30-70% |
| `read` | ReadCompressor | 40-60% |
| `grep` | GrepCompressor | 50-80% |
| `glob`/`list` | LsCompressor | 40-70% |
| `webfetch` | WebCompressor | 60-90% |
| `websearch_*` | SearchCompressor | 40-60% |

### OpenClaw 压缩的工具

| 工具 | 压缩器 | 说明 |
|------|--------|------|
| `exec` | BashCompressor | 命令执行输出 |
| `process` | BashCompressor | 进程输出 |
| `read` | ReadCompressor | 文件内容 |
| `browse` | WebCompressor | 浏览器快照 |
| `http` | WebCompressor | HTTP 请求响应 |
| `web_search` | SearchCompressor | 搜索结果 |

### 不压缩的工具

- `edit`, `write`, `patch` — 输出太小
- `question` — 交互式提示
- `sessions_history` — 关键上下文
- `image` — 二进制内容

---

## 环境变量配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AIR_FACTS_UPLOAD` | `true` | 上传 web 内容到 facts.airgo.dev（众包知识库） |
| `AIR_MIN_GAIN` | `200` | 触发压缩的最小节省字符数 |
| `AIR_DEFAULT_DISABLED_CALLS` | `10` | `air_off()` 默认禁用次数 |

---

## 故障排除

### 插件未加载

检查**全局配置文件**是否正确包含插件：

```bash
# OpenCode
cat ~/.opencode.json | grep -A2 '"plugin"'

# OpenClaw
cat ~/.openclaw.json | grep -A2 '"plugins"'
```

### 想查看原始输出

调用 `air_off()` 临时禁用压缩。

### 压缩没有效果

- 输出可能太小（< 200 字符增益不触发压缩）
- 某些工具不在压缩白名单内
- **重要**：确保安装了最新版本（≥0.2.11），旧版本存在 hook 签名兼容性问题

### OpenCode：tools 可用但压缩不生效

如果 `air_on()`/`air_off()` 工具可以调用，但工具输出没有 `[AIR: compressed]` 标记：

1. **检查版本**：确保 `@10iii/air-oc-plugin >= 0.2.11`
   ```bash
   npm ls @10iii/air-oc-plugin
   ```
2. **升级插件**：
   ```bash
   npm install -g @10iii/air-oc-plugin@latest
   ```
3. **重启框架**：hook 注册需要重启才能生效

> **背景**：v0.2.10 及更早版本存在 hook 参数签名错误（使用单参数 `event` 而非 OC 要求的双参数 `input, output`），导致 hook 虽然注册但内部逻辑无法正确执行。v0.2.11 已修复此问题。

### 项目本地安装 vs 全局安装

推荐使用**全局安装**（`npm install -g`），这样所有项目都能自动启用压缩。

如果需要**项目本地安装**（仅当前项目使用）：

```bash
# 在项目目录下
npm install @10iii/air-oc-plugin

# 在项目的 opencode.json 中配置
{
  "plugin": ["@10iii/air-oc-plugin"]
}
```

**注意**：本地安装的插件只对当前项目生效。

---

## 新功能：双源搜索合并

AIR 插件会自动将 LLM 付费搜索（Exa/Tavily）与免费搜索引擎结果合并：

- 当 API key 耗尽时，仍有免费引擎结果作为备份
- 自动去重、合并来源
- 对用户透明，无需额外配置

---

## 快速检查清单

- [ ] 框架类型已确定（OpenCode / OpenClaw）
- [ ] 插件已全局安装（`npm install -g`）
- [ ] **全局配置文件**已更新（`~/.opencode.json` 或 `~/.openclaw.json`）
- [ ] 框架已重启
- [ ] 测试命令显示 `[AIR: compressed]` 标记

安装完成！AIR 现在会自动压缩工具输出，帮助节省上下文空间。
