# Week 1 小白验收指南

Week 1 的目标不是做一个“看起来像聊天框”的页面，而是完成一条可运行、可测试、可测量的 LLM 基础链路。

## 1. 当前结论

| 学习项 | 状态 | 项目证据 |
|---|---|---|
| Token、上下文、Temperature | 已完成 | 指标、配置校验、Day 1 笔记、固定问答集 |
| 流式 CLI 与模型对照 | 已完成 | `npm run chat`、`npm run eval -- --limit 2` |
| Zero-shot、Few-shot、System/User 边界 | 已完成 | `src/prompts.ts` 中的 V1/V2/V3 |
| Prompt 版本化与 Chaining | 已完成 | `src/prompts.ts`、`src/prompt-chain.ts` |
| JSON Schema、结构校验、重试、降级 | 已完成 | `src/structured-output.ts` |
| 流式 Web、停止生成、错误状态 | 已完成 | `src/web/AgentView.vue`、`src/web/api.ts` |
| 多轮上下文 | 已完成 | 页面发送最近 4 轮、服务端限制 8 条和 12000 字符 |
| 首 Token、总延迟、Token、成本 | 已完成 | 页面指标与 `src/metrics.ts` |
| 固定回归集 | 已完成 | `evals/baseline.jsonl` 等固定数据 |
| 自动化测试和构建 | 已完成 | `npm run check`、`npm run build` |
| 线上发布 | 已发布过，当前需重新发布 | 原腾讯云地址检查时返回 503，不能算当前可用 |

## 2. 一次聊天发生了什么

```text
用户输入
  → 浏览器携带最近 4 轮上下文
  → POST /api/chat
  → 输入护栏
  → System Prompt 与上下文装配
  → 模型流式生成
  → SSE 立即发送 Token
  → 输出检查
  → 保存本地或 CloudBase 记录
```

为了不让历史越来越长，页面只发送最近 4 轮，服务端再次限制消息数量和总字符数。这样既能记住近几轮对话，也能控制 Token、费用和首 Token 延迟。

## 3. Prompt V1、V2、V3 怎么理解

- **V1**：Zero-shot，只告诉模型要做什么；
- **V2**：增加 System 规则、输入边界和输出格式；
- **V3**：在 V2 基础上增加一个 Few-shot 示例。

运行：

```bash
npm run eval:prompts -- --limit 2
```

不要凭感觉说 V3 一定最好。应对照固定数据，比较正确性、格式、延迟和成本。

## 4. 结构化输出为什么不能只写“请返回 JSON”

模型输出是文本，不是可信的程序对象。当前流程是：

```text
生成文本
  → 抽取 JSON
  → 校验字段和类型
  → 把校验错误发给模型修复
  → 仍失败则 degraded=true 并要求人工复核
```

运行：

```bash
npm run structure -- "李明周五前完成测试，接口压测报告还没有返回"
npm run eval:structured -- --limit 2
```

## 5. 最小验收步骤

```bash
npm install
npm run check
npm run build
npm run eval:learning
```

再启动页面：

```bash
npm run dev
```

检查：

1. 发送问题后先看到工作流状态；
2. 回答不是等全部生成后一次出现；
3. 点击“停止生成”能立即中止；
4. 第二轮能理解最近对话；
5. 右侧能看到首 Token 和总延迟；
6. 结构化输出能通过校验或安全降级。

## 6. 仍需诚实说明的边界

- 当前成本只有配置 `MODEL_PRICING_JSON` 后才会显示；
- 模型对照能力已完成，但只配置一个模型时无法形成有效横向比较；
- 第三方网关的模型名、速度和计费以供应商实际能力为准；
- 固定 Eval 能重复运行，不代表一次高分就能证明模型在所有场景可靠；
- 腾讯云旧版本当前返回 503，需要重新部署后才能恢复线上验收。
