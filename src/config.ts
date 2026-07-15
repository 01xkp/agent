import type { ModelPrice } from "./types.js";

export const API_TYPES = ["openai", "claude"] as const;

export type ApiType = (typeof API_TYPES)[number];

export interface AppConfig {
  apiType: ApiType;
  apiKey: string | undefined;
  baseURL: string;
  chatHistoryMaxCharacters: number;
  chatHistoryMaxMessages: number;
  chatMaxAttempts: number;
  chatRetryBaseDelayMs: number;
  firstTokenTimeoutMs: number;
  models: string[];
  modelTimeoutMs: number;
  temperature: number;
  maxOutputTokens: number;
  mockMode: boolean;
  pricing: Record<string, ModelPrice>;
}

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
): number {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} 必须是不小于 ${minimum} 的整数`);
  }
  return parsed;
}

export function parseApiType(value: string | undefined): ApiType {
  const apiType = value?.trim().toLowerCase() ?? "openai";
  if (!API_TYPES.includes(apiType as ApiType)) {
    throw new Error("API_TYPE 必须是 openai 或 claude");
  }
  return apiType as ApiType;
}

export function parseModels(value: string | undefined): string[] {
  const models = value
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return models && models.length > 0 ? models : ["mock-small", "mock-large"];
}

export function parsePricing(
  value: string | undefined,
): Record<string, ModelPrice> {
  if (!value) {
    return {};
  }

  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("MODEL_PRICING_JSON 必须是对象");
  }

  const pricing: Record<string, ModelPrice> = {};
  for (const [model, price] of Object.entries(parsed)) {
    if (
      typeof price !== "object" ||
      price === null ||
      !("inputPerMillion" in price) ||
      !("outputPerMillion" in price) ||
      typeof price.inputPerMillion !== "number" ||
      typeof price.outputPerMillion !== "number"
    ) {
      throw new Error(`模型 ${model} 的价格格式无效`);
    }

    pricing[model] = {
      inputPerMillion: price.inputPerMillion,
      outputPerMillion: price.outputPerMillion,
    };
  }

  return pricing;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const apiType = parseApiType(env.API_TYPE);
  const temperature = Number(env.TEMPERATURE ?? "0.2");
  const maxTemperature = apiType === "claude" ? 1 : 2;
  if (
    !Number.isFinite(temperature) ||
    temperature < 0 ||
    temperature > maxTemperature
  ) {
    throw new Error(`TEMPERATURE 必须是 0～${maxTemperature} 之间的数字`);
  }

  const maxOutputTokens = parseInteger(
    env.MAX_OUTPUT_TOKENS,
    2_048,
    "MAX_OUTPUT_TOKENS",
    1,
  );
  const firstTokenTimeoutMs = parseInteger(
    env.FIRST_TOKEN_TIMEOUT_MS,
    20_000,
    "FIRST_TOKEN_TIMEOUT_MS",
    1,
  );
  const modelTimeoutMs = parseInteger(
    env.MODEL_TIMEOUT_MS,
    90_000,
    "MODEL_TIMEOUT_MS",
    1,
  );
  if (modelTimeoutMs < firstTokenTimeoutMs) {
    throw new Error("MODEL_TIMEOUT_MS 必须是不小于首 Token 超时的正整数");
  }
  const chatHistoryMaxMessages = parseInteger(
    env.CHAT_HISTORY_MAX_MESSAGES,
    8,
    "CHAT_HISTORY_MAX_MESSAGES",
    0,
  );
  const chatHistoryMaxCharacters = parseInteger(
    env.CHAT_HISTORY_MAX_CHARACTERS,
    12_000,
    "CHAT_HISTORY_MAX_CHARACTERS",
    1,
  );
  const chatMaxAttempts = parseInteger(
    env.CHAT_MAX_ATTEMPTS,
    2,
    "CHAT_MAX_ATTEMPTS",
    1,
  );
  const chatRetryBaseDelayMs = parseInteger(
    env.CHAT_RETRY_BASE_DELAY_MS,
    500,
    "CHAT_RETRY_BASE_DELAY_MS",
    0,
  );

  const apiKey =
    apiType === "claude"
      ? (env.CLAUDE_API_KEY ?? env.OPENAI_API_KEY)
      : env.OPENAI_API_KEY;
  const baseURL =
    apiType === "claude"
      ? (env.CLAUDE_BASE_URL ?? "https://api.anthropic.com")
      : (env.OPENAI_BASE_URL ?? "https://api.openai.com/v1");

  return {
    apiType,
    apiKey,
    baseURL,
    chatHistoryMaxCharacters,
    chatHistoryMaxMessages,
    chatMaxAttempts,
    chatRetryBaseDelayMs,
    firstTokenTimeoutMs,
    models: parseModels(env.MODEL_IDS),
    modelTimeoutMs,
    temperature,
    maxOutputTokens,
    mockMode: parseBoolean(env.MOCK_MODE) || !apiKey,
    pricing: parsePricing(env.MODEL_PRICING_JSON),
  };
}
