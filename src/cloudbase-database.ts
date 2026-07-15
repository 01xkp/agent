import { createHash, createHmac } from "node:crypto";
import { createRequire } from "node:module";
import type { CompletionMetrics } from "./types.js";

const CLOUDBASE_API_HOST = "tcb.tencentcloudapi.com";
const CLOUDBASE_API_VERSION = "2018-06-08";
const CLOUDBASE_SERVICE = "tcb";
const cloudbase: typeof import("@cloudbase/js-sdk") = createRequire(
  import.meta.url,
)("@cloudbase/js-sdk");

export interface CloudBaseDatabaseConfig {
  envId: string | undefined;
  collectionName: string;
  region: string;
  accessKey: string | undefined;
  runtimeAccessToken: string | undefined;
  secretId: string | undefined;
  secretKey: string | undefined;
  sessionToken: string | undefined;
}

export interface ChatRunInput {
  prompt: string;
  answer: string;
  model: string;
  mode: "mock" | "real";
  metrics: CompletionMetrics;
  runId?: string;
}

export interface ChatHistoryItem {
  id: string;
  prompt: string;
  answer: string;
  model: string;
  createdAt: string;
}

export interface DatabaseStatus {
  enabled: boolean;
  provider: "cloudbase";
  collection: string;
}

type Fetcher = typeof fetch;

interface RequestOptions {
  fetcher?: Fetcher;
  now?: () => number;
  runtimeDatabase?: RuntimeDatabase;
}

interface CloudBaseApiError {
  Code?: string;
  Message?: string;
}

interface RuntimeDatabase {
  add(collectionName: string, document: Record<string, unknown>): Promise<void>;
  list(collectionName: string, limit: number): Promise<unknown[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(value: string, key: string | Buffer): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function utcDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

export function createTencentCloudAuthorization(
  secretId: string,
  secretKey: string,
  payload: string,
  timestamp: number,
): string {
  const date = utcDate(timestamp);
  const canonicalHeaders = `content-type:application/json\nhost:${CLOUDBASE_API_HOST}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256(payload),
  ].join("\n");
  const credentialScope = `${date}/${CLOUDBASE_SERVICE}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const secretDate = hmac(date, `TC3${secretKey}`);
  const secretService = hmac(CLOUDBASE_SERVICE, secretDate);
  const secretSigning = hmac("tc3_request", secretService);
  const signature = hmac(stringToSign, secretSigning).toString("hex");

  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

export function loadCloudBaseDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): CloudBaseDatabaseConfig {
  return {
    envId: env.CLOUDBASE_ENV_ID ?? env.CLOUDBASE_ENV ?? env.TCB_ENV,
    collectionName: env.CLOUDBASE_COLLECTION?.trim() || "ai_chat_runs",
    region:
      env.CLOUDBASE_REGION ??
      env.TCB_REGION ??
      env.TENCENTCLOUD_REGION ??
      "ap-shanghai",
    accessKey: env.CLOUDBASE_APIKEY,
    runtimeAccessToken: env.WX_CLOUDBASE_ACCESSTOKEN,
    secretId: env.TENCENTCLOUD_SECRETID,
    secretKey: env.TENCENTCLOUD_SECRETKEY,
    sessionToken: env.TENCENTCLOUD_SESSIONTOKEN,
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function readDocumentId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  return readString(value.$oid);
}

function parseCommandDocuments(value: unknown): Record<string, unknown>[] {
  if (typeof value !== "string") return [];

  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (typeof item !== "string") return [];
    const document: unknown = JSON.parse(item);
    return isRecord(document) ? [document] : [];
  });
}

function createRuntimeDatabase(
  config: CloudBaseDatabaseConfig,
): RuntimeDatabase {
  if (!config.envId) {
    throw new Error("CloudBase 环境 ID 未配置");
  }

  const app = cloudbase.init({
    env: config.envId,
    region: config.region,
    timeout: 10_000,
    ...(config.accessKey ? { accessKey: config.accessKey } : {}),
  });
  const database = app.database();

  return {
    async add(collectionName, document) {
      const result = await database.collection(collectionName).add(document);
      if (result.code) {
        throw new Error(
          `CloudBase 数据库错误：${result.code} ${result.message ?? ""}`.trim(),
        );
      }
    },
    async list(collectionName, limit) {
      const result = await database
        .collection(collectionName)
        .where({ type: "chat" })
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
      if (result.code) {
        throw new Error(
          `CloudBase 数据库错误：${result.code} ${result.message ?? ""}`.trim(),
        );
      }
      return result.data;
    },
  };
}

export class CloudBaseChatStore {
  private readonly fetcher: Fetcher;
  private readonly now: () => number;
  private readonly runtimeDatabase: RuntimeDatabase | undefined;

  constructor(
    private readonly config: CloudBaseDatabaseConfig,
    options: RequestOptions = {},
  ) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
    this.runtimeDatabase = options.runtimeDatabase;
  }

  get status(): DatabaseStatus {
    return {
      enabled: this.isEnabled(),
      provider: "cloudbase",
      collection: this.config.collectionName,
    };
  }

  async saveChat(input: ChatRunInput): Promise<boolean> {
    if (!this.isEnabled()) return false;

    const document = {
      type: "chat",
      prompt: input.prompt,
      answer: input.answer,
      model: input.model,
      mode: input.mode,
      metrics: input.metrics,
      ...(input.runId ? { runId: input.runId } : {}),
      createdAt: new Date(this.now()).toISOString(),
    };

    if (this.usesRuntimeDatabase()) {
      await this.getRuntimeDatabase().add(this.config.collectionName, document);
      return true;
    }

    const command = JSON.stringify({
      insert: this.config.collectionName,
      documents: [document],
    });
    await this.request("RunCommands", {
      EnvId: this.config.envId,
      MgoCommands: [
        {
          TableName: this.config.collectionName,
          CommandType: "INSERT",
          Command: command,
        },
      ],
    });
    return true;
  }

  async listChats(limit = 6): Promise<ChatHistoryItem[]> {
    if (!this.isEnabled()) return [];

    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 20);
    if (this.usesRuntimeDatabase()) {
      const documents = await this.getRuntimeDatabase().list(
        this.config.collectionName,
        safeLimit,
      );
      return documents.flatMap(readHistoryItem);
    }

    const command = JSON.stringify({
      find: this.config.collectionName,
      filter: { type: "chat" },
      sort: { createdAt: -1 },
      limit: safeLimit,
    });
    const response = await this.request("RunCommands", {
      EnvId: this.config.envId,
      MgoCommands: [
        {
          TableName: this.config.collectionName,
          CommandType: "QUERY",
          Command: command,
        },
      ],
    });
    const data = response.Data;
    if (!Array.isArray(data)) return [];

    return data.flatMap(parseCommandDocuments).flatMap(readHistoryItem);
  }

  private isEnabled(): boolean {
    return Boolean(
      this.config.envId &&
        ((this.config.secretId && this.config.secretKey) ||
          this.config.accessKey ||
          this.config.runtimeAccessToken),
    );
  }

  private usesRuntimeDatabase(): boolean {
    return Boolean(
      this.config.envId &&
        (!this.config.secretId || !this.config.secretKey) &&
        (this.config.accessKey || this.config.runtimeAccessToken),
    );
  }

  private getRuntimeDatabase(): RuntimeDatabase {
    if (!this.usesRuntimeDatabase()) {
      throw new Error("CloudBase 运行时数据库未启用");
    }
    return this.runtimeDatabase ?? createRuntimeDatabase(this.config);
  }

  private async request(
    action: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { secretId, secretKey } = this.config;
    if (!secretId || !secretKey) {
      throw new Error("CloudBase 数据库凭据未配置");
    }

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(this.now() / 1000);
    const headers: Record<string, string> = {
      authorization: createTencentCloudAuthorization(
        secretId,
        secretKey,
        body,
        timestamp,
      ),
      "content-type": "application/json",
      host: CLOUDBASE_API_HOST,
      "x-tc-action": action,
      "x-tc-region": this.config.region,
      "x-tc-timestamp": String(timestamp),
      "x-tc-version": CLOUDBASE_API_VERSION,
    };
    if (this.config.sessionToken) {
      headers["x-tc-token"] = this.config.sessionToken;
    }

    const response = await this.fetcher(`https://${CLOUDBASE_API_HOST}`, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const responseBody: unknown = await response.json();
    if (!response.ok || !isRecord(responseBody)) {
      throw new Error(`CloudBase 数据库请求失败：HTTP ${response.status}`);
    }

    const apiResponse = responseBody.Response;
    if (!isRecord(apiResponse)) {
      throw new Error("CloudBase 数据库响应格式无效");
    }

    const error = apiResponse.Error;
    if (isRecord(error)) {
      const apiError = error as CloudBaseApiError;
      throw new Error(
        `CloudBase 数据库错误：${apiError.Code ?? "UNKNOWN"} ${apiError.Message ?? ""}`.trim(),
      );
    }
    return apiResponse;
  }
}

function readHistoryItem(document: unknown): ChatHistoryItem[] {
  if (!isRecord(document)) return [];

  const id = readDocumentId(document._id);
  const prompt = readString(document.prompt);
  const answer = readString(document.answer);
  const model = readString(document.model);
  const createdAt = readString(document.createdAt);
  if (!id || !prompt || !answer || !model || !createdAt) return [];
  return [{ id, prompt, answer, model, createdAt }];
}
