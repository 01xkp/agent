# CloudBase 数据与保存

## 1. 它在项目中的作用

CloudBase 只负责可选的云端聊天历史。模型生成、页面本地实验和工具箱不依赖数据库。

```text
模型流式回答完成
  → 保存 runId、问题、回答、模型和指标
  → ai_chat_runs
  → GET /api/history
  → 页面最近实验
```

保存发生在回答完成后。保存失败不会撤销回答，也不是首 Token 慢的原因。

## 2. 一条记录

```json
{
  "type": "chat",
  "runId": "一次运行的 UUID",
  "prompt": "用户问题",
  "answer": "完整回答",
  "model": "模型名",
  "mode": "mock",
  "metrics": {
    "firstTokenMs": 18,
    "totalLatencyMs": 126,
    "usage": {
      "inputTokens": 12,
      "outputTokens": 45
    },
    "estimatedCost": null
  },
  "createdAt": "ISO 时间"
}
```

`runId` 用于把 SSE 事件、日志和保存记录关联到同一次运行。

## 3. 为什么本地不配置也能运行

`CloudBaseChatStore` 会检查环境 ID 和可用凭据。缺少完整配置时：

```text
database.enabled = false
saveChat() = false
listChats() = []
```

页面继续使用浏览器 `localStorage` 保存本地实验。

## 4. 鉴权

项目支持：

1. CloudBase 运行时令牌或 API Key；
2. 容器/本地的腾讯云临时或专用凭据，通过 TC3-HMAC-SHA256 签名。

密钥只存在于服务端环境变量，不进入 Vue bundle、数据库文档或 API 返回值。生产环境应使用专用最小权限身份，不使用个人主账号密钥。

配置参数见 [配置参数说明](configuration.md)。

## 5. 健康状态

`GET /api/health` 中：

- `disabled`：未配置，正常降级；
- `configured`：配置已读取；
- `connected`：最近读写成功；
- `error`：最近读写失败。

`GET /api/history` 返回：

```json
{
  "enabled": true,
  "items": []
}
```

`items` 为空不一定是故障，可能只是尚未保存聊天。

## 6. 生产化建议

- 记录用户和会话 ID；
- 增加分页、删除和保留周期；
- 对问题和回答做敏感信息处理；
- 将 Eval 和 Trace 存入独立集合；
- 建立最小权限、审计和告警。
