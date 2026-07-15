# CS 凡：AI Agent 工作台与创图工具箱

这是一个面向 AI 工程学习和作品演示的全栈项目。它不是只会聊天的页面，而是把模型接入、流式输出、Prompt、结构化输出、RAG、工具调用、Agent、评测、可靠性、Web、Electron 和本地文件工具放进同一套可运行工程。

## 这个项目为什么存在

学习 AI 最容易停在“会调用一次 API”。真实工程还要处理上下文、错误、权限、成本、流式体验、数据保存、测试和部署。

本项目的最大作用是提供一条**可以阅读、修改、测试和演示的完整 AI 工程链路**：

```text
用户操作
  → 页面与 API
  → 可观察工作流
  → 模型 / RAG / 工具
  → 校验、权限与人工确认
  → 指标、Trace、Eval 和保存
```

没有模型密钥也能使用 Mock 模式运行主流程。

## 当前包含什么

### AI Agent 工作台

- OpenAI 兼容协议、Claude Messages 协议和 Mock 模式；
- SSE 流式回答、停止生成、首 Token 和总延迟指标；
- 最近对话上下文、超时、有限重试和运行 ID；
- Prompt 版本、Prompt Chaining、结构化 JSON 校验和降级；
- Tool Calling、RAG、Agent Loop、HITL、Memory、MCP 和 Trace 教学实现；
- 企业支持 Agent：权限 → 检索 → 工具 → 人工确认 → 引用 → Eval；
- 固定模型、Prompt、RAG、Agent 和 Red Team 评测集；
- 可选 CloudBase 聊天历史。

### 创图工具箱

- 证件照抠图、换底、规格裁剪和打印排版；
- 图片裁剪、像素调整和批量导出；
- JPG、PNG、GIF、WebP、SVG 压缩；
- `.docx` 解析、分页、预览和 PPTX 导出；
- 图片和文档优先在浏览器本地处理。

### 运行形态

- Vue 3 Web；
- Electron 桌面端；
- Node.js 主服务；
- 独立 Python / FastAPI / Pydantic / LangGraph 教学服务。

## 五分钟运行

要求 Node.js 22 和 npm。

```bash
npm install
cp .env.example .env
npm run dev
```

Windows PowerShell：

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

第一次运行保持：

```env
MOCK_MODE=true
```

浏览器打开 Vite 输出的地址。默认页面是 AI Agent 工作台，顶部“创图工具箱”用于切换本地工具。

## 怎么验证项目

```bash
npm run check
npm run build
npm run eval:learning
npm run python:check
npm run python:test
```

| 命令 | 验证内容 |
|---|---|
| `npm run check` | Biome、TypeScript、Vue 类型和 Node 测试 |
| `npm run build` | Node 服务与 Vue 生产构建 |
| `npm run eval:learning` | RAG、Agent 和 Red Team 固定评测 |
| `npm run python:check` | Python 语法和导入检查 |
| `npm run python:test` | FastAPI、HITL 和 LangGraph 示例 |

## 常用入口

| 命令 | 用途 |
|---|---|
| `npm run dev` | 启动 Web 和 Node API |
| `npm run desktop:dev` | 启动 Electron |
| `npm run chat` | 终端流式聊天 |
| `npm run chain -- "内容"` | 运行两步 Prompt Chain |
| `npm run structure -- "内容"` | 生成并校验结构化 JSON |
| `npm run eval -- --limit 2` | 小批量比较模型 |
| `npm run eval:prompts -- --limit 2` | 比较 Prompt 版本 |
| `npm run eval:structured -- --limit 2` | 评测结构化输出 |
| `npm run eval:learning` | 运行 Week 2–9 固定评测 |
| `npm run build` / `npm start` | 本地生产构建与启动 |

## 核心目录

```text
src/
├─ web/                   Vue 页面、本地图片和文档工具
├─ server.ts              HTTP、SSE、API 和静态资源
├─ agent-workflow.ts      普通聊天的确定性工作流
├─ model-client.ts        OpenAI / Claude / Mock 适配
├─ prompts.ts             Prompt 版本库
├─ structured-output.ts   JSON 抽取、校验、重试和降级
├─ tool-calling.ts        工具权限、风险、超时、幂等
├─ rag-engine.ts          检索、引用、权限和 RAG Eval
├─ agent-engine.ts        Agent Loop、Memory、MCP、Trace
├─ production-agent.ts    企业支持 Agent 纵向切片
└─ reliability.ts         限流、熔断、缓存和路由

electron/                 Electron 主进程与安全桥
services/fastapi-teaching Python 教学服务
tests/                    自动化测试
evals/                    固定评测数据
docs/                     项目文档
```

## 当前边界

- RAG 使用本地教学文档和哈希向量，不是真实向量数据库；
- Agent Checkpoint、缓存、限流和熔断是单进程教学实现；
- MCP 是最小进程内示例，不是完整网络服务；
- 图片裁剪不是专业设计软件级交互；
- `.doc` 不直接解析，建议先另存为 `.docx`；
- GIF 经 Canvas 导出后只保留静态帧；
- 历史腾讯云地址目前需要重新发布后再做线上验收。

这些边界会在文档中明确标注，不把教学实现描述成企业生产系统。
