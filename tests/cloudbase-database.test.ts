import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CloudBaseChatStore,
  createTencentCloudAuthorization,
  loadCloudBaseDatabaseConfig,
} from "../src/cloudbase-database.js";

const configuredDatabase = {
  envId: "demo-env",
  collectionName: "ai_chat_runs",
  region: "ap-shanghai",
  accessKey: undefined,
  runtimeAccessToken: undefined,
  secretId: "test-secret-id",
  secretKey: "test-secret-key",
  sessionToken: "test-session-token",
};

describe("CloudBase database", () => {
  it("stays disabled when local CloudBase credentials are absent", async () => {
    const config = loadCloudBaseDatabaseConfig({});
    const store = new CloudBaseChatStore(config);

    assert.equal(store.status.enabled, false);
    assert.deepEqual(await store.listChats(), []);
    assert.equal(
      await store.saveChat({
        prompt: "hello",
        answer: "world",
        model: "mock-model",
        mode: "mock",
        runId: "run-disabled",
        metrics: {
          firstTokenMs: 1,
          totalLatencyMs: 2,
          usage: { inputTokens: 3, outputTokens: 4 },
          estimatedCost: null,
        },
      }),
      false,
    );
  });

  it("creates a TC3 authorization header without exposing the secret key", () => {
    const authorization = createTencentCloudAuthorization(
      configuredDatabase.secretId,
      configuredDatabase.secretKey,
      '{"EnvId":"demo-env"}',
      1_700_000_000,
    );

    assert.match(
      authorization,
      /^TC3-HMAC-SHA256 Credential=test-secret-id\/\d{4}-\d{2}-\d{2}\/tcb\/tc3_request/u,
    );
    assert.match(authorization, /SignedHeaders=content-type;host/u);
    assert.doesNotMatch(authorization, /test-secret-key/u);
  });

  it("uses CloudBase runtime credentials injected by cloud hosting", async () => {
    const addedDocuments: Record<string, unknown>[] = [];
    const config = loadCloudBaseDatabaseConfig({
      CLOUDBASE_ENV: "runtime-env",
      WX_CLOUDBASE_ACCESSTOKEN: "runtime-token",
    });
    const store = new CloudBaseChatStore(config, {
      now: () => Date.parse("2026-07-14T18:00:00.000Z"),
      runtimeDatabase: {
        async add(collectionName, document) {
          assert.equal(collectionName, "ai_chat_runs");
          addedDocuments.push(document);
        },
        async list(collectionName, limit) {
          assert.equal(collectionName, "ai_chat_runs");
          assert.equal(limit, 6);
          return [
            {
              _id: "runtime-record-1",
              prompt: "云托管怎样访问数据库？",
              answer: "使用运行时注入的临时访问令牌。",
              model: "mock-model",
              createdAt: "2026-07-14T18:00:00.000Z",
            },
          ];
        },
      },
    });

    assert.equal(store.status.enabled, true);
    assert.equal(
      await store.saveChat({
        prompt: "云托管怎样访问数据库？",
        answer: "使用运行时注入的临时访问令牌。",
        model: "mock-model",
        mode: "mock",
        runId: "run-runtime",
        metrics: {
          firstTokenMs: 2,
          totalLatencyMs: 5,
          usage: { inputTokens: 4, outputTokens: 8 },
          estimatedCost: null,
        },
      }),
      true,
    );
    assert.equal(addedDocuments[0]?.createdAt, "2026-07-14T18:00:00.000Z");
    assert.equal(addedDocuments[0]?.runId, "run-runtime");
    assert.deepEqual(await store.listChats(), [
      {
        id: "runtime-record-1",
        prompt: "云托管怎样访问数据库？",
        answer: "使用运行时注入的临时访问令牌。",
        model: "mock-model",
        createdAt: "2026-07-14T18:00:00.000Z",
      },
    ]);
  });

  it("writes chat runs with the documented RunCommands API", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(
        JSON.stringify({ Response: { Data: ["[]"], RequestId: "request-1" } }),
        { status: 200 },
      );
    };
    const store = new CloudBaseChatStore(configuredDatabase, {
      fetcher,
      now: () => Date.parse("2026-07-14T18:00:00.000Z"),
    });

    const saved = await store.saveChat({
      prompt: "解释流式输出",
      answer: "流式输出会逐步返回内容。",
      model: "mock-model",
      mode: "mock",
      runId: "run-command",
      metrics: {
        firstTokenMs: 8,
        totalLatencyMs: 20,
        usage: { inputTokens: 4, outputTokens: 7 },
        estimatedCost: null,
      },
    });

    assert.equal(saved, true);
    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.equal(request?.url, "https://tcb.tencentcloudapi.com");
    assert.equal(
      new Headers(request?.init?.headers).get("x-tc-action"),
      "RunCommands",
    );
    assert.equal(
      new Headers(request?.init?.headers).get("x-tc-token"),
      "test-session-token",
    );

    const body = JSON.parse(String(request?.init?.body)) as {
      EnvId: string;
      MgoCommands: Array<{
        TableName: string;
        CommandType: string;
        Command: string;
      }>;
    };
    assert.equal(body.EnvId, "demo-env");
    assert.deepEqual(
      body.MgoCommands.map(({ TableName, CommandType }) => ({
        TableName,
        CommandType,
      })),
      [{ TableName: "ai_chat_runs", CommandType: "INSERT" }],
    );
    assert.match(body.MgoCommands[0]?.Command ?? "", /解释流式输出/u);
    assert.match(body.MgoCommands[0]?.Command ?? "", /run-command/u);
  });

  it("decodes CloudBase command results into browser history items", async () => {
    const commandData = JSON.stringify([
      JSON.stringify({
        _id: { $oid: "record-1" },
        prompt: "如何理解 Structured Output？",
        answer: "它让模型按约定结构返回数据。",
        model: "mock-model",
        createdAt: "2026-07-14T18:00:00.000Z",
      }),
    ]);
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          Response: { Data: [commandData], RequestId: "request-2" },
        }),
        { status: 200 },
      );
    const store = new CloudBaseChatStore(configuredDatabase, { fetcher });

    assert.deepEqual(await store.listChats(5), [
      {
        id: "record-1",
        prompt: "如何理解 Structured Output？",
        answer: "它让模型按约定结构返回数据。",
        model: "mock-model",
        createdAt: "2026-07-14T18:00:00.000Z",
      },
    ]);
  });
});
