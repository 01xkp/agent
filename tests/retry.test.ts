import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completeWithRetry, isTransientModelError } from "../src/retry.js";
import type {
  CompletionOptions,
  CompletionResult,
  ModelClient,
} from "../src/types.js";

class FlakyClient implements ModelClient {
  calls = 0;

  async complete(_options: CompletionOptions): Promise<CompletionResult> {
    this.calls += 1;
    if (this.calls < 3) {
      throw new Error("The model is currently at capacity due to high demand");
    }

    return {
      text: "完成",
      metrics: {
        firstTokenMs: 1,
        totalLatencyMs: 2,
        usage: { inputTokens: 1, outputTokens: 1 },
        estimatedCost: null,
      },
    };
  }
}

class PartialFailureClient implements ModelClient {
  calls = 0;

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    this.calls += 1;
    options.onToken?.("部分内容");
    throw new Error("connection reset");
  }
}

describe("model retry", () => {
  it("recognizes transient provider errors", () => {
    assert.equal(isTransientModelError(new Error("HTTP 429 rate limit")), true);
    assert.equal(isTransientModelError(new Error("terminated")), true);
    assert.equal(isTransientModelError(new Error("invalid API key")), false);
  });

  it("retries transient failures with a finite attempt limit", async () => {
    const client = new FlakyClient();
    const attempts: number[] = [];
    const result = await completeWithRetry(
      client,
      { model: "demo", prompt: "test", temperature: 0.2 },
      {
        maxAttempts: 3,
        baseDelayMs: 0,
        onRetry: (attempt) => attempts.push(attempt),
      },
    );

    assert.equal(result.text, "完成");
    assert.equal(client.calls, 3);
    assert.deepEqual(attempts, [2, 3]);
  });

  it("does not retry after streaming has already started", async () => {
    const client = new PartialFailureClient();
    const tokens: string[] = [];

    await assert.rejects(
      completeWithRetry(
        client,
        {
          model: "demo",
          prompt: "test",
          temperature: 0.2,
          onToken: (token) => tokens.push(token),
        },
        { maxAttempts: 3, baseDelayMs: 0 },
      ),
      /connection reset/u,
    );

    assert.equal(client.calls, 1);
    assert.deepEqual(tokens, ["部分内容"]);
  });

  it("can abort immediately while waiting for the next retry", async () => {
    const client = new FlakyClient();
    const controller = new AbortController();
    const startedAt = Date.now();
    const result = completeWithRetry(
      client,
      {
        model: "demo",
        prompt: "test",
        temperature: 0.2,
        signal: controller.signal,
      },
      { maxAttempts: 3, baseDelayMs: 5_000 },
    );

    setTimeout(() => controller.abort(new Error("用户停止")), 10);
    await assert.rejects(result, /用户停止/u);
    assert.ok(Date.now() - startedAt < 1_000);
  });
});
