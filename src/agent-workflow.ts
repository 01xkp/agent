import { completeWithRetry } from "./retry.js";
import type {
  CompletionOptions,
  CompletionResult,
  ModelClient,
} from "./types.js";

export const AGENT_WORKFLOW_STEPS = [
  "guardrail",
  "context",
  "generate",
  "validate",
  "persist",
] as const;

export type AgentWorkflowStep = (typeof AGENT_WORKFLOW_STEPS)[number];
export type AgentWorkflowStatus = "active" | "done" | "error";

export interface AgentWorkflowEvent {
  detail: string;
  status: AgentWorkflowStatus;
  step: AgentWorkflowStep;
}

export interface AgentWorkflowHooks {
  onEvent?: (event: AgentWorkflowEvent) => void;
}

export interface AgentWorkflowSettings {
  maxAttempts?: number;
  retryBaseDelayMs?: number;
}

const baseAgentSystemPrompt = `你是“CS 凡”AI 助手，请可靠、清楚地完成用户任务。

工作规则：
1. 先判断用户真正要解决的问题，再选择最短且可靠的回答路径。
2. 简单问题直接回答；复杂问题用清晰步骤拆解，但不要展示隐藏思维链。
3. 事实、假设和建议要分开表达；信息不足时明确说明，不要编造。
4. 当前没有实际调用工具时，不得声称已经联网、读取文件或执行命令。
5. 输出前检查是否回答了用户问题、是否存在明显矛盾、是否给出可执行下一步。
6. 默认使用中文，表达尽量让没有技术背景的用户也能看懂。`;

export function validateAgentInput(input: string): string {
  const prompt = input.trim();
  if (!prompt) {
    throw new Error("message 不能为空");
  }
  if (prompt.length > 20_000) {
    throw new Error("单次消息不能超过 20000 个字符");
  }
  return prompt;
}

export function buildAgentSystemPrompt(system?: string): string {
  const customSystem = system?.trim();
  return customSystem
    ? `${baseAgentSystemPrompt}

本次任务的附加要求：
${customSystem}`
    : baseAgentSystemPrompt;
}

function validateAgentOutput(result: CompletionResult): void {
  if (!result.text.trim()) {
    throw new Error("模型返回了空内容，请稍后重试");
  }
}

export async function runAgentWorkflow(
  client: ModelClient,
  options: CompletionOptions,
  hooks: AgentWorkflowHooks = {},
  settings: AgentWorkflowSettings = {},
): Promise<CompletionResult> {
  hooks.onEvent?.({
    step: "guardrail",
    status: "active",
    detail: "正在检查输入",
  });
  const prompt = validateAgentInput(options.prompt);
  hooks.onEvent?.({
    step: "guardrail",
    status: "done",
    detail: "输入检查通过",
  });

  hooks.onEvent?.({
    step: "context",
    status: "active",
    detail: "正在装配任务上下文",
  });
  const system = buildAgentSystemPrompt(options.system);
  hooks.onEvent?.({
    step: "context",
    status: "done",
    detail: "任务上下文已就绪",
  });

  hooks.onEvent?.({
    step: "generate",
    status: "active",
    detail: "模型正在生成",
  });

  try {
    const result = await completeWithRetry(
      client,
      {
        ...options,
        prompt,
        system,
      },
      {
        maxAttempts: settings.maxAttempts ?? 2,
        baseDelayMs: settings.retryBaseDelayMs ?? 500,
        onRetry: (nextAttempt, maxAttempts) => {
          hooks.onEvent?.({
            step: "generate",
            status: "active",
            detail: `临时故障，正在重试 ${nextAttempt}/${maxAttempts}`,
          });
        },
      },
    );
    hooks.onEvent?.({
      step: "generate",
      status: "done",
      detail: "模型生成完成",
    });

    hooks.onEvent?.({
      step: "validate",
      status: "active",
      detail: "正在检查输出",
    });
    validateAgentOutput(result);
    hooks.onEvent?.({
      step: "validate",
      status: "done",
      detail: "输出检查通过",
    });
    return result;
  } catch (error) {
    hooks.onEvent?.({
      step: "generate",
      status: "error",
      detail: error instanceof Error ? error.message : "模型调用失败",
    });
    throw error;
  }
}
