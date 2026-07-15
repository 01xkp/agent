import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runProjectReviewChain } from "../src/prompt-chain.js";
import type {
  CompletionOptions,
  CompletionResult,
  ModelClient,
} from "../src/types.js";

class RecordingClient implements ModelClient {
  readonly calls: CompletionOptions[] = [];

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    this.calls.push(options);
    const text =
      this.calls.length === 1 ? "任务：完成回归测试" : "风险：测试时间不足";

    return {
      text,
      metrics: {
        firstTokenMs: 1,
        totalLatencyMs: 2,
        usage: { inputTokens: 3, outputTokens: 4 },
        estimatedCost: null,
      },
    };
  }
}

describe("prompt chaining", () => {
  it("passes the first answer into the second prompt", async () => {
    const client = new RecordingClient();
    const result = await runProjectReviewChain(
      client,
      "mock-large",
      0.2,
      "项目周五上线，李明周四完成回归测试。",
    );

    assert.equal(client.calls.length, 2);
    assert.match(client.calls[0]?.prompt ?? "", /提取已经确定的任务/u);
    assert.match(client.calls[1]?.prompt ?? "", /任务：完成回归测试/u);
    assert.ok(client.calls[0]?.system);
    assert.ok(client.calls[1]?.system);
    assert.equal(result.risks.text, "风险：测试时间不足");
  });
});
