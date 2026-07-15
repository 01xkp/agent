# 项目全景与架构

## 1. 一句话理解

CS 凡是一套“AI 工程实验室 + 可用工具箱”。它让学习者看到一个 AI 功能从页面输入到模型、工具、数据、测试和部署的完整过程。

它解决的问题不是“怎么让模型说一句话”，而是：

- 怎么稳定接入不同模型；
- 怎么让回答实时显示并可以停止；
- 怎么管理上下文、Prompt、结构和成本；
- 怎么让 Agent 安全调用工具和知识库；
- 怎么证明修改后没有破坏旧功能；
- 怎么同时运行在 Web、Electron 和云端。

## 2. 三条产品线

### 2.1 普通 AI 工作台

面向日常聊天和 Week 1 基础能力。采用确定性五步工作流：

```text
输入护栏 → 上下文 → 模型生成 → 输出检查 → 保存
```

### 2.2 企业支持 Agent

面向 Week 2–9 教学。它串联：

```text
安全检查 → RAG → Tool Calling → HITL → 引用 → Trace / Eval
```

这条链路使用内置客服数据，重点是理解工程边界，不是替代真实客服系统。

### 2.3 创图工具箱

面向实际文件处理。证件照、裁剪、压缩和 Word 转 PPT 主要在浏览器执行，减少隐私文件上传和服务器带宽。

## 3. 模块地图

| 模块 | 作用 | 输入 | 输出 | 修改它会影响什么 |
|---|---|---|---|---|
| `src/config.ts` | 读取和校验运行参数 | `.env` | `AppConfig` | 模型、超时、上下文、重试和 Mock 行为 |
| `src/model-client.ts` | 统一模型协议 | Prompt、模型配置 | 流式文本和指标 | 供应商兼容、首 Token、Token 统计 |
| `src/agent-workflow.ts` | 普通聊天编排 | 用户消息、历史 | 工作流事件和回答 | 护栏、步骤顺序、重试策略 |
| `src/prompts.ts` | Prompt 版本库 | 任务和版本 | System/User Prompt | 回答边界、格式和稳定性 |
| `src/structured-output.ts` | 结构化质检 | 自然语言记录 | 已校验对象或降级结果 | JSON 可靠性和业务接入安全 |
| `src/rag-engine.ts` | 检索与引用 | 文档、问题、角色 | 命中片段、回答、指标 | 召回、权限和回答依据 |
| `src/tool-calling.ts` | 工具执行边界 | 工具请求、权限 | 工具记录和结果 | 参数校验、风险、HITL、幂等 |
| `src/agent-engine.ts` | Agent 教学运行时 | 问题和运行选项 | Trace、Checkpoint、Memory | 循环、停止和恢复演示 |
| `src/production-agent.ts` | 企业支持纵向切片 | 租户、问题、批准状态 | 带引用和 Trace 的结果 | 安全、RAG、工具和可靠性组合 |
| `src/reliability.ts` | 可靠性原语 | 请求状态 | 限流、熔断、缓存和路由决策 | 高并发与故障降级行为 |
| `src/server.ts` | Node 服务入口 | HTTP 请求 | JSON、SSE、静态页面 | 所有 Web API 和生产启动 |
| `src/cloudbase-database.ts` | 可选云端历史 | 聊天运行记录 | CloudBase 文档 | 历史保存，不影响模型回答 |
| `src/web/api.ts` | 页面通信层 | 页面请求 | 类型化 API/SSE 事件 | 前后端协议 |
| `src/web/AgentView.vue` | AI 工作台 UI | 用户操作和 SSE | 对话、指标、学习面板 | 聊天体验和本地会话 |
| `src/web/ToolboxView.vue` | 工具箱 UI | 本地文件 | 预览和下载 | 四个文件工具的操作体验 |
| `src/web/image-tools.ts` | 图片算法 | Blob、尺寸、质量 | 处理后图片 | 裁剪、压缩、证件照 |
| `src/web/document-tools.ts` | 文档转换 | `.docx` | 幻灯片和 `.pptx` | Word 转 PPT |
| `electron/` | 桌面外壳 | 同一 Vue 和 Node 服务 | 桌面应用 | 窗口、安全隔离和打包 |
| `tests/` | 回归安全网 | 源码和固定场景 | 通过/失败结果 | 防止重构破坏功能 |
| `evals/` | AI 固定考试题 | 模型、Prompt、RAG | 可重复指标 | 比较质量、速度和安全 |

## 4. 普通聊天怎么运行

```text
AgentView 输入问题
  → web/api.ts 发送当前问题和受限历史
  → server.ts 创建 runId 并打开 SSE
  → agent-workflow.ts 执行五步流程
  → model-client.ts 调用 Mock / OpenAI / Claude
  → token、workflow、metrics、done 事件携带同一 runId
  → 页面按动画帧合并 Token 并渲染
  → CloudBase 可选保存 runId、问题、回答和指标
```

关键设计：

- 浏览器和服务端都限制上下文；
- 首 Token 和完整生成分别超时；
- 只重试临时错误；
- 已经输出 Token 后不从头重试；
- 用户停止时中断模型请求和重试等待；
- 数据库失败不会撤销已经生成的回答。

## 5. 企业支持 Agent 怎么运行

```text
问题 + tenantId + role
  → Prompt Injection / 越权 / 数据泄露检查
  → 限流、熔断、缓存、预算和模型路由
  → 按租户、知识库和角色过滤 RAG 文档
  → Agent 计划、记忆、检索和工具调用
  → 高风险工具等待 approved=true
  → 返回引用、工具状态、Trace ID 和 Eval 摘要
```

这里同时展示两种方法：

- **Workflow**：步骤固定时用普通代码编排，稳定且容易测试；
- **Agent Loop**：下一步需要动态决定时才使用循环，并设置最大步数。

## 6. 工具箱怎么运行

```text
用户选择本地文件
  → 浏览器 File / Blob
  → Canvas、抠图模型、Mammoth 或 PptxGenJS
  → 页面预览
  → 浏览器下载
```

文件通常不进入 Node API。首次证件照抠图会下载浏览器模型资源；Word 转 PPT 仅对 `.docx` 有较完整支持。

## 7. Web 和 Electron 为什么能共用

```text
Web：浏览器 → Node API

Electron：
Vue 渲染进程
  → 最小 preload 桥
  → 127.0.0.1 随机端口 Node API
```

Electron 使用：

- `contextIsolation: true`；
- `nodeIntegration: false`；
- `sandbox: true`；
- 后端只监听本机地址；
- 模型密钥不进入 Vue bundle。

同一套 `startServer()` 和 Vue 页面被两端复用，避免维护两个业务实现。

## 8. 为什么没有直接堆大型框架

高 Star 项目的共同经验是：状态、工具、权限、Trace 和 Eval 比框架名称更重要。

本项目规模较小，因此用 TypeScript 明确实现核心原理：

- 普通流程保持确定性；
- Agent 教学能力独立；
- 接口和类型清楚；
- 每个模块可以单独测试；
- 只有真实复杂度需要时才引入外部运行时。

第一次学习 Agent 时先读 [Agent 小白白话指南](agent-beginner-guide.md)，再看 [Agent 工作流与高 Star 项目对照](agent-workflow.md)。

## 9. 修改功能应该去哪里

| 需求 | 修改位置 |
|---|---|
| 新增或调整运行参数 | `src/config.ts`、`.env.example`、`docs/configuration.md` |
| 新增模型供应商 | `src/model-client.ts` |
| 改普通聊天步骤 | `src/agent-workflow.ts` |
| 改 API 或 SSE | `src/server.ts`、`src/web/api.ts` |
| 改聊天页面 | `src/web/AgentView.vue` |
| 新增 Prompt 或评测题 | `src/prompts.ts`、`evals/` |
| 新增工具 | `src/tool-calling.ts` |
| 改 RAG | `src/rag-engine.ts` |
| 改 Agent Loop / MCP / Memory | `src/agent-engine.ts` |
| 改可靠性和安全 | `src/reliability.ts`、`src/production-agent.ts` |
| 改图片或文档工具 | `src/web/image-tools.ts`、`src/web/document-tools.ts` |
| 新增行为 | 同时增加 `tests/*.test.ts` |

## 10. 阅读源码的顺序

### 先理解普通聊天

```text
types.ts
  → config.ts
  → model-client.ts
  → retry.ts
  → agent-workflow.ts
  → server.ts
  → web/api.ts
  → AgentView.vue
```

### 再理解 Agent

```text
agent-beginner-guide.md
  → tool-calling.ts
  → rag-engine.ts
  → agent-engine.ts
  → reliability.ts
  → production-agent.ts
```

每读一个文件只先回答三个问题：它接收什么、返回什么、失败时怎么办。

## 11. 从修改到发布

```text
修改代码
  → npm run check
  → npm run build
  → npm run eval:learning
  → 小请求验证真实模型
  → 提交代码
  → 部署
  → 检查健康、SSE、历史和日志
```

配置看 [配置参数说明](configuration.md)，测试和故障看 [故障排查](troubleshooting.md)，发布看 [腾讯云部署](deployment.md)。

## 12. 生产化仍缺什么

- 身份认证和真实租户权限；
- 真实 Embedding、向量库和企业数据 Eval；
- Redis 或数据库中的共享 Checkpoint、限流、熔断和缓存；
- 完整 MCP SDK 与受控网络传输；
- Trace 查询、告警和审批后台；
- DLP、脱敏、审计和数据保留策略。

这些是明确边界，不应通过文案包装成已经完成。
