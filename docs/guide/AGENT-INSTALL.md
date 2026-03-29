# AIR Plugin Installation Guide for AI Agents

> **本文档供 AI Agent 阅读**，帮助智能体为用户安装 AIR 插件。
>
> AIR 自动压缩工具输出，节省上下文空间。支持 **OpenCode** 和 **OpenClaw** 两种框架。

---

## Step 1: 检测框架类型

首先确定用户使用的是哪个 AI Agent 框架：

```bash
# 检测 OpenCode
if [ -f "opencode.json" ]; then
    echo "FRAMEWORK=opencode"
# 检测 OpenClaw
elif [ -f "openclaw.json" ] || [ -f ".openclaw/config.json" ]; then
    echo "FRAMEWORK=openclaw"
else
    echo "FRAMEWORK=unknown"
fi
```

---

## OpenCode 安装

### Step 2a: 安装插件（全局）

```bash
# 推荐：使用 init 命令（自动完成全部配置）
npx @10iii/air init

# 或手动全局安装
npm install -g @10iii/air-oc-plugin
```

### Step 3a: 配置 opencode.json（项目级）

在项目的 `opencode.json` 中添加插件引用：

```json
{
  "plugins": ["@10iii/air-oc-plugin"]
}
```

**注意**：插件包全局安装后，每个项目的 `opencode.json` 都需要添加引用才能启用。
`npx @10iii/air init` 会自动完成这一步。

如果配置文件已存在，手动编辑添加到 `plugins` 数组中。

### Step 4a: 验证安装

重启 OpenCode 后，运行任意命令测试：

```bash
ls -la
```

如果看到输出末尾有 `[AIR: compressed XX% | air_off() for raw]` 标记，说明安装成功。

---

## OpenClaw 安装

### Step 2b: 安装插件（项目级）

OpenClaw 插件是项目级依赖：

```bash
npm install @10iii/air-openclaw-plugin
# 或
pnpm add @10iii/air-openclaw-plugin
```

### Step 3b: 配置 OpenClaw

在 OpenClaw 配置文件中添加插件：

**方式一：配置文件**

```json
// openclaw.json 或 .openclaw/config.json
{
  "plugins": ["@10iii/air-openclaw-plugin"]
}
```

**方式二：编程方式**

```typescript
import airPlugin from "@10iii/air-openclaw-plugin";

// 在 OpenClaw 初始化时
airPlugin.activate(api);
```

### Step 4b: 推荐配置

为获得更好的压缩效果，增加 web fetch 限制：

```json
{
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

检查配置文件是否正确包含插件：

```bash
# OpenCode
cat opencode.json | grep -A2 '"plugins"'

# OpenClaw
cat openclaw.json | grep -A2 '"plugins"'
```

### 想查看原始输出

调用 `air_off()` 临时禁用压缩。

### 压缩没有效果

- 输出可能太小（< 200 字符增益不触发压缩）
- 某些工具不在压缩白名单内

---

## 新功能：双源搜索合并

AIR 插件会自动将 LLM 付费搜索（Exa/Tavily）与免费搜索引擎结果合并：

- 当 API key 耗尽时，仍有免费引擎结果作为备份
- 自动去重、合并来源
- 对用户透明，无需额外配置

---

## 快速检查清单

- [ ] 框架类型已确定（OpenCode / OpenClaw）
- [ ] 插件已安装（npm/pnpm）
- [ ] 配置文件已更新
- [ ] 框架已重启
- [ ] 测试命令显示 `[AIR: compressed]` 标记

安装完成！AIR 现在会自动压缩工具输出，帮助节省上下文空间。
