# 简历写法参考

## 项目名称

CS 凡：可评测、可部署的企业智能支持 Agent 与 AI 工具工作台

## 一句话介绍

基于 TypeScript、Vue、Node、Python/FastAPI 构建企业智能支持 Agent，串联权限、Hybrid RAG、Tool Calling、HITL、引用、Trace 与 Eval，并支持 OpenAI/Claude、Electron、CloudBase 和浏览器本地创图工具。

## 简历要点

- 设计并实现统一 `ModelClient` 适配层，支持 OpenAI Chat Completions、Claude Messages API 和本地 Mock 模式，屏蔽不同模型供应商差异。
- 实现 CLI 与浏览器双入口流式聊天，记录首 Token 时间、总延迟、Token 用量和估算成本，并支持浏览器端停止生成。
- 建立 Prompt 版本库，覆盖总结、任务提取、风险识别 3 类任务，每类提供 zero-shot、规则增强、few-shot 版本。
- 构建固定 Eval 数据集与评测脚本，输出 JSONL 原始结果和 Markdown 汇总报告，用于比较模型与 Prompt 版本。
- 实现 Structured Output 流程：JSON 抽取、Schema 校验、有限重试和安全降级，避免无效模型输出直接进入业务系统。
- 增加临时模型错误重试机制，区分限流/超时等可重试错误与密钥/参数等不可重试错误。
- 使用 Node.js 原生测试、TypeScript strict、Biome lint 建立质量检查，覆盖配置、指标、Prompt、重试、结构化输出和 Web Demo。
- 通过 CloudBase 官方 JS SDK 和腾讯云 TC3 签名协议接入 NoSQL，支持云托管临时鉴权与本地密钥鉴权，持久化问题、回答、模型和运行指标。
- 编写 Dockerfile 与部署文档，将静态页面、Node API 和数据库访问统一部署到 CloudBase 云托管。
- 实现 Tool Calling 运行时，覆盖工具 Schema、输入/输出校验、权限、只读/副作用区分、人工确认、超时、有限重试、幂等和错误分类。
- 实现本地可运行的 RAG 教学引擎，支持 Keyword/Vector/Hybrid、多知识库/租户/角色隔离、带引用回答、异步索引、Recall、MRR 和忠实度。
- 实现 Agent Loop、最大步数、Checkpoint、中断恢复、会话/长期/业务三层记忆、最小 MCP 协议、Trace 和 Agent Eval，并提供 LangGraph 状态图示例。
- 实现单进程滑动窗口限流、熔断、TTL Cache、延迟预算、模型路由及 Prompt Injection、越权和敏感信息 Red Team 基线。

## 面试讲解顺序

1. 先讲业务目标：不是聊天玩具，而是模型实验台。
2. 再讲核心链路：输入 → Prompt → 模型 → 指标 → 评测/结构化输出。
3. 再讲工程能力：统一适配层、测试、重试、降级、部署。
4. 最后诚实说明边界：本地哈希向量、Mock 业务工具、内存 Checkpoint/缓存和教学版 MCP 应如何升级为生产实现。

## 可量化描述模板

如果使用当前固定数据集，可以这样说：

```text
项目内置模型、Prompt、Structured Output、RAG 和 Red Team 固定数据集；自动化测试覆盖聊天、工具、RAG、Agent、可靠性、Vue/Electron 和 CloudBase 等模块，共 60+ 项测试。小型 RAG 教学集 Recall、MRR、忠实度均为 1，3 条 Red Team 基线全部拦截。
```

如果后续接入真实模型并跑完整评测，可以把以下信息补上：

- 平均首 Token 时间；
- 平均总延迟；
- 总 Token；
- 估算成本；
- 人工质量评分；
- 最优 Prompt 版本结论。

## 不建议这样写

不要只写：

```text
调用大模型 API，实现聊天功能。
```

这太普通，体现不出工程能力。

建议写：

```text
构建可评测 LLM Workbench，覆盖流式输出、Prompt 版本管理、Structured Output 校验、固定 Eval、错误重试、自动化测试和 Docker 部署。
```
