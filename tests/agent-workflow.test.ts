import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAgentSystemPrompt,
  runAgentWorkflow,
  validateAgentInput,
} from "../src/agent-workflow.js";
import type {
  CompletionOptions,
  CompletionResult,
  ModelClient,
} from "../src/types.js";

class RecordingClient implements ModelClient {
  readonly calls: CompletionOptions[] = [];

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    this.calls.push(options);
    return {
      text: "这是经过工作流生成的回答。",
      metrics: {
        firstTokenMs: 1,
        totalLatencyMs: 2,
        usage: { inputTokens: 3, outputTokens: 4 },
        estimatedCost: null,
      },
    };
  }
}

describe("agent workflow", () => {
  it("rejects empty and oversized input", () => {
    assert.throws(() => validateAgentInput("  "), /message 不能为空/u);
    assert.throws(
      () => validateAgentInput("a".repeat(20_001)),
      /不能超过 20000/u,
    );
  });

  it("keeps custom instructions inside the shared agent rules", () => {
    const system = buildAgentSystemPrompt("回答控制在三句话内");
    assert.match(system, /不要展示隐藏思维链/u);
    assert.match(system, /回答控制在三句话内/u);
  });

  it("runs explicit guardrail, context, generation and validation steps", async () => {
    const client = new RecordingClient();
    const events: string[] = [];
    const result = await runAgentWorkflow(
      client,
      {
        model: "mock-large",
        prompt: " 请解释当前工作流 ",
        temperature: 0.2,
      },
      {
        onEvent: (event) => events.push(`${event.step}:${event.status}`),
      },
    );

    assert.equal(result.text, "这是经过工作流生成的回答。");
    assert.equal(client.calls[0]?.prompt, "请解释当前工作流");
    assert.match(client.calls[0]?.system ?? "", /输出前检查/u);
    assert.deepEqual(events, [
      "guardrail:active",
      "guardrail:done",
      "context:active",
      "context:done",
      "generate:active",
      "generate:done",
      "validate:active",
      "validate:done",
    ]);
  });

  it("accepts explicit retry controls from runtime configuration", async () => {
    const client = new RecordingClient();
    await runAgentWorkflow(
      client,
      {
        model: "mock-small",
        prompt: "检查配置",
        temperature: 0.2,
      },
      {},
      { maxAttempts: 1, retryBaseDelayMs: 0 },
    );
    assert.equal(client.calls.length, 1);
  });
});
