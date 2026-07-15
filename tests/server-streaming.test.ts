import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { type StartedServer, startServer } from "../src/server.js";

interface TimedStreamEvent {
  elapsedMs: number;
  runId: string;
  type: string;
}

describe("chat SSE streaming", () => {
  let originalMockMode: string | undefined;
  let originalModelIds: string | undefined;
  let originalHistoryMaxMessages: string | undefined;
  let server: StartedServer;

  before(async () => {
    originalMockMode = process.env.MOCK_MODE;
    originalModelIds = process.env.MODEL_IDS;
    originalHistoryMaxMessages = process.env.CHAT_HISTORY_MAX_MESSAGES;
    process.env.MOCK_MODE = "true";
    process.env.MODEL_IDS = "mock-small";
    process.env.CHAT_HISTORY_MAX_MESSAGES = "2";
    server = await startServer({ host: "127.0.0.1", port: 0, log: false });
  });

  after(async () => {
    await server.close();
    restoreEnv("MOCK_MODE", originalMockMode);
    restoreEnv("MODEL_IDS", originalModelIds);
    restoreEnv("CHAT_HISTORY_MAX_MESSAGES", originalHistoryMaxMessages);
  });

  it("flushes headers and sends token events before the full answer completes", async () => {
    const startedAt = performance.now();
    const response = await fetch(`${server.url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        history: [
          { role: "user", content: "我叫小凡" },
          { role: "assistant", content: "你好，小凡。" },
        ],
        message: "只回答：好",
      }),
    });
    const headersMs = performance.now() - startedAt;

    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type") ?? "",
      /text\/event-stream/u,
    );
    assert.equal(response.headers.get("x-accel-buffering"), "no");
    assert.ok(headersMs < 500, `SSE headers took ${headersMs}ms`);
    assert.ok(response.body);

    const events = await readTimedEvents(response.body, startedAt);
    const firstToken = events.find((event) => event.type === "token");
    const metrics = events.find((event) => event.type === "metrics");
    const done = events.find((event) => event.type === "done");
    const tokenCount = events.filter((event) => event.type === "token").length;
    const runIds = new Set(events.map((event) => event.runId));

    assert.ok(firstToken);
    assert.ok(metrics);
    assert.ok(done);
    assert.ok(tokenCount > 1);
    assert.equal(runIds.size, 1);
    assert.match(events[0]?.runId ?? "", /^[0-9a-f-]{36}$/u);
    assert.ok(firstToken.elapsedMs < 1_000);
    assert.ok(firstToken.elapsedMs < metrics.elapsedMs);
    assert.ok(firstToken.elapsedMs < done.elapsedMs);
  });

  it("publishes safe runtime limits and rejects oversized history", async () => {
    const healthResponse = await fetch(`${server.url}/api/health`);
    const health = (await healthResponse.json()) as {
      limits: { chatHistoryMaxMessages: number };
    };
    assert.equal(health.limits.chatHistoryMaxMessages, 2);

    const response = await fetch(`${server.url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        history: [
          { role: "user", content: "一" },
          { role: "assistant", content: "二" },
          { role: "user", content: "三" },
        ],
        message: "继续",
      }),
    });
    assert.equal(response.status, 500);
    assert.match(await response.text(), /history 最多保留 2 条消息/u);
  });
});

async function readTimedEvents(
  body: ReadableStream<Uint8Array>,
  startedAt: number,
): Promise<TimedStreamEvent[]> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const events: TimedStreamEvent[] = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const data = chunk.split("\n").find((line) => line.startsWith("data: "));
      if (!data) continue;
      const event = JSON.parse(data.slice(6)) as {
        runId: string;
        type: string;
      };
      events.push({
        elapsedMs: performance.now() - startedAt,
        runId: event.runId,
        type: event.type,
      });
    }
  }

  return events;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
