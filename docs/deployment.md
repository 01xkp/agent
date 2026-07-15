# 腾讯云部署

这份文档只说明如何把 Node API、Vue 页面和 CloudBase 历史一起发布到现有 `csfan` 云托管服务。

## 1. 固定信息

| 项目 | 值 |
|---|---|
| 环境 ID | `cs-fan-d5gdz3x5zba13ac38` |
| 服务名 | `csfan` |
| 端口 | `3000` |
| 公网地址 | <https://csfan-282237-9-1454031439.sh.run.tcloudbase.com> |
| 控制台 | <https://tcb.cloud.tencent.com/dev?envId=cs-fan-d5gdz3x5zba13ac38#/platform-run/service/detail?serverName=csfan&tabId=overview&envId=cs-fan-d5gdz3x5zba13ac38> |

历史版本曾成功发布；最近健康检查返回 503。重新发布并验证前，不应描述为当前线上可用。

## 2. 为什么不能只传静态文件

项目包含：

```text
GET  /api/health
GET  /api/history
GET  /api/learning/week2-9
POST /api/chat
POST /api/structured
POST /api/support-agent
```

必须部署完整 Node 容器。Vue 构建文件由同一服务托管。

## 3. 发布前检查

```bash
npm install
npm run check
npm run build
npm run eval:learning
git status
```

确认 `.env`、API Key、SecretId 和 SecretKey 没有进入 Git。

## 4. 登录

```bash
npm exec --yes --package=@cloudbase/cli@3.6.1 -- tcb login --flow device
```

按照终端给出的地址和设备码完成授权。

检查服务：

```bash
npm exec --yes --package=@cloudbase/cli@3.6.1 -- tcb -e cs-fan-d5gdz3x5zba13ac38 cloudrun list --serviceName csfan
```

## 5. 部署

Windows PowerShell：

```powershell
npm exec --yes --package=@cloudbase/cli@3.6.1 -- tcb -e cs-fan-d5gdz3x5zba13ac38 cloudrun deploy --serviceName csfan --source . --port 3000 --force
```

macOS / Linux：

```bash
npm exec --yes --package=@cloudbase/cli@3.6.1 -- tcb \
  -e cs-fan-d5gdz3x5zba13ac38 \
  cloudrun deploy \
  --serviceName csfan \
  --source . \
  --port 3000 \
  --force
```

参数：

- `-e`：明确目标环境；
- `--serviceName csfan`：更新现有服务；
- `--source .`：使用当前工程；
- `--port 3000`：容器监听端口；
- `--force`：跳过普通确认。

普通更新不需要新建服务。看到“提交完成”后仍要等待镜像构建、实例启动和流量切换。

## 6. 环境变量

在 `csfan → 服务设置 → 环境变量` 配置模型和 CloudBase。完整字段及参数影响见 [配置参数说明](configuration.md)。

最小 Mock：

```env
MOCK_MODE=true
MODEL_IDS=mock-small,mock-large
PORT=3000
```

真实模型至少需要：

```env
API_TYPE=claude
CLAUDE_API_KEY=<云端密钥>
CLAUDE_BASE_URL=<实际地址>
MODEL_IDS=<实际模型>
MOCK_MODE=false
PORT=3000
```

CloudBase 至少需要环境 ID、集合、区域和一种有效的服务端凭据。不要把密钥写进代码或 Dockerfile。

## 7. 上线验证

### 健康

```bash
curl -fsS https://csfan-282237-9-1454031439.sh.run.tcloudbase.com/api/health
```

确认：

- `ok: true`；
- `mode`、`apiType` 和 `models` 正确；
- `limits` 与云端配置一致；
- `database.state` 不是 `error`。

### 页面和静态资源

打开公网地址，确认 AI 工作台和创图工具箱可切换。

### SSE

发送最短问题，确认回答逐步出现，而不是完整等待后一次返回；记录首 Token 和总延迟。

### 历史

```bash
curl -fsS https://csfan-282237-9-1454031439.sh.run.tcloudbase.com/api/history
```

配置数据库时，发送一次聊天后应出现新记录。

### 学习和企业 Agent

```bash
curl -fsS https://csfan-282237-9-1454031439.sh.run.tcloudbase.com/api/learning/week2-9
```

```bash
curl -fsS -X POST \
  -H "content-type: application/json" \
  -d '{"message":"退款超过三天没有完成怎么办？","approved":false,"tenantId":"csfan"}' \
  https://csfan-282237-9-1454031439.sh.run.tcloudbase.com/api/support-agent
```

企业 Agent 应返回引用、Trace ID 和人工确认状态。

## 8. 故障和回滚

502/503、旧版本、模型失败和数据库问题见 [故障排查](troubleshooting.md)。

新版本异常时：

1. 在部署管理找到上一个健康版本；
2. 将流量切回；
3. 验证首页、健康、历史和支持 Agent；
4. 记录故障版本、日志、根因和修复提交。

不要通过删除测试、关闭安全检查或提交密钥解决部署问题。

## 9. 本地生产验证

```bash
npm run build
npm start
curl -fsS http://localhost:3000/api/health
```

Docker：

```bash
docker build -t csfan .
docker run --env-file .env -p 3000:3000 csfan
```

## 10. 发布清单

- [ ] 检查、构建和 Eval 通过；
- [ ] Git 中没有密钥；
- [ ] 环境 ID、服务名和端口正确；
- [ ] 云端环境变量完整；
- [ ] 最新版本已切换流量；
- [ ] 首页和工具箱可用；
- [ ] `/api/health` 正常；
- [ ] SSE 真实流式；
- [ ] `/api/history` 正常；
- [ ] 学习接口和支持 Agent 正常。
