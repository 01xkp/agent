import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppConfig } from "../src/config.js";
import {
  ClaudeModelClient,
  createModelClient,
  MockModelClient,
  OpenAIModelClient,
} from "../src/model-client.js";

function createConfig(overrides: Partial<AppConfig>): AppConfig {
  return {
    apiType: "openai",
    apiKey: "test-key",
    baseURL: "https://example.com",
    chatHistoryMaxCharacters: 12_000,
    chatHistoryMaxMessages: 8,
    chatMaxAttempts: 2,
    chatRetryBaseDelayMs: 500,
    firstTokenTimeoutMs: 1_000,
    models: ["test-model"],
    modelTimeoutMs: 5_000,
    temperature: 0.2,
    maxOutputTokens: 256,
    mockMode: false,
    pricing: {},
    ...overrides,
  };
}

describe("model client factory", () => {
  it("creates an OpenAI client for the OpenAI API type", () => {
    assert.ok(createModelClient(createConfig({})) instanceof OpenAIModelClient);
  });

  it("creates a Claude client for the Claude API type", () => {
    assert.ok(
      createModelClient(createConfig({ apiType: "claude" })) instanceof
        ClaudeModelClient,
    );
  });

  it("keeps mock mode independent from API type", () => {
    assert.ok(
      createModelClient(
        createConfig({ apiType: "claude", mockMode: true }),
      ) instanceof MockModelClient,
    );
  });
});
