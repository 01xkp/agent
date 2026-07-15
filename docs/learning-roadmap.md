# AI Agent 工程师 9 周学习路线（整合版）

这份路线从原始 README 和每日计划中提取，只保留不重复、能直接执行的部分。原则是每周都有可运行项目、固定评测数据、测试、失败记录和可解释的数据流。

## 总体节奏

- 每周学习 6 天，每天约 7 小时；
- 理论 15%，编码 55%，测试与 Eval 20%，文档与复盘 10%；
- 一次只学一条主线，不同时横跳多个 Agent 框架；
- Demo 能运行不等于完成，必须有测试和固定评测数据；
- 每天记录 1～3 个真实失败和根因。

## Week 1：LLM、Prompt、Structured Output、Streaming

目标：完成 AI Chat Workbench v1。

- Day 1：Token、上下文、Temperature、流式 CLI、模型对照；
- Day 2：Zero-shot、Few-shot、System/User 边界、Prompt 版本化与 Chaining；
- Day 3：JSON Schema、结构校验、有限重试与降级；
- Day 4：流式 Web UI、停止生成、错误状态；
- Day 5：体验、成本、固定回归集；
- Day 6：集成、测试、演示和发布。

完成标准：聊天可流式运行，结构化输出可验证，固定 Eval 可重复执行。

## Week 2：Tool Calling、Python、FastAPI

目标：完成 AI Chat Workbench v2。

- 补齐 Python、类型、异步和异常处理；
- 用 FastAPI + Pydantic 提供后端接口；
- 实现 Tool Calling 循环；
- 对有副作用的工具增加人工确认；
- 加入超时、重试、幂等和错误分类。

完成标准：前端、后端、模型和工具形成完整闭环。

## Week 3：RAG 从零到可用

目标：完成技术文档知识库 v1。

- 理解 Embedding、相似度和向量检索；
- 完成文档解析、切分、索引；
- 实现带引用的问答；
- 调整 chunk、top-k 和检索策略；
- 建立基础 Retrieval Eval。

完成标准：回答能引用来源，检索效果可用固定数据衡量。

## Week 4：RAG Eval 与产品化

目标：完成技术文档知识库 v2。

- 增加 Recall、MRR、答案忠实度等指标；
- 对比 Vector、Keyword、Hybrid 检索；
- 增加多知识库和权限边界；
- 实现异步索引、失败重试和运维记录。

完成标准：RAG 不只“能搜到”，还要可量化、可隔离、可维护。

## Week 5：Agent Loop、Workflow、LangGraph

目标：完成研究 Agent v1。

- 手写最小 Agent Loop；
- 实现研究任务的计划、搜索、整理和输出；
- 学习顺序、并行、路由、循环、编排五类 Workflow；
- 再使用 LangGraph 表达状态和节点；
- 增加持久化、恢复和中断。

完成标准：能解释框架背后的循环、状态和停止条件。

## Week 6：HITL、Memory、MCP

目标：完成研究 Agent v2。

- 高风险动作进入 Human-in-the-loop；
- 区分会话记忆、长期记忆和业务数据；
- 实现最小 MCP Server 和 MCP Client；
- 对工具权限、输入、输出和副作用做安全控制。

完成标准：Agent 能接入工具，但不能绕过确认和权限边界。

## Week 7：Agentic UI、Eval、Observability

目标：完成研究 Agent v3。

- 对比单 Agent 和多 Agent；
- UI 展示步骤、工具调用、引用和等待确认状态；
- 建立任务成功率、步骤数、工具错误率等 Eval；
- 加入自动化回归和 Trace。

完成标准：不仅能演示 Agent，还能证明它为什么可靠或哪里不可靠。

## Week 8：可靠性、安全与部署

目标：完成旗舰项目纵向切片。

- 超时、重试、熔断、限流、幂等；
- 缓存、模型路由、Token 和延迟预算；
- Prompt Injection、越权工具、数据泄露威胁模型；
- Red Team 数据集；
- 容器化、监控、日志和发布回滚。

完成标准：核心业务链路具备最小生产工程能力。

## Week 9：旗舰项目、作品集与求职

目标：完成企业智能支持 Agent。

业务链路：用户问题 → 权限检查 → RAG → 工具查询 → 必要时人工确认 → 带引用回答 → Trace 与 Eval。

- 冻结需求和架构；
- 接入知识库、业务工具和权限；
- 完成 Agent 与 UI；
- 运行全量 Eval 并修复高频失败；
- 部署、录屏、整理架构图和量化指标；
- 准备项目讲解和模拟面试。

完成标准：项目可演示、可测试、可部署、可解释、可写进简历。

## 每日完成定义

每天至少满足：

1. 一个可运行功能或实验；
2. 一个测试或 Eval Case；
3. 一次 `npm run check` 或对应技术栈质量检查；
4. 记录失败和根因；
5. 更新下一步唯一最高优先级。

## 当前进度

- Week 1：聊天、多轮上下文、Prompt 版本、Prompt Chaining、Structured Output、流式 Web、性能回归和固定评测已完成；线上旧服务当前需重新发布；
- Week 2：已完成工具 Schema、权限、只读/副作用工具、人工确认、超时、有限重试、幂等、错误分类和 FastAPI/Pydantic 教学服务；
- Week 3：已完成文档解析、切分、本地哈希向量、Keyword/Vector/Hybrid 检索和带引用回答；
- Week 4：已完成 Recall、MRR、忠实度、多知识库/租户/角色边界、异步索引和运维状态；
- Week 5：已完成最小 Agent Loop、五类 Workflow、最大步数、Checkpoint、中断恢复，并提供真实 LangGraph 状态图教学示例；
- Week 6：已完成 HITL、会话/长期/业务三层记忆、最小 MCP 消息协议和工具安全边界；
- Week 7：已完成 Week 2–9 Inspector、工具/引用/等待/Trace 展示和 Agent Eval；
- Week 8：已完成超时、重试、限流、熔断、TTL Cache、幂等、模型路由、预算、安全检查和 Red Team 基线；
- Week 9：已完成企业支持 Agent 纵向切片、API、架构图、部署/回滚、简历和面试材料。

固定教学数据可执行：

```bash
npm run eval:learning
```

详细说明见 [Week 2–Week 9 小白实战指南](week2-9-beginner-guide.md)。

> 完成表示仓库内存在可运行代码、测试和文档，不表示所有能力已经达到大型企业生产规模。真实 Embedding、可信登录身份、共享 Checkpoint/缓存/限流、完整 MCP SDK 和审批后台仍属于生产升级项。
