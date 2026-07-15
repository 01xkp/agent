# Week 2–Week 9 小白实战指南

这份文档不要求你先懂所有名词。先把项目跑起来，再按周理解代码。

## 先看最终结果

现在项目里有一条完整的企业客服 Agent 链路：

```text
用户问题
  → 安全与权限检查
  → RAG 检索知识库
  → 判断是否调用业务工具
  → 高风险操作等待人工确认
  → 返回带来源的回答
  → 记录 Trace 和 Eval 指标
```

没有模型 Key 也能运行。教学功能使用固定知识文档、本地哈希向量和 Mock 数据，方便重复测试。

## 1. 一次跑完

### Node / Vue 主项目

```bash
npm install
npm run check
npm run build
npm run eval:learning
npm run dev
```

页面打开后：

1. 点击左侧 `Week 2-9`；
2. 在右侧打开“学习闭环”；
3. 查看 Week 交付矩阵、RAG 指标、工具状态、引用和 Trace。

### Python / FastAPI 教学服务

```bash
python -m pip install -r services/fastapi-teaching/requirements.txt
npm run python:check
npm run python:test
python -m uvicorn main:app --app-dir services/fastapi-teaching --port 8000
```

浏览器打开 `http://127.0.0.1:8000/docs`，可以直接试用 FastAPI 自动生成的接口页面。

> FastAPI 是独立教学服务，不替换现有 Node 主服务，也不会影响腾讯云上的主项目。

## 2. 每周完成了什么

| 周 | 小白理解 | 主要代码 | 验证 |
|---|---|---|---|
| Week 2 | 让 Agent 真正调用工具，而不是口头说“已调用” | `src/tool-calling.ts`、`services/fastapi-teaching/main.py` | `tests/tool-calling.test.ts`、`npm run python:test` |
| Week 3 | 把文档切成小块并搜索相关内容 | `src/rag-engine.ts` | `tests/rag-engine.test.ts` |
| Week 4 | 用数字判断 RAG 好不好，并隔离不同知识库 | `src/rag-engine.ts`、`evals/rag-cases.jsonl` | Recall、MRR、忠实度 |
| Week 5 | 实现 Agent 循环、停止条件、恢复点和 LangGraph | `src/agent-engine.ts`、`langgraph_demo.py` | `tests/agent-engine.test.ts`、Python 测试 |
| Week 6 | 高风险操作等待人确认，并区分三类记忆 | `src/agent-engine.ts`、`src/tool-calling.ts` | HITL、Memory、MCP 测试 |
| Week 7 | 在 UI 中看到步骤、工具、引用、等待和 Trace | `src/web/AgentView.vue` | Vue 类型检查和自动化测试 |
| Week 8 | 增加限流、熔断、缓存、超时、安全和 Red Team | `src/reliability.ts`、`src/production-agent.ts` | `tests/reliability.test.ts`、安全 Eval |
| Week 9 | 串起企业智能支持 Agent 并形成作品集材料 | `src/production-agent.ts`、`docs/enterprise-support-agent.md` | API、Eval、构建和部署文档 |

## 3. Week 2：Tool Calling

Tool Calling 可以理解为：模型提出“我要调用哪个工具和传什么参数”，程序负责检查和执行。

本项目内置两个教学工具：

```text
ticket.lookup
  只读、低风险、需要 ticket:read 权限

refund.preview
  写操作、高风险、需要 refund:preview 权限
  approved !== true 时只能进入 pending_confirmation
```

程序在执行前会检查：

1. 工具是否存在；
2. 调用者是否有权限；
3. 输入参数是否正确；
4. 是否属于高风险副作用；
5. 是否超时；
6. 错误是否允许重试；
7. 幂等键是否已执行过；
8. 输出结构是否符合约定。

关键入口：

```ts
runToolLoop(requests, { maxRetries: 1 })
```

## 4. Week 3–4：RAG 与 Eval

RAG 是“先查资料，再回答”，不是让模型凭记忆猜。

```text
文档
  → 分句和切块
  → 生成本地 64 维哈希向量
  → Keyword / Vector / Hybrid 检索
  → 按租户、知识库和角色过滤
  → 返回答案和引用
```

三种检索：

- `keyword`：看关键词是否重合；
- `vector`：比较本地向量余弦相似度；
- `hybrid`：把两种分数合并。

三个指标：

- **Recall**：应该找出的资料，找出了多少；
- **MRR**：第一个正确资料排得是否靠前；
- **忠实度**：回答是否能被检索片段支持。

运行固定评测：

```bash
npm run eval:learning
```

当前固定教学数据结果为：

```text
Recall = 1
MRR = 1
忠实度 = 1
Red Team 拦截 = 3 / 3
```

这些数字只代表仓库里的小型固定数据集，不代表真实企业数据上的生产效果。

## 5. Week 5–7：Agent、HITL、Memory、MCP 和 UI

如果下面的术语仍然抽象，先读 [Agent 小白白话指南](agent-beginner-guide.md)。它用同一个退款案例解释 Agent Loop、Tool、RAG、Memory、HITL、Checkpoint、MCP、Trace 和 Eval。

### Agent Loop

```text
计划
  → 写入会话记忆
  → RAG 检索
  → 调用工具
  → 输出回答
```

`maxSteps` 防止无限循环，`interruptAfterStep` 用于主动中断，`checkpoint` 保存恢复位置。

### 五类 Workflow

- 顺序：A 完成后执行 B；
- 并行：互不依赖的任务一起执行；
- 路由：根据条件选择不同分支；
- 循环：结果不合格时有限次重试；
- 编排：主 Agent 把子任务分给不同节点。

Python 示例使用真实 `langgraph` 包，把 `plan → retrieve → answer` 表达为状态节点，并用内存 Checkpointer 保存线程状态。

### 三类 Memory

- `session`：只服务当前对话；
- `long_term`：跨会话偏好或经验；
- `business`：订单、退款、工单等真实业务数据。

业务数据不等于长期记忆，Agent 不能把业务数据随意复制到长期记忆。

### 最小 MCP

`handleMcpMessage()` 支持：

```text
tools/list
tools/call
```

这是用于理解 MCP 思想的进程内最小 JSON-RPC 风格实现，不是完整 MCP SDK，也没有实现网络传输、能力协商和资源协议。

## 6. Week 8：可靠性和安全

`src/reliability.ts` 提供：

- 滑动窗口限流；
- 连续失败熔断；
- TTL 缓存；
- 延迟预算和超时；
- 快速/智能/Mock 模型路由。

工具运行时还提供有限重试、幂等和错误分类。

安全检查不是只写在 Prompt 里。`checkThreat()` 会在代码层拦截：

- “忽略规则”类 Prompt Injection；
- 越权查询；
- SecretKey、身份证号、完整手机号等敏感信息请求。

固定攻击数据位于：

```text
evals/red-team-cases.jsonl
```

## 7. Week 9：企业智能支持 Agent

API：

```text
GET  /api/learning/week2-9
POST /api/support-agent
```

请求示例：

```json
{
  "message": "退款超过三天没有完成怎么办？",
  "approved": false,
  "tenantId": "csfan"
}
```

第一次请求会返回等待人工确认状态。确认参数和影响后，再将 `approved` 改为 `true`。

## 8. 教学版与生产版的边界

当前已经真实实现代码、测试和接口，但以下部分仍是教学规模：

- 本地哈希向量用于离线演示，不是真实 Embedding 模型；
- 文档和业务工具使用内置 Mock 数据；
- MCP 是进程内最小协议，不是完整 SDK 服务；
- Node Agent 的 Checkpoint 在内存中，进程重启后不会恢复；
- 限流、熔断和 TTL 缓存在单进程内，多实例部署应改用 Redis 等共享存储；
- 安全规则是最小基线，生产环境仍需身份认证、租户策略、脱敏和审计平台；
- UI 目前展示学习闭环，未实现完整审批工作台和 Trace 检索后台。

不要把这些教学实现描述成“已经达到大型企业生产级”。

## 9. 推荐学习顺序

```text
先跑 npm run eval:learning
  → 看 tool-calling.ts
  → 看 rag-engine.ts
  → 看 agent-engine.ts
  → 看 production-agent.ts
  → 看 AgentView.vue
  → 最后运行 FastAPI 和 LangGraph 示例
```

继续阅读：

- [Python + FastAPI 指南](python-fastapi-guide.md)
- [企业智能支持 Agent：架构、运维、作品集与面试](enterprise-support-agent.md)
- [Agent 小白白话指南：概念、类比、源码和推荐课程](agent-beginner-guide.md)
- [统一故障排查](troubleshooting.md)
