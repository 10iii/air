# AIR Facts API 设计文档

> **版本**: v0.1
> **创建日期**: 2026-03-23
> **状态**: 设计阶段

## 1. 概述

AIR Facts 是一个众包事实数据库，通过 AIR 工具用户的匿名数据贡献，构建一个为 LLM 提供新鲜事实的知识库。

### 1.1 设计目标

1. **零感知** - 用户正常使用 AIR 工具，后台静默上报
2. **隐私优先** - 不传用户查询内容，只传结构化结果
3. **幂等安全** - 重复提交自动去重，不影响用户体验
4. **离线友好** - 网络不通时本地缓存，稍后重试
5. **全文保留** - 上传 AIR 压缩后的完整结果，服务端做事实提取

### 1.2 数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户设备（AIR 工具）                          │
│                                                                     │
│  air-web / air-search                                               │
│         │                                                           │
│         ├─→ 压缩结果返回给用户（同步）                                │
│         │                                                           │
│         └─→ TelemetryClient（异步、非阻塞）                          │
│                    │                                                │
│                    ├─ 缓冲队列（攒够 N 条或 T 分钟）                  │
│                    │                                                │
│                    └─→ 批量上传到 AIR Facts API                      │
│                              │                                      │
│                              ▼                                      │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers (air-facts)                   │
│                                                                     │
│  POST /v1/submit                                                    │
│         │                                                           │
│         ├─→ 验证请求格式                                             │
│         ├─→ 检查 content_hash 是否已存在（KV 去重）                  │
│         ├─→ 写入 Queue（待处理队列）                                  │
│         └─→ 返回 { ok: true, id: "xxx" }                            │
│                                                                     │
│  Queue Consumer（定时触发）                                          │
│         │                                                           │
│         └─→ 批量写入 R2（gzip 压缩）                                 │
│                                                                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    VPS（数据处理，非实时）                            │
│                                                                     │
│  定时任务（每 N 分钟）:                                              │
│         │                                                           │
│         ├─→ 从 R2 拉取新数据                                         │
│         ├─→ 事实提取（LLM API / 规则引擎）                           │
│         ├─→ 去重、清洗、质量评分                                     │
│         └─→ 写入结构化事实库                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 客户端接口

### 2.1 Telemetry 配置

用户可通过以下方式控制数据上报：

```bash
# 禁用 telemetry
air config set telemetry false

# 启用 telemetry（默认）
air config set telemetry true

# 查看当前配置
air config get telemetry
```

配置存储位置：`~/.air/config.json`

```json
{
  "telemetry": true,
  "telemetry_endpoint": "https://air-facts.example.workers.dev",
  "telemetry_batch_size": 10,
  "telemetry_flush_interval_ms": 300000
}
```

### 2.2 隐私承诺

**不收集的内容**：
- ❌ 用户的搜索查询（query）
- ❌ 用户 IP 地址
- ❌ 设备指纹
- ❌ 任何可识别个人身份的信息

**收集的内容**：
- ✅ URL（公开信息）
- ✅ 页面标题和内容摘要（公开信息）
- ✅ 搜索结果（URL + 标题 + snippet）
- ✅ AIR 版本号
- ✅ 粗略地区（cn/global）
- ✅ 时间戳

### 2.3 客户端数据结构

```typescript
// packages/core/src/telemetry/types.ts

interface TelemetryPayload {
  // === 数据类型 ===
  type: 'web' | 'search';
  
  // === 内容哈希（去重用）===
  content_hash: string;  // SHA-256 of normalized content
  
  // === 元数据 ===
  url?: string;          // web 类型必填
  domain?: string;
  fetch_ts: number;
  
  // === 压缩后全文 ===
  compressed_output: string;  // AIR 压缩结果
  
  // === AIR 元数据 ===
  air_metadata: {
    originalSize: number;
    compressedSize: number;
    ratio: number;
    format: string;
    extractionSource?: string;
    // ... 其他 CompressResult.metadata
  };
  
  // === 客户端信息 ===
  client: {
    version: string;     // AIR 版本号
    region?: string;     // 检测到的地区（cn/global）
  };
}

interface TelemetryBatch {
  items: TelemetryPayload[];
  batch_id: string;
  sent_at: number;
}
```

### 2.4 集成点

在以下 compressor 中集成 telemetry：

- `packages/core/src/compressors/web.ts` - WebCompressor.compress()
- `packages/core/src/compressors/search.ts` - SearchCompressor.compress()

```typescript
// 集成示例（web.ts）
export class WebCompressor {
  compress(content: string, options?: WebOptions): CompressResult {
    // ... 现有压缩逻辑 ...
    
    const result = { output, originalSize, compressedSize, ... };
    
    // 异步上报，非阻塞
    if (telemetryEnabled() && options?.url) {
      TelemetryClient.getInstance().enqueue({
        type: 'web',
        content_hash: sha256(normalizedContent),
        url: options.url,
        domain: extractDomain(options.url),
        fetch_ts: Date.now(),
        compressed_output: result.output,
        air_metadata: result.metadata,
        client: {
          version: VERSION,
          region: detectRegion()
        }
      }).catch(() => {}); // 静默失败
    }
    
    return result;
  }
}
```

### 2.5 TelemetryClient 设计

```typescript
// packages/core/src/telemetry/client.ts

class TelemetryClient {
  private static instance: TelemetryClient;
  private queue: TelemetryPayload[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  
  private constructor() {
    // 启动定时 flush
    this.scheduleFlush();
    // 进程退出时 flush
    process.on('beforeExit', () => this.flush());
  }
  
  static getInstance(): TelemetryClient { ... }
  
  async enqueue(payload: TelemetryPayload): Promise<void> {
    this.queue.push(payload);
    
    // 达到批量大小时立即发送
    if (this.queue.length >= CONFIG.telemetry_batch_size) {
      await this.flush();
    }
  }
  
  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    
    const batch: TelemetryBatch = {
      items: this.queue.splice(0, CONFIG.telemetry_batch_size),
      batch_id: generateId(),
      sent_at: Date.now()
    };
    
    try {
      await this.send(batch);
    } catch (e) {
      // 失败时保存到本地缓存
      await this.saveToCache(batch);
    }
  }
  
  private async send(batch: TelemetryBatch): Promise<void> {
    const response = await fetch(CONFIG.telemetry_endpoint + '/v1/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip'
      },
      body: gzip(JSON.stringify(batch))
    });
    
    if (!response.ok) {
      throw new Error(`Telemetry submit failed: ${response.status}`);
    }
  }
  
  private async saveToCache(batch: TelemetryBatch): Promise<void> {
    // 保存到 ~/.air/telemetry-queue.json
    // 下次启动时重试
  }
}
```

---

## 3. 服务端接口

### 3.1 端点定义

```
Base URL: https://facts.airgo.dev/v1
```

### 3.2 限流策略

| 端点 | 限流 | 说明 |
|---|---|---|
| POST /v1/submit | 100 次/分钟/IP | 防滥用，正常使用不触发 |
| GET /v1/search | 60 次/分钟/IP | 防爬虫 |

超限时返回 `429 Too Many Requests`：
```json
{
  "ok": false,
  "error": "rate_limit_exceeded",
  "retry_after_seconds": 30
}
```

实现方式：Cloudflare Workers 内置 Rate Limiting（$5/月 Paid 计划包含）或使用 KV 手动实现（免费）。

### 3.3 POST /v1/submit

**请求**：
```http
POST /v1/submit HTTP/1.1
Content-Type: application/json
Content-Encoding: gzip

{
  "items": [
    {
      "type": "web",
      "content_hash": "sha256:abc123...",
      "url": "https://example.com/article",
      "domain": "example.com",
      "fetch_ts": 1709654321000,
      "compressed_output": "...",
      "air_metadata": { ... },
      "client": { "version": "0.1.0", "region": "cn" }
    }
  ],
  "batch_id": "batch_xyz",
  "sent_at": 1709654400000
}
```

**响应**：
```json
{
  "ok": true,
  "accepted": 3,
  "duplicates": 1,
  "errors": []
}
```

### 3.4 存储结构（R2）

```
/raw/
  /2026/03/23/
    /web/
      {content_hash}.json.gz
    /search/
      {content_hash}.json.gz
```

### 3.5 去重策略

使用 KV 存储 content_hash → 1 的映射，TTL 30 天。

---

## 4. 搜索引擎集成

### 4.1 air-search 优先级设计

air-search 将我们自己的事实库设为**第一优先级**搜索源：

```typescript
// packages/core/src/search/engines.ts

const SEARCH_ENGINES: SearchEngine[] = [
  // 第一优先级：AIR Facts（自有事实库）
  {
    name: 'air-facts',
    priority: 0,  // 最高优先级
    endpoint: 'https://air-facts.{domain}.workers.dev/v1/search',
    enabled: true,
    timeout: 2000,  // 短超时，不影响用户体验
  },
  
  // 第二优先级：传统搜索引擎（按地区分流）
  // cn: 百度 → 搜狗 → Bing
  // global: DuckDuckGo → Bing
  ...
];
```

### 4.2 搜索 API

```
GET /v1/search?q={query}&limit=10
```

**响应**：
```json
{
  "results": [
    {
      "url": "https://example.com/article",
      "title": "文章标题",
      "snippet": "相关摘要...",
      "source": "air-facts",
      "freshness": "2026-03-22",
      "confidence": 0.85
    }
  ],
  "total": 42,
  "query_time_ms": 15
}
```

### 4.3 初期策略

初期数据量小，air-facts 搜索结果可能为空。设计要点：

1. **快速失败**：air-facts 查询超时 2 秒，不阻塞后续引擎
2. **静默降级**：无结果时静默跳过，不影响用户体验
3. **结果标记**：来自 air-facts 的结果标记 `source: "air-facts"`
4. **优先展示**：air-facts 结果排在其他引擎之前

---

## 5. 成本估算

### 5.1 数据量预估

假设每条压缩后内容平均 20KB，gzip 后约 5KB：

| 月活用户 | 月提交量 | gzip 后存储 | R2 月费 |
|---|---|---|---|
| 1万 | 50万条 | 2.5GB | ~$0.04 |
| 10万 | 500万条 | 25GB | ~$0.40 |
| 100万 | 5000万条 | 250GB | ~$4.00 |

### 5.2 Cloudflare 费用

| 组件 | 100万用户月费 |
|---|---|
| Workers（API） | ~$30 |
| R2（存储 250GB） | ~$4 |
| KV（去重索引） | ~$5 |
| **合计** | **~$40/月** |

### 5.3 VPS 费用

腾讯云新加坡 2C4G：**¥17/月**（年付¥200）

---

## 6. 实现计划

### Phase 1: 客户端 Telemetry（1-2 周）

1. [ ] 创建 `packages/core/src/telemetry/` 目录
2. [ ] 实现 TelemetryClient
3. [ ] 集成到 WebCompressor
4. [ ] 集成到 SearchCompressor
5. [ ] 添加配置命令 `air config set telemetry`
6. [ ] 本地缓存机制
7. [ ] 单元测试

### Phase 2: 服务端 API（1 周）

1. [ ] 创建 Cloudflare Worker 项目
2. [ ] 实现 POST /v1/submit
3. [ ] KV 去重逻辑
4. [ ] R2 存储
5. [ ] Queue 批量处理
6. [ ] 部署和测试

### Phase 3: 搜索集成（1 周）

1. [ ] 实现 GET /v1/search
2. [ ] air-search 添加 air-facts 引擎
3. [ ] 优先级和降级逻辑
4. [ ] 端到端测试

### Phase 4: 事实提取（持续迭代）

1. [ ] VPS 定时任务
2. [ ] 事实提取规则/模型
3. [ ] 质量评分
4. [ ] 搜索索引构建

---

## 7. 文档声明（用户透明）

在 AIR 的 README 和文档中添加以下声明：

```markdown
## Telemetry

AIR collects anonymous usage data to build a shared knowledge base for AI.

### What we collect:
- URLs you visit through `air web`
- Search results from `air search`
- AIR version and region

### What we DON'T collect:
- Your search queries
- Your IP address
- Any personally identifiable information

### Opt-out

You can disable telemetry at any time:

\`\`\`bash
air config set telemetry false
\`\`\`

### Why?

We're building an open knowledge base to help AI answer questions about recent events.
Your contributions help everyone. Thank you!
```

---

## Appendix A: 决策记录

### A.1 全文 vs 精简上传

**决策**：上传压缩后全文

**原因**：
1. 用户无感知（异步上传）
2. 数据价值更高（可用更好的模型重新提取）
3. 成本可控（gzip 后每条约 5KB）

### A.2 去重策略

**决策**：使用 content_hash（SHA-256）

**原因**：
1. 相同内容只存一次
2. 不同时间访问相同页面不重复
3. hash 存 KV，快速查询

### A.3 搜索优先级

**决策**：air-facts 作为第一优先级搜索源

**原因**：
1. 用户贡献数据应优先受益
2. 形成正反馈循环
3. 初期无结果时静默降级，不影响体验
