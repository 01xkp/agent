import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  extractJsonObject,
  generateProjectReviewJson,
  validateProjectReviewJson,
} from "../src/structured-output.js";
import type {
  CompletionOptions,
  CompletionResult,
  ModelClient,
} from "../src/types.js";

class SequenceClient implements ModelClient {
  calls = 0;

  constructor(private readonly responses: string[]) {}

  async complete(_options: CompletionOptions): Promise<CompletionResult> {
    const response =
      this.responses[this.calls] ?? this.responses.at(-1) ?? "{}";
    this.calls += 1;

    return {
      text: response,
      metrics: {
        firstTokenMs: 1,
        totalLatencyMs: 2,
        usage: { inputTokens: 3, outputTokens: 4 },
        estimatedCost: null,
      },
    };
  }
}

describe("structured output", () => {
  it("keeps fixed structured output evaluation cases", () => {
    const cases = readFileSync("evals/structured-cases.jsonl", "utf8")
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    assert.ok(cases.length >= 5);
    for (const testCase of cases) {
      assert.equal(typeof testCase.id, "string");
      assert.equal(typeof testCase.input, "string");
      assert.ok(Array.isArray(testCase.expectedTaskSignals));
      assert.ok(Array.isArray(testCase.expectedRiskSignals));
    }
  });

  it("extracts JSON from fenced model output", () => {
    assert.deepEqual(extractJsonObject('```json\n{"summary":"ok"}\n```'), {
      summary: "ok",
    });
  });

  it("validates the project review schema", () => {
    const validation = validateProjectReviewJson({
      summary: "上线准备",
      tasks: [{ content: "测试", owner: "李明", deadline: "周四" }],
      risks: [
        {
          risk: "接口超时",
          evidence: "第三方模型接口偶尔超时",
          impact: "影响生成稳定性",
          needsHumanReview: true,
        },
      ],
      nextStep: "先完成回归测试",
    });

    assert.equal(validation.ok, true);
    if (validation.ok) {
      assert.equal(validation.value.tasks[0]?.owner, "李明");
    }
  });

  it("repairs invalid JSON with a validation retry", async () => {
    const client = new SequenceClient([
      '{"summary":"bad","tasks":[],"risks":[{"needsHumanReview":"yes"}],"nextStep":"x"}',
      JSON.stringify({
        summary: "上线准备",
        tasks: [{ content: "回归测试", owner: "李明", deadline: "周四" }],
        risks: [],
        nextStep: "完成测试",
      }),
    ]);

    const result = await generateProjectReviewJson(
      client,
      "mock-large",
      0.2,
      "周五上线，李明周四完成回归测试",
      { maxValidationAttempts: 2 },
    );

    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
    assert.equal(result.value.tasks[0]?.content, "回归测试");
  });

  it("degrades safely after repeated schema failures", async () => {
    const result = await generateProjectReviewJson(
      new SequenceClient(["不是 JSON", '{"summary":1}']),
      "mock-large",
      0.2,
      "记录不完整",
      { maxValidationAttempts: 2 },
    );

    assert.equal(result.ok, false);
    assert.equal(result.degraded, true);
    assert.equal(result.value.risks[0]?.needsHumanReview, true);
  });
});
