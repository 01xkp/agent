import { performance } from "node:perf_hooks";
import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import OpenAI from "openai";
import type { AppConfig } from "./config.js";
import { calculateCost, estimateTokens } from "./metrics.js";
import type {
  ChatContextMessage,
  CompletionOptions,
  CompletionResult,
  ModelClient,
} from "./types.js";

interface ModelRequestDeadline {
  dispose: () => void;
  markFirstToken: () => void;
  readTimeoutError: () => Error | undefined;
  signal: AbortSignal;
}

function createModelRequestDeadline(
  parentSignal: AbortSignal | undefined,
  firstTokenTimeoutMs: number,
  modelTimeoutMs: number,
): ModelRequestDeadline {
  const controller = new AbortController();
  let timeoutError: Error | undefined;
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  const firstTokenTimer = setTimeout(() => {
    timeoutError = new Error(
      `模型首 Token 等待超过 ${Math.round(firstTokenTimeoutMs / 1000)} 秒，请切换更快的模型或稍后重试`,
    );
    controller.abort(timeoutError);
  }, firstTokenTimeoutMs);
  const modelTimer = setTimeout(() => {
    timeoutError = new Error(
      `模型生成超过 ${Math.round(modelTimeoutMs / 1000)} 秒，已停止本次请求`,
    );
    controller.abort(timeoutError);
  }, modelTimeoutMs);

  return {
    signal: controller.signal,
    markFirstToken: () => clearTimeout(firstTokenTimer),
    readTimeoutError: () => timeoutError,
    dispose: () => {
      clearTimeout(firstTokenTimer);
      clearTimeout(modelTimer);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

function createMessages(
  system: string | undefined,
  history: ChatContextMessage[] | undefined,
  prompt: string,
): Array<
  | { content: string; role: "assistant" | "user" }
  | { content: string; role: "system" }
> {
  return [
    ...(system ? [{ role: "system" as const, content: system }] : []),
    ...(history ?? []),
    { role: "user" as const, content: prompt },
  ];
}

export class OpenAIModelClient implements ModelClient {
  private readonly client: OpenAI;

  constructor(private readonly config: AppConfig) {
    if (!config.apiKey) {
      throw new Error("OpenAI 模式需要 OPENAI_API_KEY");
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const startedAt = performance.now();
    const deadline = createModelRequestDeadline(
      options.signal,
      this.config.firstTokenTimeoutMs,
      this.config.modelTimeoutMs,
    );
    let firstTokenAt: number | undefined;
    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: options.model,
          messages: createMessages(
            options.system,
            options.history,
            options.prompt,
          ),
          temperature: options.temperature,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: deadline.signal },
      );

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta.content;
        if (token) {
          if (firstTokenAt === undefined) {
            firstTokenAt = performance.now();
            deadline.markFirstToken();
          }
          text += token;
          options.onToken?.(token);
        }

        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }
    } catch (error) {
      throw deadline.readTimeoutError() ?? error;
    } finally {
      deadline.dispose();
    }

    const finishedAt = performance.now();
    const usage = {
      inputTokens:
        inputTokens ||
        estimateTokens(`${options.system ?? ""} ${options.prompt}`),
      outputTokens: outputTokens || estimateTokens(text),
    };

    return {
      text,
      metrics: {
        firstTokenMs: Math.round((firstTokenAt ?? finishedAt) - startedAt),
        totalLatencyMs: Math.round(finishedAt - startedAt),
        usage,
        estimatedCost: calculateCost(usage, this.config.pricing[options.model]),
      },
    };
  }
}

export class ClaudeModelClient implements ModelClient {
  private readonly client: Anthropic;

  constructor(private readonly config: AppConfig) {
    if (!config.apiKey) {
      throw new Error("Claude 模式需要 CLAUDE_API_KEY");
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const startedAt = performance.now();
    const deadline = createModelRequestDeadline(
      options.signal,
      this.config.firstTokenTimeoutMs,
      this.config.modelTimeoutMs,
    );
    let firstTokenAt: number | undefined;
    let streamedText = "";

    let message: Message;
    try {
      const stream = this.client.messages.stream(
        {
          model: options.model,
          max_tokens: this.config.maxOutputTokens,
          messages: [
            ...(options.history ?? []),
            { role: "user", content: options.prompt },
          ],
          temperature: options.temperature,
          ...(options.system ? { system: options.system } : {}),
        },
        { signal: deadline.signal },
      );

      stream.on("text", (token) => {
        if (firstTokenAt === undefined) {
          firstTokenAt = performance.now();
          deadline.markFirstToken();
        }
        streamedText += token;
        options.onToken?.(token);
      });

      message = await stream.finalMessage();
    } catch (error) {
      throw deadline.readTimeoutError() ?? error;
    } finally {
      deadline.dispose();
    }
    const finishedAt = performance.now();
    const finalText = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    const text = streamedText || finalText;
    const usage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };

    return {
      text,
      metrics: {
        firstTokenMs: Math.round((firstTokenAt ?? finishedAt) - startedAt),
        totalLatencyMs: Math.round(finishedAt - startedAt),
        usage,
        estimatedCost: calculateCost(usage, this.config.pricing[options.model]),
      },
    };
  }
}

export class MockModelClient implements ModelClient {
  constructor(private readonly config: AppConfig) {}

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const startedAt = performance.now();
    const response = createMockResponse(options);
    const chunks = response.match(/.{1,8}/gu) ?? [response];
    let firstTokenAt: number | undefined;

    for (const chunk of chunks) {
      await waitForMockToken(options.signal);
      firstTokenAt ??= performance.now();
      options.onToken?.(chunk);
    }

    const finishedAt = performance.now();
    const usage = {
      inputTokens: estimateTokens(`${options.system ?? ""} ${options.prompt}`),
      outputTokens: estimateTokens(response),
    };

    return {
      text: response,
      metrics: {
        firstTokenMs: Math.round((firstTokenAt ?? finishedAt) - startedAt),
        totalLatencyMs: Math.round(finishedAt - startedAt),
        usage,
        estimatedCost: calculateCost(usage, this.config.pricing[options.model]),
      },
    };
  }
}

function createMockResponse(options: CompletionOptions): string {
  if (options.prompt.includes("ProjectReviewJSON")) {
    return JSON.stringify(
      {
        summary: "这是 Mock 模式下的结构化项目复盘，用于演示 JSON 校验流程。",
        tasks: [
          {
            content: "完成回归测试并记录结果",
            owner: "未说明",
            deadline: "未说明",
          },
        ],
        risks: [
          {
            risk: "Mock 模式不能代表真实模型质量",
            evidence: "当前输出由本地模拟客户端生成",
            impact: "只能验证流程，不能作为业务结论",
            needsHumanReview: true,
          },
        ],
        nextStep: "接入真实模型后重新运行结构化输出评测",
      },
      null,
      2,
    );
  }

  return options.model.includes("large")
    ? `模拟回答：我会先根据系统要求处理“${options.prompt.slice(0, 28)}”，再给出结论、依据和不确定性。`
    : `模拟回答：${options.prompt.slice(0, 40)}。请使用真实模型完成质量比较。`;
}

async function waitForMockToken(
  signal: AbortSignal | undefined,
): Promise<void> {
  if (signal?.aborted) {
    throw new Error("aborted");
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, 2);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });
}

export function createModelClient(config: AppConfig): ModelClient {
  if (config.mockMode) {
    return new MockModelClient(config);
  }
  return config.apiType === "claude"
    ? new ClaudeModelClient(config)
    : new OpenAIModelClient(config);
}
