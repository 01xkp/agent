import { randomUUID } from "node:crypto";
import {
  answerWithCitations,
  type RagAnswer,
  sampleKnowledgeDocuments,
} from "./rag-engine.js";
import { runToolLoop, type ToolCallRecord } from "./tool-calling.js";

export type AgentStepKind =
  | "answer"
  | "checkpoint"
  | "memory"
  | "plan"
  | "retrieve"
  | "tool";
export type AgentRunStatus =
  | "completed"
  | "interrupted"
  | "max_steps_reached"
  | "waiting_for_human";
export type WorkflowPattern =
  | "loop"
  | "parallel"
  | "route"
  | "sequence"
  | "orchestration";
export type MemoryKind = "business" | "long_term" | "session";

export interface AgentTraceEvent {
  detail: string;
  id: string;
  kind: AgentStepKind;
  timestamp: string;
}

export interface AgentCheckpoint {
  nextStep: number;
  runId: string;
  trace: AgentTraceEvent[];
}

export interface MemoryEntry {
  content: string;
  kind: MemoryKind;
  key: string;
}

export interface AgentRunResult {
  answer: string;
  checkpoint: AgentCheckpoint;
  memory: MemoryEntry[];
  rag: RagAnswer;
  status: AgentRunStatus;
  toolRecords: ToolCallRecord[];
  trace: AgentTraceEvent[];
}

export interface McpToolMessage {
  method: "tools/call" | "tools/list";
  params?: {
    arguments?: Record<string, unknown>;
    name?: string;
  };
}

export interface AgentEvalSummary {
  averageSteps: number;
  taskSuccessRate: number;
  toolErrorRate: number;
}

function trace(kind: AgentStepKind, detail: string): AgentTraceEvent {
  return {
    detail,
    id: randomUUID(),
    kind,
    timestamp: new Date().toISOString(),
  };
}

export function explainWorkflowPatterns(): Record<WorkflowPattern, string> {
  return {
    sequence: "顺序：先做输入检查，再检索，再回答。",
    parallel: "并行：同时跑关键词检索和向量检索，再合并结果。",
    route: "路由：退款类问题走退款工具，登录类问题走登录知识库。",
    loop: "循环：Agent 在计划、工具、观察之间迭代，但有最大步数。",
    orchestration: "编排：主 Agent 负责拆分任务，子流程负责检索、工具和总结。",
  };
}

export function createCheckpoint(
  runId: string,
  nextStep: number,
  events: AgentTraceEvent[],
): AgentCheckpoint {
  return {
    nextStep,
    runId,
    trace: [...events],
  };
}

export function resumeFromCheckpoint(
  checkpoint: AgentCheckpoint,
): AgentTraceEvent[] {
  return [
    ...checkpoint.trace,
    trace("checkpoint", `从第 ${checkpoint.nextStep} 步恢复运行`),
  ];
}

export function createLayeredMemory(question: string): MemoryEntry[] {
  return [
    {
      key: "current-question",
      kind: "session",
      content: question,
    },
    {
      key: "preference-language",
      kind: "long_term",
      content: "默认使用中文解释，并区分事实、假设和建议。",
    },
    {
      key: "ticket-policy",
      kind: "business",
      content: "退款、投诉、敏感信息都必须遵守权限和人工确认边界。",
    },
  ];
}

export async function runResearchAgent(
  question: string,
  options: {
    approved?: boolean;
    interruptAfterStep?: number;
    maxSteps?: number;
  } = {},
): Promise<AgentRunResult> {
  const runId = randomUUID();
  const maxSteps = options.maxSteps ?? 6;
  const events: AgentTraceEvent[] = [];
  let step = 0;

  function push(kind: AgentStepKind, detail: string): void {
    step += 1;
    events.push(trace(kind, detail));
  }

  function interrupted(): AgentRunResult | null {
    if (options.interruptAfterStep && step >= options.interruptAfterStep) {
      const checkpoint = createCheckpoint(runId, step + 1, events);
      return {
        answer: "任务已中断，可使用 checkpoint 恢复。",
        checkpoint,
        memory: createLayeredMemory(question),
        rag: answerWithCitations(sampleKnowledgeDocuments, question, "viewer"),
        status: "interrupted",
        toolRecords: [],
        trace: events,
      };
    }
    if (step >= maxSteps) {
      const checkpoint = createCheckpoint(runId, step + 1, events);
      return {
        answer: "达到最大步骤数，已停止以避免无限循环。",
        checkpoint,
        memory: createLayeredMemory(question),
        rag: answerWithCitations(sampleKnowledgeDocuments, question, "viewer"),
        status: "max_steps_reached",
        toolRecords: [],
        trace: events,
      };
    }
    return null;
  }

  push("plan", "计划：识别意图、检索知识库、必要时调用工具");
  const earlyStop = interrupted();
  if (earlyStop) return earlyStop;

  const memory = createLayeredMemory(question);
  push("memory", "装配会话记忆、长期记忆和业务数据边界");
  const memoryStop = interrupted();
  if (memoryStop) return memoryStop;

  const rag = answerWithCitations(
    sampleKnowledgeDocuments,
    question,
    question.includes("退款") ? "support" : "viewer",
    "hybrid",
  );
  push("retrieve", `检索到 ${rag.citations.length} 条引用`);
  const retrieveStop = interrupted();
  if (retrieveStop) return retrieveStop;

  const toolLoop = await runToolLoop(
    question.includes("退款")
      ? [
          {
            name: "ticket.lookup",
            input: { ticketId: "T-1002" },
            permissions: ["ticket:read", "refund:preview"],
          },
          {
            name: "refund.preview",
            input: {
              amount: 99,
              idempotencyKey: `${runId}:refund`,
              ticketId: "T-1002",
            },
            approved: options.approved === true,
            permissions: ["ticket:read", "refund:preview"],
          },
        ]
      : [
          {
            name: "ticket.lookup",
            input: { ticketId: "T-1001" },
            permissions: ["ticket:read"],
          },
        ],
  );
  push("tool", `工具调用 ${toolLoop.records.length} 次`);
  const pending = toolLoop.records.some(
    (record) => record.status === "pending_confirmation",
  );
  const toolStop = interrupted();
  if (toolStop) return toolStop;

  const checkpoint = createCheckpoint(runId, step + 1, events);
  if (pending) {
    return {
      answer: "退款预览属于高风险动作，已等待人工确认，确认前不会执行副作用。",
      checkpoint,
      memory,
      rag,
      status: "waiting_for_human",
      toolRecords: toolLoop.records,
      trace: events,
    };
  }

  push("answer", "生成带引用的最终回答并记录 Trace");
  return {
    answer: `${rag.answer}\n\n工具结论：${toolLoop.records
      .map((record) => `${record.name}=${record.status}`)
      .join("，")}`,
    checkpoint: createCheckpoint(runId, step + 1, events),
    memory,
    rag,
    status: "completed",
    toolRecords: toolLoop.records,
    trace: events,
  };
}

export function handleMcpMessage(message: McpToolMessage): unknown {
  if (message.method === "tools/list") {
    return {
      tools: [
        {
          name: "knowledge.search",
          description: "查询本地客服知识库，返回带来源的片段。",
        },
      ],
    };
  }
  if (message.method === "tools/call") {
    if (message.params?.name !== "knowledge.search") {
      return { error: "MCP 工具不存在" };
    }
    const query = message.params.arguments?.query;
    if (typeof query !== "string" || !query.trim()) {
      return { error: "query 必须是非空字符串" };
    }
    return answerWithCitations(sampleKnowledgeDocuments, query, "viewer");
  }
  return { error: "MCP 方法不支持" };
}

export function evaluateAgentRuns(runs: AgentRunResult[]): AgentEvalSummary {
  const denominator = runs.length || 1;
  const completed = runs.filter((run) => run.status === "completed").length;
  const toolRecords = runs.flatMap((run) => run.toolRecords);
  const failedTools = toolRecords.filter(
    (record) => record.status === "failed",
  ).length;
  return {
    averageSteps:
      runs.reduce((sum, run) => sum + run.trace.length, 0) / denominator,
    taskSuccessRate: completed / denominator,
    toolErrorRate: failedTools / (toolRecords.length || 1),
  };
}
