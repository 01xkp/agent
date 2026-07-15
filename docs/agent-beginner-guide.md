# Agent 小白白话指南

这份文档不先讲框架，也不先讲代码。它先回答最容易混淆的问题：

- Agent 到底是什么；
- 它和普通聊天、Workflow、RAG、MCP 有什么区别；
- Tool、Memory、State、HITL、Trace、Eval 分别解决什么问题；
- 这些知识在当前项目的哪个文件里；
- 当前项目哪些是真实工程能力，哪些只是教学示例。

读完后，你应该能用自己的话讲清楚：

```text
Agent 不是一个更会聊天的模型。
Agent 是一套让模型围绕目标，读取上下文、选择动作、使用工具、
观察结果并在安全边界内继续工作的系统。
```

## 怎么读这份长文档

不需要一次记住所有英文词。

如果只有 10 分钟，先读：

```text
第 1 节：客服例子
  → 第 2 节：LLM / Workflow / Agent
  → 第 4 节：Tool Calling
  → 第 5 节：RAG
  → 第 9 节：安全和人工确认
  → 第 18 节：完整退款案例
  → 第 22 节：常见误区
```

遇到某个词看不懂时，直接按下面的表查：

| 你看到的词 | 去哪里看 |
|---|---|
| Agent、Workflow、LLM | 第 2 节 |
| Agent Loop、Action、Observation | 第 3 节 |
| Tool Calling、Function Calling | 第 4 节 |
| RAG、Chunk、检索、引用 | 第 5 节 |
| Context、Memory、State | 第 6 节 |
| Planning、Routing、Reflection | 第 7 节 |
| Structured Output | 第 8 节 |
| Guardrails、Permission、HITL | 第 9 节 |
| Checkpoint | 第 10 节 |
| Log、Metrics、Trace | 第 11 节 |
| Eval | 第 12 节 |
| MCP | 第 13 节 |
| LangGraph | 第 14 节 |
| Multi-Agent | 第 15 节 |
| Timeout、Retry、Cache、熔断 | 第 16 节 |

---

## 1. 先用一个“客服员工”理解 Agent

假设用户问：

> 我的退款三天了还没到账，帮我处理一下。

一个只会聊天的大模型可能直接回答：

> 退款一般需要 1–3 个工作日，请耐心等待。

它只是根据文字生成文字，不知道真实订单，也没有执行任何操作。

一个完整 Agent 系统会这样工作：

```text
1. 看懂目标：用户不是只想了解规则，而是想查询并处理退款
2. 检查安全：用户是否在要求越权、泄露隐私或绕过规则
3. 查知识库：退款正常需要多长时间
4. 查业务数据：调用工单或订单查询工具
5. 判断下一步：是否需要生成退款操作
6. 请求人工确认：退款属于高风险写操作
7. 执行动作：确认后调用退款工具
8. 返回结果：告诉用户查到了什么、做了什么、依据是什么
9. 留下记录：保存本次运行的步骤、工具结果、耗时和错误
```

这里真正重要的不是“模型多聪明”，而是系统能不能：

- 给模型正确资料；
- 让模型只能使用允许的工具；
- 阻止危险动作；
- 在失败时停止或恢复；
- 让开发者查清楚每一步发生了什么。

---

## 2. 四个最容易混淆的概念

### 2.1 LLM：会理解和生成文字的“大脑”

LLM 是 Large Language Model，大语言模型，例如 GPT、Claude。

白话类比：

> LLM 像一个知识很多、表达能力很强，但看不到你公司数据库，也不能直接操作业务系统的大脑。

它擅长：

- 理解用户表达；
- 总结、分类和生成内容；
- 根据上下文判断可能的下一步；
- 按要求输出文本或 JSON。

它默认不具备：

- 读取你的真实订单；
- 查询最新数据库；
- 发送邮件；
- 执行退款；
- 永久记住所有用户；
- 保证每次回答都正确。

当前项目中的模型入口：

- `src/model-client.ts`：统一 OpenAI、Claude 和 Mock；
- `src/prompts.ts`：告诉模型应该扮演什么角色、遵守什么规则；
- `src/structured-output.ts`：检查模型输出是否满足程序格式。

### 2.2 普通聊天：用户问一次，模型答一次

最简单的 AI 应用是：

```text
用户问题 → Prompt → LLM → 文本回答
```

它适合：

- 改写文章；
- 总结文本；
- 翻译；
- 已经给足材料的问答。

如果任务只需要一次模型调用，就不要为了“看起来高级”强行做 Agent。复杂度会增加延迟、费用和故障点。

### 2.3 Workflow：程序提前写好的办事流程

Workflow 是固定流程。下一步由代码决定，而不是模型临时决定。

白话类比：

> Workflow 像银行柜台的标准办理清单：先验身份，再填资料，再复核，最后提交。

当前项目的普通聊天就是 Workflow：

```text
输入护栏 → 装配上下文 → 模型生成 → 输出检查 → 保存
```

代码在：

- `src/agent-workflow.ts`；
- `src/server.ts`。

虽然文件名中有 `agent`，但这条普通聊天链路本质上是确定性 Workflow。这样做更稳定，也更容易测试。

### 2.4 Agent：模型可以在边界内决定下一步

Agent 的关键不是“多调用几次模型”，而是：

> 系统给模型一个目标和一组可用动作，模型根据当前状态决定下一步做什么，程序执行动作并把结果交还给模型，直到完成或停止。

最小 Agent Loop：

```text
目标
  → 模型选择下一步动作
  → 程序校验并执行工具
  → 返回 Observation（观察结果）
  → 模型决定继续还是结束
```

LangChain 官方用一句很短的话概括：

> Agent 是“模型循环调用工具，直到任务完成”。

但生产系统还必须补上权限、超时、最大步数、人工确认、Trace 和 Eval，否则只是一个可能失控的循环。

---

## 3. Agent Loop：Agent 为什么能连续做事

Agent Loop 可以记成六个词：

```text
目标 → 上下文 → 决策 → 动作 → 观察 → 停止
```

### 3.1 目标 Goal

目标是用户最终想完成的事，例如：

- 查询退款并给出处理建议；
- 收集资料并生成研究报告；
- 修改代码并运行测试。

目标越模糊，Agent 越容易走偏。好的目标应该说明结果、边界和完成标准。

### 3.2 上下文 Context

上下文是这一步允许模型看到的材料：

- System Prompt；
- 当前问题；
- 最近聊天记录；
- RAG 检索片段；
- 工具清单；
- 工具上一次返回的结果；
- 用户、租户和权限信息。

白话类比：

> 上下文就是员工桌面上当前摆着的资料，不是公司仓库里的全部数据。

上下文不是越多越好。太多会：

- 增加 Token 费用；
- 增加首 Token 时间；
- 挤掉真正重要的信息；
- 增加敏感数据泄露风险。

当前项目可通过以下参数限制普通聊天上下文：

- `CHAT_HISTORY_MAX_MESSAGES`；
- `CHAT_HISTORY_MAX_CHARACTERS`。

### 3.3 决策 Decision

模型根据目标和当前观察结果，选择：

- 直接回答；
- 查询知识库；
- 调用某个工具；
- 请求更多信息；
- 转人工；
- 停止任务。

程序不应该读取或展示模型的隐藏思维链。工程上真正需要保存的是可验证的外部事件，例如：

- 选择了哪个工具；
- 输入参数是什么；
- 工具成功还是失败；
- 为什么进入人工确认；
- 最终输出是否通过校验。

### 3.4 动作 Action

动作是系统真正执行的事情，例如：

- 搜索文档；
- 查询工单；
- 调用第三方 API；
- 写数据库；
- 发送邮件。

模型只能“提出调用请求”。真正的执行必须由程序完成，并在执行前检查参数、权限和风险。

### 3.5 观察 Observation

Observation 是工具执行后返回给 Agent 的结果，例如：

```json
{
  "ticketId": "T-1002",
  "status": "open",
  "detail": "退款审核超过 3 个工作日"
}
```

Agent 根据这个结果决定继续查询、请求人工批准，还是生成最终回答。

### 3.6 停止 Stop

Agent 必须有明确停止条件：

- 任务已完成；
- 用户信息不足；
- 等待人工确认；
- 达到最大步骤数；
- 达到时间或 Token 预算；
- 工具连续失败；
- 用户主动取消。

当前教学运行时使用 `maxSteps` 防止无限循环，代码在 `src/agent-engine.ts`。

---

## 4. Tool Calling：给 Agent 安装“手和脚”

### 一句话

Tool Calling 是让模型按规定格式提出工具调用请求，再由程序执行。

Function Calling 是很多模型 API 使用的名称，和这里的 Tool Calling 表达的是同一类核心能力：模型生成函数名和参数，程序负责真正执行。

### 白话类比

> 模型像坐在办公室里的客服，工具像电话、订单系统和退款系统。客服可以申请使用，但不能绕过权限直接改数据库。

### 一个工具至少要说明

| 项目 | 要回答的问题 |
|---|---|
| `name` | 工具叫什么 |
| `description` | 什么时候应该用 |
| 输入 Schema | 需要哪些参数、类型是什么 |
| 输出 Schema | 返回什么格式 |
| `permissions` | 谁可以调用 |
| `effect` | 只读还是会修改数据 |
| `risk` | 风险高低 |
| `timeout` | 最长执行多久 |
| `retryable` | 失败后能否重试 |
| `idempotent` | 重复调用是否会重复产生副作用 |

当前项目在 `src/tool-calling.ts` 中定义：

- `ticket.lookup`：只读、低风险，可查询工单；
- `refund.preview`：写操作、高风险，必须人工确认。

### 常见误区

错误理解：

> Prompt 已经写了“不要越权”，所以工具是安全的。

正确做法：

> Prompt 只负责提醒；权限、参数、风险和审批必须由代码再次检查。

---

## 5. RAG：先查资料，再根据资料回答

RAG 是 Retrieval-Augmented Generation，检索增强生成。

### 一句话

> RAG 先从知识库找相关片段，再把片段交给模型回答。

### 白话类比

> 闭卷考试是普通 LLM；允许先翻指定资料再回答，就是 RAG。

基本流程：

```text
原始文档
  → 切成小块 Chunk
  → 建立索引
  → 用户提问
  → 检索相关 Chunk
  → 把问题和 Chunk 交给模型
  → 回答并附来源
```

RAG 解决的是“知识来源”问题，不等于 Agent：

- RAG 负责找资料；
- Agent 负责围绕目标选择下一步；
- Agent 可以把 RAG 当成一个工具使用。

当前项目的 `src/rag-engine.ts` 展示：

- 文档切块；
- Keyword、Vector、Hybrid 三种检索；
- `topK` 结果截取；
- 租户、知识库和角色过滤；
- 引用；
- Recall、MRR 和忠实度评测。

当前向量是哈希向量，只适合教学，不等于真实 Embedding 和向量数据库。

---

## 6. Memory、Context、State、Business Data 有什么区别

这四个词经常被混在一起。

| 概念 | 白话解释 | 例子 |
|---|---|---|
| Context | 本次模型调用桌面上的材料 | 最近 8 条消息、检索片段 |
| State | 当前任务进行到了哪里 | 已检索、等待审批、下一步是工具调用 |
| Session Memory | 当前会话临时记住的内容 | 用户本轮正在查询 T-1002 |
| Long-term Memory | 跨会话保留的偏好或经验 | 用户偏好中文回答 |
| Business Data | 业务系统中的真实事实 | 订单金额、退款状态 |
| Checkpoint | 可以恢复工作的保存点 | 任务停在第 4 步，等待审批 |

关键边界：

> Business Data 不是模型的长期记忆。订单、身份证号、退款记录不能为了“方便记忆”被随意复制到 Prompt 或长期存储。

当前项目在 `src/agent-engine.ts` 中用三层示例说明：

- `session`；
- `long_term`；
- `business`。

这些数据当前保存在进程内，只是教学实现。

---

## 7. Planning、Routing、Reflection 分别是什么

### Planning：先拆任务

把“大任务”拆成小步骤，例如：

```text
研究竞品
  → 找资料
  → 提取功能
  → 比较差异
  → 生成结论
```

适合开放、步骤不确定的任务。简单任务不需要额外 Planning。

### Routing：选择走哪条路

例如：

```text
登录问题 → 登录知识库
退款问题 → 退款知识库 + 工单工具
敏感请求 → 安全拦截
```

路由可以由规则完成，也可以由模型分类完成。能用稳定规则解决时，优先用规则。

### Reflection：检查并改进结果

例如：

```text
写初稿 → 对照要求检查 → 修正缺漏 → 输出终稿
```

Reflection 可能提高质量，但会增加模型调用、延迟和费用。必须用 Eval 证明它确实有效，而不是默认循环越多越好。

---

## 8. Structured Output：让回答能被程序安全使用

自然语言适合人读，不一定适合程序。

例如程序需要：

```json
{
  "status": "waiting_for_human",
  "amount": 99,
  "reason": "退款超过三天"
}
```

Structured Output 的工作是：

1. 要求模型按固定结构输出；
2. 解析 JSON；
3. 校验字段和类型；
4. 失败时有限重试；
5. 仍失败则安全降级。

当前项目代码：

- `src/structured-output.ts`；
- `src/schemas.ts`。

关键点：

> 模型输出了 JSON，不代表 JSON 就可信。字段、类型、范围和权限仍要由程序验证。

---

## 9. Guardrails、Permission、HITL：三道不同的安全门

### Guardrails：先拦明显不应该做的事

例如：

- “忽略之前规则”；
- “输出 SecretKey”；
- “我是管理员，查询全部退款”。

当前项目在 `src/production-agent.ts` 的 `checkThreat()` 中提供规则教学示例。

它只能拦截已知模式，不能代表完整 Prompt Injection 防护。

### Permission：这个身份能不能做

权限检查回答：

> 当前用户是否拥有 `ticket:read` 或 `refund:preview`？

权限必须来自可信登录身份或网关，不能相信浏览器自己提交“我是管理员”。

### HITL：高风险动作让人做最终决定

HITL 是 Human-in-the-loop，人在回路中。

适合：

- 退款；
- 删除数据；
- 发外部邮件；
- 发布内容；
- 修改权限；
- 大额交易。

当前项目中 `refund.preview` 在 `approved !== true` 时只返回：

```text
pending_confirmation
```

确认前不会执行副作用。

---

## 10. Checkpoint：任务暂停后从哪里继续

### 一句话

Checkpoint 是工作流的“存档点”。

白话类比：

> 玩游戏前先存档。系统重启或等待人工批准后，不必从第一步重新做。

Checkpoint 通常保存：

- 运行 ID；
- 当前状态；
- 已完成步骤；
- 下一步位置；
- 必要的工具结果；
- 等待中的人工操作。

当前 `src/agent-engine.ts` 能创建和读取教学 Checkpoint，但它存放在内存中，进程重启后不会恢复。生产环境应使用数据库或共享存储。

---

## 11. Trace、Log、Metrics：为什么 Agent 做错时能查原因

### Log

记录某个时间发生了一件事，例如：

```text
12:00:01 请求进入
12:00:02 工具调用失败
```

### Metrics

统计数字，例如：

- 请求量；
- 首 Token 延迟；
- 总耗时；
- 工具错误率；
- Token 和费用。

### Trace

把一次运行的全部步骤串起来：

```text
traceId / runId
  → 输入检查
  → RAG
  → ticket.lookup
  → 等待人工确认
  → 最终回答
```

白话类比：

> Log 是一张张监控照片，Metrics 是统计报表，Trace 是一次任务从头到尾的行车记录仪。

当前项目：

- 普通聊天使用 `runId` 关联 SSE 事件和 CloudBase 记录；
- 企业支持 Agent 使用 `traceId`；
- `src/agent-engine.ts` 保存教学 Trace 事件。

项目不会展示模型隐藏思维链，只记录可观察、可验证的系统事件。

---

## 12. Eval：给 Agent 建一套固定考试

Agent “这次看起来回答不错”不等于系统可靠。

Eval 是固定评测：

```text
固定输入
  → 运行系统
  → 检查输出、步骤、工具和安全结果
  → 和历史版本比较
```

可以评什么：

| 对象 | 例子 |
|---|---|
| 最终回答 | 是否正确、完整、有引用 |
| RAG | Recall、MRR、忠实度 |
| 工具 | 是否选对工具、参数是否正确 |
| Agent | 是否完成任务、平均步骤数 |
| 安全 | 是否拦截注入、越权和泄露 |
| 性能 | 首 Token、总耗时、Token 和费用 |

Trace 用于回答“这一次为什么失败”，Eval 用于回答“修改后整体是变好还是变坏”。

当前项目运行：

```bash
npm run eval:learning
```

当前数据集很小，结果只代表仓库内固定样例，不代表真实企业效果。

---

## 13. MCP：工具接入的“通用插口”

MCP 是 Model Context Protocol。

官方最容易理解的比喻是：

> MCP 像 AI 应用的 USB-C 接口。

没有统一协议时，每个 AI 应用都要分别对接数据库、文件、搜索和业务工具。

MCP 希望统一：

```text
AI 应用（Host）
  → MCP Client
  → MCP Server
  → Tools / Resources / Prompts
```

MCP 解决“怎么标准化连接外部能力”，它不负责：

- 决定业务流程；
- 自动保证权限安全；
- 自动完成 Agent Planning；
- 自动保证工具结果正确。

MCP 和 Tool Calling 的关系：

- Tool Calling：模型请求调用工具的能力；
- MCP：一种标准化暴露和连接这些工具的协议。

当前 `src/agent-engine.ts` 只实现了进程内的：

```text
tools/list
tools/call
```

它用于理解协议思想，不是完整 MCP SDK，也没有网络传输、能力协商和认证。

---

## 14. LangGraph：把有状态流程画成“节点和箭头”

LangGraph 的三个核心词：

| 概念 | 白话解释 |
|---|---|
| State | 全流程共享的工作记录 |
| Node | 做一件具体事情的函数 |
| Edge | 决定下一步去哪 |

例如：

```text
[读取问题]
    ↓
[判断意图] ──登录──> [查登录知识库]
    │
   退款
    ↓
[查退款工单] → [人工确认] → [回答]
```

LangGraph 适合：

- 有分支；
- 有循环；
- 会暂停；
- 需要恢复；
- 运行时间较长；
- 状态比较复杂。

不适合为了三步固定流程强行引入。当前项目的 Python 教学示例在：

```text
services/fastapi-teaching/langgraph_demo.py
```

---

## 15. Multi-Agent：不是 Agent 越多越高级

Multi-Agent 是多个 Agent 分工，例如：

```text
研究 Agent → 找资料
分析 Agent → 比较数据
写作 Agent → 生成报告
审核 Agent → 检查事实
```

它可能适合：

- 不同角色需要不同工具和权限；
- 子任务可以独立评测；
- 一个 Agent 的上下文已经过大；
- 多个专业领域确实需要分工。

它也会带来：

- 更多 Token 和费用；
- 更长延迟；
- 重复上下文；
- Agent 之间传错信息；
- 更难定位责任；
- 更复杂的权限边界。

判断是否需要 Multi-Agent 的顺序：

```text
一次模型调用够不够？
  → 固定 Workflow 够不够？
  → 单 Agent + Tools 够不够？
  → Eval 是否证明必须分工？
  → 最后才考虑 Multi-Agent
```

当前项目没有为了展示概念强行堆多个 Agent，这是有意的工程取舍。

---

## 16. Reliability：为什么演示能跑不等于生产可用

生产 Agent 还要面对：

- 模型超时；
- 第三方 API 故障；
- 重复执行写操作；
- 并发过高；
- 成本失控；
- 无限循环；
- 缓存串租户；
- 服务重启。

常见控制：

| 能力 | 白话解释 | 当前项目 |
|---|---|---|
| Timeout | 超过时间就停止 | 模型、工作流和工具均有限时 |
| Retry | 临时失败后有限重试 | 已输出 Token 后不重试整段回答 |
| Idempotency | 重复请求不重复扣款或退款 | 高风险工具使用幂等键 |
| Rate Limit | 单位时间请求过多则拒绝 | 单进程滑动窗口 |
| Circuit Breaker | 下游连续失败后暂时停止调用 | 单进程熔断器 |
| Cache | 相同结果短时间复用 | 单进程 TTL 缓存 |
| Budget | 限制步骤、Token、时间和费用 | `maxSteps`、Token 与延迟预算 |

当前实现适合教学。真实多实例部署应把限流、缓存、熔断和 Checkpoint 放到 Redis 或数据库等共享系统。

---

## 17. Streaming：Agent 为什么要边做边告诉用户

长任务如果一直显示“加载中”，用户不知道系统卡住还是仍在工作。

SSE 流式事件可以展示：

```text
正在检查输入
正在装配上下文
正在生成
第一个 Token 到达
生成完成
指标完成
数据保存完成
```

当前普通聊天事件：

- `workflow`；
- `token`；
- `metrics`；
- `done`；
- `error`。

同一次请求共享一个 `runId`，页面和服务端可以确认这些事件属于同一轮运行。

Streaming 只改善反馈体验，不会自动让模型计算更快。首 Token 慢仍需要检查模型、网络、上下文和重试策略。

---

## 18. 用退款问题串起所有知识点

```text
用户：“退款超过三天了，帮我处理”
```

### 第一步：Guardrail

检查是否有 Prompt Injection、越权或敏感数据请求。

对应：

```text
src/production-agent.ts → checkThreat()
```

### 第二步：Reliability Decision

检查限流、熔断、缓存、Token 预算和模型路由。

对应：

```text
src/production-agent.ts → makeReliabilityDecision()
src/reliability.ts
```

### 第三步：RAG

在当前租户和角色允许的知识库中检索退款规则。

对应：

```text
src/rag-engine.ts
```

### 第四步：Agent State 和 Memory

保存当前问题、业务边界和任务进度。

对应：

```text
src/agent-engine.ts → createLayeredMemory()
```

### 第五步：Tool Calling

先调用只读工具 `ticket.lookup` 查询工单。

对应：

```text
src/tool-calling.ts
```

### 第六步：HITL

`refund.preview` 是高风险写操作。没有 `approved=true` 时进入等待状态。

### 第七步：Checkpoint

记录任务停在哪里，理论上批准后可以继续。

### 第八步：Answer + Citation

返回知识库依据、工具状态和下一步说明。

### 第九步：Trace + Eval

生成 `traceId`，统计检索和 Agent 结果，便于调试和回归。

这就是完整 Agent 工程，而不是“让模型多回答几次”。

---

## 19. 当前项目的 Agent 能力地图

| 想理解什么 | 先读哪个文件 | 当前实现程度 |
|---|---|---|
| 普通聊天 Workflow | `src/agent-workflow.ts` | 真实运行 |
| 模型接入和流式 Token | `src/model-client.ts` | 真实运行 |
| SSE 和 `runId` | `src/server.ts`、`src/web/api.ts` | 真实运行 |
| Tool Schema、权限和 HITL | `src/tool-calling.ts` | 教学数据，真实控制逻辑 |
| RAG、引用和 Retrieval Eval | `src/rag-engine.ts` | 教学数据和哈希向量 |
| Agent Loop、Memory、Checkpoint | `src/agent-engine.ts` | 规则驱动教学运行时 |
| MCP | `src/agent-engine.ts` | 最小进程内示例 |
| 企业支持纵向流程 | `src/production-agent.ts` | 教学组合流程 |
| 限流、熔断和缓存 | `src/reliability.ts` | 单进程教学实现 |
| LangGraph | `services/fastapi-teaching/langgraph_demo.py` | Python 教学示例 |
| Agent 页面 | `src/web/AgentView.vue` | 真实页面 |
| 固定评测 | `evals/`、`src/learning-evaluate.ts` | 小型可重复数据集 |

需要特别说明：

> `runResearchAgent()` 当前按代码定义的步骤运行，并根据问题选择退款或普通查询分支。它用于讲清 Agent 的状态、工具、HITL、Checkpoint 和 Trace，不是让真实 LLM 自主生成计划和工具调用的生产运行时。

---

## 20. 修改哪些参数会改变 Agent 行为

| 参数 | 调大后 | 调小后 |
|---|---|---|
| `CHAT_HISTORY_MAX_MESSAGES` | 模型看到更多对话，Token 和延迟增加 | 更快更省，但可能忘记前文 |
| `CHAT_HISTORY_MAX_CHARACTERS` | 允许更长上下文，费用和泄露面增加 | 更容易截断长消息 |
| `CHAT_MAX_ATTEMPTS` | 临时故障恢复机会增加，最坏等待更长 | 更快失败，恢复能力下降 |
| `CHAT_RETRY_BASE_DELAY_MS` | 降低连续冲击下游，恢复等待变长 | 重试更快，也可能持续压迫故障服务 |
| `FIRST_TOKEN_TIMEOUT_MS` | 更能容忍慢模型 | 更快提示超时 |
| `MODEL_TIMEOUT_MS` | 长回答更容易完成 | 更快释放资源，长回答可能中断 |
| `MAX_OUTPUT_TOKENS` | 回答可能更完整，也更慢更贵 | 更省，但可能被截断 |
| `TEMPERATURE` | 表达更多样，结果波动更大 | 更稳定，但不保证事实正确 |
| `maxSteps` | Agent 可执行更多轮，成本和失控风险增加 | 更安全省钱，复杂任务可能没做完 |
| `topK` | RAG 带回更多片段，也可能增加噪声 | 上下文更精简，也可能漏掉依据 |

环境变量的完整默认值和风险见 [配置参数说明](configuration.md)。

---

## 21. 常见英文词小词典

| 词 | 白话解释 |
|---|---|
| Agentic AI | 使用迭代、工具和多步骤流程完成任务的 AI 应用方式 |
| Agentic Workflow | 带有模型决策或迭代能力的工作流，不代表完全自主 |
| Harness | 包在模型外面的运行外壳，包括 Prompt、Tools、Memory 和中间件 |
| Orchestration | 编排多个步骤、工具或 Agent 的执行顺序 |
| Handoff | 一个 Agent 把任务和必要上下文交给另一个 Agent |
| ReAct | Reason + Act 的模式：决定动作、执行动作、观察结果、继续判断 |
| Function Calling | Tool Calling 的常见 API 名称 |
| Schema | 程序约定的数据结构和字段类型 |
| Token | 模型处理文本的计量单位，不完全等于一个汉字或一个单词 |
| Chunk | 为了检索而切分出来的一小段文档 |
| Embedding | 把文本转换成可比较语义相似度的数字向量 |
| `topK` | 检索时最多取回前 K 个结果 |
| Recall | 应该找到的资料中，实际找到了多少 |
| MRR | 第一个正确结果排得有多靠前 |
| Faithfulness | 回答是否忠于检索到的依据 |
| Latency | 从请求到结果所花的时间 |
| First Token | 流式回答中用户第一次看到文字的时间 |
| Side Effect | 会改变外部状态的操作，例如退款、删除或发邮件 |
| Idempotency | 同一个请求重复执行，也不会重复产生副作用 |
| Sandbox | 隔离的受控执行环境，用来降低代码或工具运行风险 |

---

## 22. 十个常见误区

1. **用了大模型就是 Agent**  
   不是。一次问答只是模型调用。

2. **调用两次模型就是 Agent**  
   不一定。固定的两次调用更像 Workflow。

3. **Agent 会自动知道公司数据**  
   不会。必须通过 RAG、API 或工具安全提供。

4. **RAG 就是 Memory**  
   不是。RAG 查知识库，Memory 保存会话或长期信息。

5. **MCP 就是 Agent**  
   不是。MCP 是连接外部能力的协议。

6. **Prompt 写了规则就安全**  
   不够。权限和副作用必须由代码控制。

7. **多 Agent 一定比单 Agent 好**  
   不一定。它通常更慢、更贵、更难调试。

8. **循环越多结果越好**  
   不一定。可能只是重复消耗 Token。

9. **最终回答正确就代表过程正确**  
   不一定。可能调用了错误工具或越过权限，需要 Trace。

10. **Demo 能运行就能上生产**  
    不成立。还需要真实身份、共享状态、监控、Eval、安全和运维。

---

## 23. 推荐学习顺序

### 第一阶段：只理解概念

```text
LLM
  → Workflow 和 Agent 的区别
  → Agent Loop
  → Tool Calling
  → RAG
```

### 第二阶段：理解可控性

```text
State / Memory
  → Permission
  → HITL
  → Checkpoint
  → Timeout / Retry / Idempotency
```

### 第三阶段：理解质量

```text
Trace
  → Eval
  → RAG 指标
  → Red Team
  → 成本和延迟
```

### 第四阶段：再学习框架

```text
LangGraph
  → MCP
  → Agents SDK
  → Multi-Agent
```

先理解问题，再学习框架。否则容易记住 API，却说不清为什么要用。

---

## 24. 推荐文章和官方课程

以下资料用于复核本文概念。建议按顺序阅读。

### 1. Anthropic：Building Effective Agents

链接：<https://www.anthropic.com/engineering/building-effective-agents>

推荐原因：

- 清楚区分 Workflow 和 Agent；
- 强调从最简单方案开始；
- 解释顺序、路由、并行、编排和 Evaluator-Optimizer；
- 明确 Agent 会用延迟和成本换取灵活性。

### 2. Microsoft：AI Agents for Beginners 中文课程

链接：<https://microsoft.github.io/ai-agents-for-beginners/translations/zh-CN/>

推荐原因：

- 有简体中文；
- 从 Agent 定义讲到工具、Agentic RAG、规划、多 Agent、MCP、Memory 和生产部署；
- 每节有文字、短视频和代码。

### 3. Hugging Face：Agents Course

链接：<https://huggingface.co/learn/agents-course/en/unit1/introduction>

推荐原因：

- 用 Thought、Action、Observation 解释 Agent Loop；
- 有练习和测验；
- 后续覆盖 smolagents、LlamaIndex 和 LangGraph。

### 4. OpenAI：A Practical Guide to Building Agents

链接：<https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf>

推荐原因：

- 说明什么场景值得做 Agent；
- 从模型、工具、指令和编排讲到 Guardrails；
- 适合建立产品和工程判断。

### 5. LangGraph：Thinking in LangGraph

链接：<https://docs.langchain.com/oss/python/langgraph/thinking-in-langgraph>

推荐原因：

- 用 Node、Edge、State 拆解真实流程；
- 解释哪些步骤适合普通代码，哪些适合 LLM；
- 适合理解 Checkpoint 和 HITL。

### 6. MCP 官方介绍

链接：<https://modelcontextprotocol.io/introduction>

推荐原因：

- 使用“AI 应用的 USB-C”类比；
- 讲清 Host、Client、Server；
- 可以避免把 MCP 错当成 Agent 框架。

### 7. Lilian Weng：LLM Powered Autonomous Agents

链接：<https://lilianweng.github.io/posts/2023-06-23-agent/>

推荐原因：

- 系统梳理 Planning、Memory 和 Tool Use；
- 内容较深入，建议理解前六份资料后再读。

---

## 25. 推荐高热度视频

播放量和点赞数会持续变化。以下数字是 **2026-07-15 查询时的页面公开近似值**，只用于帮助选择，不代表质量排名。

### 英文但容易理解

1. [IBM Technology：What are AI Agents?](https://www.youtube.com/watch?v=F8NKVhkZZWI)  
   约 170 万播放、3.19 万点赞，12 分钟。适合第一次理解 LLM、工具、RAG 和 Agent 的关系。

2. [Andrew Ng：What's next for AI agentic workflows](https://www.youtube.com/watch?v=sal78ACtGTc)  
   约 41 万播放、9300 点赞，14 分钟。用“写文章不能一口气完成”的类比解释 Reflection、Tool Use、Planning 和 Multi-Agent。

3. [Microsoft：Full Course - AI Agents for Beginners](https://www.youtube.com/watch?v=OhI005_aJkA)  
   约 49.2 万播放、6400 点赞，64 分钟。十节课连贯讲解 Agent、工具、Agentic RAG、规划、多 Agent 和生产部署。

### 中文辅助

4. [吴恩达《Agentic AI》中英双语课程](https://www.bilibili.com/video/BV1aaxyz8ELY/)  
   约 22.1 万播放、1709 点赞、8172 收藏。覆盖 Reflection、Tool Use、Eval、Planning 和 Multi-Agent。该链接为 B 站非官方整理版，版权和可用性以平台页面为准；官方课程在 [DeepLearning.AI](https://www.deeplearning.ai/courses/agentic-ai)。

5. [技术爬爬虾：MCP 是啥？技术原理是什么？](https://www.bilibili.com/video/BV1AnQNYxEsy/)  
   约 41.7 万播放、1.28 万点赞、2.42 万收藏，15 分钟。适合在理解 Tool Calling 后学习 MCP。

看视频时不要只记框架操作。每看完一节都尝试回答：

```text
这个知识解决什么问题？
不用它会怎样？
它增加了什么成本和风险？
当前项目的哪个文件体现了它？
```

---

## 26. 在本项目中动手练习

### 练习 1：看懂 Workflow

1. 打开 `src/agent-workflow.ts`；
2. 找到输入检查、上下文、生成、校验和保存；
3. 运行 `npm run dev`；
4. 在页面观察 `workflow` 和 `token` 事件。

### 练习 2：看懂工具安全

1. 打开 `src/tool-calling.ts`；
2. 比较 `ticket.lookup` 和 `refund.preview`；
3. 找出权限、风险、副作用、超时和幂等设置；
4. 运行对应自动测试。

### 练习 3：看懂 Agent 和 HITL

1. 阅读 `runResearchAgent()`；
2. 用普通问题观察完成状态；
3. 用退款问题观察 `waiting_for_human`；
4. 将 `approved` 设为 `true`，比较工具状态。

### 练习 4：看懂 RAG Eval

1. 打开 `evals/rag-cases.jsonl`；
2. 查看每个问题预期命中哪个 Chunk；
3. 运行 `npm run eval:learning`；
4. 修改一条文档后比较 Recall、MRR 和忠实度。

### 练习 5：向生产设计升级

思考如何替换：

- 内存 Checkpoint → 数据库；
- 哈希向量 → Embedding + 向量数据库；
- 请求里的 `tenantId` → 登录令牌中的可信身份；
- 规则安全检查 → 分类器、DLP 和持续 Red Team；
- 单进程限流 → Redis 或 API Gateway。

能说清这些替换，才算真正理解了当前教学实现与生产系统的差距。
