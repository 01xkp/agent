# Agent 工作流与高 Star 项目设计对照

如果你还不能用一句话解释 Agent、Workflow、RAG、Tool Calling、Memory、MCP、HITL、Trace 和 Eval，请先读：

> [Agent 小白白话指南](agent-beginner-guide.md)

本文不重复解释每个名词，重点回答两个工程问题：

1. 高 Star Agent 项目为什么这样设计；
2. 当前项目采用了什么、没有采用什么，以及为什么。

---

## 1. 三十秒看懂它们的关系

```text
LLM：负责理解和生成

Workflow：代码决定固定步骤

Agent：模型在安全边界内决定下一步

RAG / Tools / Memory：Agent 可以使用的能力

Guardrails / Permission / HITL：限制 Agent 能做什么

State / Checkpoint：记录 Agent 做到哪里

Trace / Eval：解释 Agent 做了什么，并证明修改是否更好

MCP：标准化连接外部工具和数据
```

不是所有 AI 功能都应该做成 Agent。Anthropic 的公开实践明确建议从最简单方案开始：一次模型调用够用，就不要先上 Agent；固定步骤够用，就先用 Workflow。

---

## 2. 高 Star 项目分别在解决什么

Star 数会变化。这里比较的是长期有效的设计思想，不按 Star 数给框架排质量名次。

| 项目 | 它主要解决什么 | 白话理解 | 当前项目学了什么 |
|---|---|---|---|
| [Dify](https://github.com/langgenius/dify) | 可视化 Workflow、RAG、模型和应用管理 | 用画流程图的方式搭 AI 应用 | 普通聊天步骤明确、状态可见、模型与业务分层 |
| [LangGraph](https://github.com/langchain-ai/langgraph) | 长时间、有状态、可暂停恢复的 Agent | 把工作拆成节点，用状态和箭头连接 | 教学 Agent 有 State、最大步数、Checkpoint 和 HITL |
| [OpenHands](https://github.com/OpenHands/OpenHands) | 软件开发 Agent 的事件流和隔离运行环境 | AI 提出动作，受控环境执行，再返回观察结果 | SSE 区分事件；Electron 渲染进程不直接获得 Node 权限 |
| [CrewAI](https://github.com/crewAIInc/crewAI) | Flow、Crew 和多角色协作 | 固定流程用 Flow，需要分工时才组团队 | 不为简单任务强行增加多个 Agent |
| [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) | Tools、Handoffs、Guardrails、Sessions 和 Tracing | 给 Agent 提供运行外壳和可观察记录 | 工具 Schema、权限、HITL、运行 ID 和 Trace |
| [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) | 多提供商、事件驱动、工作流和 Agent 编排 | 面向企业集成的 Agent 运行框架 | 保持模型接口、业务流程和运行状态分层 |

AutoGen 的历史设计仍有学习价值，但官方仓库已进入维护模式。新项目应优先评估 Microsoft Agent Framework，而不是只因 AutoGen 过去 Star 多就直接选它。

---

## 3. 高 Star 项目共同强调的七条原则

### 3.1 固定任务先用 Workflow

例如：

```text
检查输入 → 调模型 → 校验输出 → 保存
```

这条路径没有必要让模型每次重新决定。代码更快、更便宜、更容易测试。

当前对应：

```text
src/agent-workflow.ts
```

### 3.2 动态任务才进入 Agent Loop

只有下一步会根据环境变化时，Agent Loop 才有价值。例如：

```text
查询工单后发现已关闭 → 直接回答
查询工单后发现退款超时 → 请求退款工具和人工确认
```

进入循环后必须设置：

- 最大步骤数；
- 超时；
- Token 或费用预算；
- 工具权限；
- 停止条件。

### 3.3 模型提出动作，程序决定能否执行

模型可以请求调用 `refund.preview`，但程序仍要检查：

- 工具是否存在；
- 参数是否符合 Schema；
- 用户是否有权限；
- 是否属于写操作；
- 是否需要人工确认；
- 是否有幂等键；
- 是否超时。

当前对应：

```text
src/tool-calling.ts
```

### 3.4 Context、Memory、Business Data 和 Checkpoint 要分开

错误做法：

> 把聊天、用户偏好、订单数据、工具结果和全部文档都塞进 Prompt。

正确做法：

- Context：本次模型需要看到的材料；
- Memory：允许保存的会话或长期信息；
- Business Data：从业务系统按权限读取；
- Checkpoint：工作流恢复状态。

分开后更容易控制费用、权限、数据生命周期和故障恢复。

### 3.5 高风险动作必须有 HITL

退款、删除、发布、转账、改权限等动作不能只依赖模型判断。

当前 `refund.preview` 在未确认时返回：

```text
pending_confirmation
```

只有 `approved=true` 才继续执行。

### 3.6 只记录可验证事件，不展示隐藏思维链

页面应该展示：

- 当前处于哪个步骤；
- 选择了哪个工具；
- 工具成功还是失败；
- 是否等待人工确认；
- 最终耗时和错误。

页面不需要也不应该伪造或泄露模型隐藏思维链。

### 3.7 Trace 和 Eval 先于 Multi-Agent

增加第二个 Agent 前，先回答：

- 当前单 Agent 成功率是多少；
- 哪一步失败最多；
- 工具错误率是多少；
- RAG 是否找对资料；
- 多 Agent 是否真的比单 Agent 更好。

没有固定 Eval，多 Agent 只会让系统看起来更复杂，却无法证明更有效。

---

## 4. 当前项目实际有三种不同流程

### 4.1 普通聊天：确定性 Workflow

```text
guardrail → context → generate → validate → persist
```

代码：

- `src/agent-workflow.ts`；
- `src/server.ts`；
- `src/model-client.ts`。

它支持：

- OpenAI、Claude 和 Mock；
- SSE 流式 Token；
- 首 Token 和总超时；
- 有限重试；
- 受限聊天历史；
- `runId`；
- 可选 CloudBase 保存。

这条链路是真实可运行的 Workflow，不是自主 Agent。

### 4.2 Research Agent：规则驱动教学运行时

```text
plan → memory → retrieve → tool → answer
```

代码：

```text
src/agent-engine.ts
```

它用于演示：

- 最大步骤数；
- 中断；
- Checkpoint；
- 三层 Memory；
- RAG；
- Tool Calling；
- HITL；
- Trace；
- Agent Eval。

需要诚实说明：

> 当前 `runResearchAgent()` 的步骤主要由 TypeScript 代码写好，并根据问题选择工具分支。它不是由真实 LLM 自主生成计划和工具请求的生产 Agent。

这种实现适合学习每个部件的作用，也方便固定测试。

### 4.3 企业支持 Agent：教学纵向切片

```text
安全检查
  → 限流 / 熔断 / 缓存 / 预算 / 路由
  → 多知识库 RAG
  → Research Agent
  → Tool Calling
  → HITL
  → 引用、Trace 和 Eval
```

代码：

```text
src/production-agent.ts
```

它把 Week 2–9 的知识串成一条链，但仍使用：

- 内置客服知识；
- 哈希向量；
- 请求参数中的教学身份；
- 单进程 Checkpoint、限流、熔断和缓存；
- 最小进程内 MCP。

因此它是“真实代码组成的教学系统”，不是已经满足企业生产要求的客服平台。

---

## 5. 为什么本项目现在不引入完整 Agent 框架

当前项目的目标是让学习者看清原理。如果直接引入大型框架，很多关键行为会隐藏在框架内部：

- State 为什么存在；
- Tool 权限在哪里检查；
- HITL 为什么必须在代码层；
- Checkpoint 保存什么；
- Trace 如何关联一次运行；
- Eval 在比较什么。

当前规模下，显式 TypeScript 实现有三个好处：

1. 每个知识点都能找到对应源码；
2. 每个模块都能独立测试；
3. 以后引入框架时能判断它替代了哪一层。

什么时候值得升级：

- 流程出现大量分支和循环；
- 任务需要长时间暂停和恢复；
- Checkpoint 必须持久化；
- 多个 Agent 需要 Handoff；
- 自己维护状态机的成本已经明显升高。

---

## 6. 选择方案的白话决策树

```text
任务只要生成、总结、分类？
  └─ 是 → 一次模型调用

步骤固定，代码能明确写出先后顺序？
  └─ 是 → Workflow

下一步必须根据工具结果动态决定？
  └─ 是 → 单 Agent + Tools

任务需要暂停、分支、循环和恢复？
  └─ 是 → 考虑 LangGraph 等有状态运行时

多个专业角色确实需要不同工具、上下文和权限？
  └─ 是 → 先用 Eval 证明，再考虑 Multi-Agent
```

不要反过来先选框架，再寻找可以套进去的问题。

---

## 7. 从当前项目升级到生产系统的顺序

建议按风险和价值排序：

1. 接入真实登录、租户和权限，不再相信请求中的身份字段；
2. 将 Checkpoint、缓存、限流和熔断移到共享存储；
3. 接入真实 Embedding、向量库和企业知识权限；
4. 建立可查询 Trace、告警和人工审批后台；
5. 扩大真实业务 Eval 和 Red Team 数据；
6. 增加数据脱敏、DLP、审计和保留策略；
7. 最后再评估 LangGraph、Agents SDK 或 Multi-Agent。

---

## 8. 推荐继续阅读

- [Agent 小白白话指南](agent-beginner-guide.md)：逐个解释所有 Agent 术语；
- [项目全景与架构](architecture.md)：模块和完整数据流；
- [Week 2–Week 9 小白实战](week2-9-beginner-guide.md)：按学习周理解代码；
- [企业智能支持 Agent](enterprise-support-agent.md)：API、安全和运维；
- [配置参数说明](configuration.md)：修改参数会发生什么。

外部资料和高热度视频统一整理在 [Agent 小白白话指南的推荐资料](agent-beginner-guide.md#24-推荐文章和官方课程)，避免多份文档重复维护链接和数据。
