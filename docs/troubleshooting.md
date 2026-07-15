# 故障排查

## 1. 固定排查顺序

遇到问题时不要先改代码，按顺序缩小范围：

```text
配置
  → /api/health
  → Node 日志
  → 模型最小请求
  → /api/chat SSE
  → 页面渲染
  → CloudBase 保存
```

先确认失败在哪一层，再修改对应模块。

## 2. AI 很久不出第一个字

先比较：

- **首 Token**：请求到第一个字；
- **总延迟**：请求到完整回答。

本项目曾测得：

| 场景 | 首 Token |
|---|---:|
| 本地 Mock `/api/chat` SSE | 35 ms |
| 原第三方 Grok 4.5 | 15091 ms |
| 同一网关 GPT 5.4 Mini | 约 3–4 秒 |

历史固定评测中，原模型平均首 Token 达到 89489 ms。证据说明主因是模型/网关，不是 Node 把完整回答攒完才返回。

检查：

1. 用 `npm run chat` 发送 `Reply only: OK`；
2. 把快速非推理模型放在 `MODEL_IDS` 第一位；
3. 缩短上下文和输出上限；
4. 查看 `FIRST_TOKEN_TIMEOUT_MS`；
5. 检查代理是否缓冲 SSE。

项目已经使用 `flushHeaders()`、`X-Accel-Buffering: no`、SSE 心跳、Token 帧批处理和 localStorage 防抖。

## 3. 回答开始快，但完成慢

常见原因：

- `MAX_OUTPUT_TOKENS` 太大；
- Prompt 要求长篇回答；
- 模型生成速度慢；
- 开启复杂推理模式；
- 网络中途抖动并触发重试。

先减小输出上限并固定短提示。已经输出 Token 后，项目不会从头自动重试。

## 4. 第二轮记不住上一轮

访问 `/api/health`，检查：

```text
limits.chatHistoryMaxMessages
limits.chatHistoryMaxCharacters
```

`CHAT_HISTORY_MAX_MESSAGES=0` 会关闭历史。消息上限小于 2 时无法发送一轮完整的 user + assistant 历史。

## 5. 页面连接失败

检查：

```bash
curl -fsS http://localhost:3000/api/health
```

- 接口失败：检查 Node 服务和端口；
- 接口成功但页面失败：检查 Vite 代理、Electron preload 或浏览器控制台；
- 生产页面提示资源未构建：先执行 `npm run build`。

## 6. Mock 和真实模型不一致

访问 `/api/health`：

- `mode: "mock"`：没有真实调用；
- `mode: "real"`：已读取匹配协议的密钥；
- `apiType`：必须和 Base URL 的协议一致；
- `models[0]`：默认模型。

只改 Base URL、不改 `API_TYPE` 和模型名，通常会得到协议或模型不存在错误。

## 7. CloudBase 历史为空

聊天回答和历史保存是两条故障隔离链路。依次检查：

1. `database.enabled`；
2. `database.state` 是否为 `error`；
3. 环境 ID、集合名和区域；
4. 运行时令牌或专用最小权限凭据；
5. 云日志中的 `CloudBase 聊天记录保存失败`。

数据库失败不会造成首 Token 慢，因为保存发生在回答完成后。

## 8. 腾讯云 502、503 或旧版本

检查：

1. `PORT=3000`；
2. Docker 构建是否成功；
3. 云托管实例和最新版本状态；
4. 环境变量是否完整；
5. 提交后是否等待镜像构建和流量切换；
6. `/api/health` 是否来自最新版本。

当前历史公网地址最近检查返回 503，需要重新部署后再验收。

## 9. 构建中的 `PURE` 警告

`@vueuse/core` 的 Rollup 注释警告来自第三方包。只要 Vite 最终显示构建成功，它不是失败。

## 10. 工具箱常见边界

- 证件照首次抠图慢：浏览器正在下载模型资源；
- `.doc` 解析差：先另存为 `.docx`；
- GIF 压缩后不动：Canvas 导出只保留静态帧；
- SVG 目标大小只是优化：文本结构压缩不能保证精确字节；
- 超大图片可能受浏览器内存限制。

## 11. 真实工程问题记录

| 问题 | 根因 | 处理 |
|---|---|---|
| 流已开始后出现重复回答 | 临时错误触发从头重试 | 输出 Token 后禁止自动重试 |
| 停止生成仍等待重试 | 延时没有监听 AbortSignal | 重试等待支持立即中断 |
| 页面越生成越卡 | 每个 Token 都渲染、滚动和序列化 | 按动画帧合并并防抖保存 |
| HITL 缓存混用批准状态 | 缓存键缺少 `approved` | 键包含租户、问题和批准状态 |
| TypeScript 可选属性报错 | `exactOptionalPropertyTypes` 区分缺失和 `undefined` | 只在有值时展开属性 |
| Python 只通过 compileall | 语法通过不代表依赖和路由可运行 | 增加 unittest 和接口测试 |

## 12. 提交前检查

```bash
npm run check
npm run build
npm run eval:learning
npm run python:check
npm run python:test
git diff --check
```

如果真实模型失败，先证明是配置、供应商还是代码，不要删除测试或关闭安全策略。
