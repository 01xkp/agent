import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  loadConfig,
  parseApiType,
  parseModels,
  parsePricing,
} from "../src/config.js";

describe("configuration", () => {
  it("parses a comma-separated model list", () => {
    assert.deepEqual(parseModels("small, large ,"), ["small", "large"]);
  });

  it("supports OpenAI and Claude API types", () => {
    assert.equal(parseApiType(undefined), "openai");
    assert.equal(parseApiType("CLAUDE"), "claude");
    assert.throws(() => parseApiType("unknown"), /API_TYPE/u);
  });

  it("uses mock mode when no matching API key is present", () => {
    assert.equal(loadConfig({ MODEL_IDS: "demo" }).mockMode, true);
    assert.equal(
      loadConfig({ API_TYPE: "claude", MODEL_IDS: "demo" }).mockMode,
      true,
    );
  });

  it("loads Claude-specific credentials and base URL", () => {
    const config = loadConfig({
      API_TYPE: "claude",
      CLAUDE_API_KEY: "test-key",
      CLAUDE_BASE_URL: "https://example.com",
      MODEL_IDS: "claude-test",
      MAX_OUTPUT_TOKENS: "1024",
    });

    assert.equal(config.apiType, "claude");
    assert.equal(config.apiKey, "test-key");
    assert.equal(config.baseURL, "https://example.com");
    assert.equal(config.maxOutputTokens, 1024);
    assert.equal(config.mockMode, false);
  });

  it("applies Claude temperature limits", () => {
    assert.throws(
      () =>
        loadConfig({
          API_TYPE: "claude",
          CLAUDE_API_KEY: "test-key",
          TEMPERATURE: "1.5",
        }),
      /0～1/u,
    );
  });

  it("validates first-token and total model timeouts", () => {
    const config = loadConfig({
      FIRST_TOKEN_TIMEOUT_MS: "12000",
      MODEL_TIMEOUT_MS: "60000",
    });
    assert.equal(config.firstTokenTimeoutMs, 12_000);
    assert.equal(config.modelTimeoutMs, 60_000);
    assert.throws(
      () =>
        loadConfig({
          FIRST_TOKEN_TIMEOUT_MS: "20000",
          MODEL_TIMEOUT_MS: "10000",
        }),
      /MODEL_TIMEOUT_MS/u,
    );
  });

  it("loads explicit chat execution controls", () => {
    const config = loadConfig({
      CHAT_HISTORY_MAX_CHARACTERS: "6000",
      CHAT_HISTORY_MAX_MESSAGES: "4",
      CHAT_MAX_ATTEMPTS: "3",
      CHAT_RETRY_BASE_DELAY_MS: "250",
    });
    assert.equal(config.chatHistoryMaxCharacters, 6_000);
    assert.equal(config.chatHistoryMaxMessages, 4);
    assert.equal(config.chatMaxAttempts, 3);
    assert.equal(config.chatRetryBaseDelayMs, 250);
    assert.throws(
      () => loadConfig({ CHAT_MAX_ATTEMPTS: "0" }),
      /CHAT_MAX_ATTEMPTS/u,
    );
    assert.throws(
      () => loadConfig({ CHAT_HISTORY_MAX_CHARACTERS: "0" }),
      /CHAT_HISTORY_MAX_CHARACTERS/u,
    );
  });

  it("validates model pricing", () => {
    assert.deepEqual(
      parsePricing('{"demo":{"inputPerMillion":1,"outputPerMillion":2}}'),
      {
        demo: { inputPerMillion: 1, outputPerMillion: 2 },
      },
    );
  });
});
