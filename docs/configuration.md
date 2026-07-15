# 配置参数说明

项目从 `.env` 读取配置。先复制 `.env.example`：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

`.env` 只保存在本机或部署平台，不要提交真实密钥。

## 1. 模型连接

| 参数 | 默认值 | 改大会或改小会发生什么 |
|---|---|---|
| `API_TYPE` | `openai` | 选择 `openai` 兼容协议或 `claude` Messages 协议；必须与网关实际协议一致 |
| `OPENAI_API_KEY` | 空 | OpenAI 兼容协议密钥；为空时自动进入 Mock |
| `OPENAI_BASE_URL` | OpenAI 官方地址 | 改为第三方网关后，延迟、模型名和兼容性由网关决定 |
| `CLAUDE_API_KEY` | 空 | Claude 协议密钥；为空时自动进入 Mock |
| `CLAUDE_BASE_URL` | Anthropic 官方地址 | 第三方 Claude 兼容地址可能显著影响首 Token |
| `MODEL_IDS` | `gpt-4o-mini` | 第一项是默认模型；放多个模型可在 CLI 或页面切换 |
| `MOCK_MODE` | `true` | `true` 不调用真实模型；适合安装、测试和演示 |

OpenAI 示例：

```env
API_TYPE=openai
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=https://api.openai.com/v1
MODEL_IDS=gpt-4o-mini
MOCK_MODE=false
```

Claude 示例：

```env
API_TYPE=claude
CLAUDE_API_KEY=你的密钥
CLAUDE_BASE_URL=https://api.anthropic.com
MODEL_IDS=供应商提供的模型名
MOCK_MODE=false
```

## 2. 生成质量、长度和费用

| 参数 | 默认值 | 影响 |
|---|---:|---|
| `TEMPERATURE` | `0.2` | 越高越发散；事实、代码和 JSON 建议较低 |
| `MAX_OUTPUT_TOKENS` | `2048` | 越大允许回答越长，也可能增加总延迟和费用 |
| `MODEL_PRICING_JSON` | `{}` | 配置后才能估算成本；单位是每百万输入/输出 Token |

价格示例：

```env
MODEL_PRICING_JSON={"model-a":{"inputPerMillion":1,"outputPerMillion":3}}
```

价格必须按供应商当天文档填写，项目不会自动猜价格。

## 3. 超时和重试

| 参数 | 默认值 | 影响 |
|---|---:|---|
| `FIRST_TOKEN_TIMEOUT_MS` | `20000` | 第一个 Token 等待上限；太小会误杀慢模型，太大会让页面长期无反馈 |
| `MODEL_TIMEOUT_MS` | `90000` | 完整生成上限，不能小于首 Token 超时 |
| `CHAT_MAX_ATTEMPTS` | `2` | 普通聊天总尝试次数；越大越可能恢复临时故障，也会增加最坏等待和费用 |
| `CHAT_RETRY_BASE_DELAY_MS` | `500` | 重试基础等待；后续按次数递增 |

重要规则：

- 认证和参数错误不重试；
- 已经向页面输出 Token 后不从头重试；
- 用户停止生成会中断模型和重试等待。

## 4. 对话上下文

| 参数 | 默认值 | 影响 |
|---|---:|---|
| `CHAT_HISTORY_MAX_MESSAGES` | `8` | 最多发送多少条历史消息；两条约等于一轮 user + assistant |
| `CHAT_HISTORY_MAX_CHARACTERS` | `12000` | 历史总字符上限；越大越能记住内容，也越慢、越贵 |

页面从 `/api/health` 读取消息上限，只发送最近的完整轮次；服务端再次校验消息数和字符数。

调优建议：

- 快速问答：4 条消息、6000 字符；
- 普通多轮：8 条消息、12000 字符；
- 长文档不要盲目扩大上下文，应使用 RAG 或摘要。

## 5. 服务和评测

| 参数 | 默认值 | 影响 |
|---|---:|---|
| `PORT` | `3000` | Node 生产服务端口 |
| `EVAL_CONCURRENCY` | `1` | 模型评测并发；越大越快，也更容易触发限流和增加瞬时费用 |

Electron 会让本地 Node 服务监听随机端口，不使用固定 `PORT`。

## 6. CloudBase

| 参数 | 默认值 | 作用 |
|---|---|---|
| `CLOUDBASE_ENV_ID` | 空 | CloudBase 环境 |
| `CLOUDBASE_COLLECTION` | `ai_chat_runs` | 聊天运行记录集合 |
| `CLOUDBASE_REGION` | `ap-shanghai` | 腾讯云区域 |
| `CLOUDBASE_APIKEY` | 空 | 部分运行环境使用的访问密钥 |
| `WX_CLOUDBASE_ACCESSTOKEN` | 空 | 云运行时临时令牌 |
| `TENCENTCLOUD_SECRETID` | 空 | 容器或本地 TC3 鉴权 |
| `TENCENTCLOUD_SECRETKEY` | 空 | 与 SecretId 配套，绝不能提交 |
| `TENCENTCLOUD_SESSIONTOKEN` | 空 | 临时凭据可选令牌 |

没有完整 CloudBase 配置时，数据库自动禁用；聊天和本地实验仍可使用。

## 7. 三套常用配置

### 本地学习

```env
MOCK_MODE=true
MODEL_IDS=mock-small,mock-large
```

### 快速真实聊天

```env
MOCK_MODE=false
MODEL_IDS=快速模型,质量模型
TEMPERATURE=0.2
MAX_OUTPUT_TOKENS=1024
CHAT_HISTORY_MAX_MESSAGES=4
CHAT_HISTORY_MAX_CHARACTERS=6000
```

### 复杂任务

```env
MAX_OUTPUT_TOKENS=4096
CHAT_HISTORY_MAX_MESSAGES=8
CHAT_HISTORY_MAX_CHARACTERS=12000
FIRST_TOKEN_TIMEOUT_MS=30000
MODEL_TIMEOUT_MS=120000
```

增加上限前先测首 Token、总延迟、质量和费用。

## 8. 配置是否生效

启动服务后访问：

```text
GET /api/health
```

返回值会安全展示模式、协议、模型名和非敏感运行上限，不返回 API Key。修改 `.env` 后需要重启本地服务；云端环境变量修改后需要重新部署或重启版本。
