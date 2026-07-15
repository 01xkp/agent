import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { extname, resolve } from "node:path";
import { type AgentWorkflowEvent, runAgentWorkflow } from "./agent-workflow.js";
import {
  CloudBaseChatStore,
  loadCloudBaseDatabaseConfig,
} from "./cloudbase-database.js";
import { type AppConfig, loadConfig } from "./config.js";
import { createLearningRoadmapDemo } from "./learning-demo.js";
import { createModelClient } from "./model-client.js";
import { runEnterpriseSupportAgent } from "./production-agent.js";
import { generateProjectReviewJson } from "./structured-output.js";
import type { ChatContextMessage } from "./types.js";

export interface ServerOptions {
  host?: string;
  log?: boolean;
  port?: number;
  staticDir?: string;
}

export interface StartedServer {
  close: () => Promise<void>;
  server: Server;
  url: string;
}

function getPort(value: number | undefined): number {
  const port = value ?? Number(process.env.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 0) {
    throw new Error("PORT 必须是非负整数");
  }
  return port;
}

function json(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

function sendStreamEvent(
  res: ServerResponse,
  runId: string,
  body: Record<string, unknown>,
): void {
  res.write(`data: ${JSON.stringify({ ...body, runId })}\n\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 1_000_000) {
      throw new Error("请求体过大");
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as unknown) : {};
}

function readStringField(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".ico":
      return "image/x-icon";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function setDesktopCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (
    origin === "null" ||
    origin?.startsWith("http://127.0.0.1:") ||
    origin?.startsWith("http://localhost:")
  ) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("vary", "Origin");
  }
}

export async function startServer(
  options: ServerOptions = {},
): Promise<StartedServer> {
  const config = loadConfig();
  const client = createModelClient(config);
  const chatStore = new CloudBaseChatStore(loadCloudBaseDatabaseConfig());
  const staticDir = resolve(options.staticDir ?? "dist/web");
  const host = options.host ?? "0.0.0.0";
  const port = getPort(options.port);
  let databaseState = chatStore.status.enabled ? "configured" : "disabled";

  function readRequestPayload(body: unknown): {
    history: ChatContextMessage[];
    message: string;
    model: string;
    system?: string;
  } {
    if (!isRecord(body)) {
      throw new Error("请求体必须是 JSON 对象");
    }

    const message = readStringField(body, "message");
    if (!message) {
      throw new Error("message 不能为空");
    }

    const firstModel = config.models[0];
    if (!firstModel) {
      throw new Error("至少需要配置一个模型");
    }

    const system = readStringField(body, "system");
    return {
      history: readChatHistory(body.history, config),
      message,
      model: readStringField(body, "model") ?? firstModel,
      ...(system ? { system } : {}),
    };
  }

  async function handleChat(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const payload = readRequestPayload(await readJsonBody(req));
    const runId = randomUUID();
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    res.writeHead(200, {
      "cache-control": "no-cache",
      "content-type": "text/event-stream; charset=utf-8",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.flushHeaders();
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": heartbeat\n\n");
      }
    }, 10_000);
    heartbeat.unref();

    try {
      const result = await runAgentWorkflow(
        client,
        {
          model: payload.model,
          history: payload.history,
          ...(payload.system ? { system: payload.system } : {}),
          prompt: payload.message,
          temperature: config.temperature,
          signal: controller.signal,
          onToken: (token) =>
            sendStreamEvent(res, runId, { type: "token", token }),
        },
        {
          onEvent: (event: AgentWorkflowEvent) =>
            sendStreamEvent(res, runId, { type: "workflow", ...event }),
        },
        {
          maxAttempts: config.chatMaxAttempts,
          retryBaseDelayMs: config.chatRetryBaseDelayMs,
        },
      );
      sendStreamEvent(res, runId, {
        type: "metrics",
        metrics: result.metrics,
      });
      sendStreamEvent(res, runId, {
        type: "workflow",
        step: "persist",
        status: "active",
        detail: "正在保存运行记录",
      });
      let persisted = false;
      try {
        persisted = await chatStore.saveChat({
          prompt: payload.message,
          answer: result.text,
          model: payload.model,
          mode: config.mockMode ? "mock" : "real",
          metrics: result.metrics,
          runId,
        });
        if (persisted) databaseState = "connected";
        sendStreamEvent(res, runId, {
          type: "workflow",
          step: "persist",
          status: "done",
          detail: persisted ? "云端记录已保存" : "本地会话已保留",
        });
      } catch (error) {
        databaseState = "error";
        sendStreamEvent(res, runId, {
          type: "workflow",
          step: "persist",
          status: "error",
          detail: "云端保存失败，本次回答仍可使用",
        });
        console.error(
          "CloudBase 聊天记录保存失败：",
          error instanceof Error ? error.message : String(error),
        );
      }
      sendStreamEvent(res, runId, { type: "done", persisted });
    } catch (error) {
      if (!controller.signal.aborted) {
        sendStreamEvent(res, runId, {
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }

  async function handleStructured(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const payload = readRequestPayload(await readJsonBody(req));
    const result = await generateProjectReviewJson(
      client,
      payload.model,
      config.temperature,
      payload.message,
    );
    json(res, 200, result);
  }

  async function handleLearningDemo(res: ServerResponse): Promise<void> {
    json(res, 200, await createLearningRoadmapDemo());
  }

  async function handleSupportAgent(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readJsonBody(req);
    if (!isRecord(body)) {
      throw new Error("请求体必须是 JSON 对象");
    }
    const message = readStringField(body, "message");
    if (!message) {
      throw new Error("message 不能为空");
    }
    const result = await runEnterpriseSupportAgent(
      message,
      body.approved === true,
      readStringField(body, "tenantId") ?? "csfan",
    );
    console.log(
      JSON.stringify({
        event: "support_agent_completed",
        status: result.status,
        traceId: result.traceId,
      }),
    );
    json(res, 200, result);
  }

  async function handleHistory(res: ServerResponse): Promise<void> {
    try {
      const items = await chatStore.listChats();
      if (chatStore.status.enabled) databaseState = "connected";
      json(res, 200, {
        enabled: chatStore.status.enabled,
        items,
      });
    } catch (error) {
      databaseState = "error";
      json(res, 503, {
        enabled: true,
        items: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function handleStatic(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    res.setHeader(
      "content-security-policy",
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://staticimgly.com http://127.0.0.1:* http://localhost:*; worker-src 'self' blob:",
    );
    res.setHeader("x-content-type-options", "nosniff");
    const url = new URL(req.url ?? "/", "http://localhost");
    const relativePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = resolve(staticDir, `.${relativePath}`);

    if (!filePath.startsWith(staticDir)) {
      json(res, 403, { error: "禁止访问" });
      return;
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        json(res, 404, { error: "文件不存在" });
        return;
      }
      res.writeHead(200, { "content-type": contentTypeFor(filePath) });
      createReadStream(filePath).pipe(res);
    } catch {
      try {
        const fallback = await readFile(
          resolve(staticDir, "index.html"),
          "utf8",
        );
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(fallback);
      } catch {
        json(res, 404, {
          error: "前端资源尚未构建，请先运行 npm run build:web",
        });
      }
    }
  }

  const server = createServer((req, res) => {
    void (async () => {
      try {
        setDesktopCors(req, res);
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        const url = new URL(req.url ?? "/", "http://localhost");
        if (req.method === "GET" && url.pathname === "/api/health") {
          json(res, 200, {
            ok: true,
            mode: config.mockMode ? "mock" : "real",
            apiType: config.apiType,
            models: config.models,
            limits: {
              chatHistoryMaxCharacters: config.chatHistoryMaxCharacters,
              chatHistoryMaxMessages: config.chatHistoryMaxMessages,
              chatMaxAttempts: config.chatMaxAttempts,
              chatRetryBaseDelayMs: config.chatRetryBaseDelayMs,
              firstTokenTimeoutMs: config.firstTokenTimeoutMs,
              maxOutputTokens: config.maxOutputTokens,
              modelTimeoutMs: config.modelTimeoutMs,
            },
            database: {
              ...chatStore.status,
              state: databaseState,
            },
          });
          return;
        }

        if (req.method === "GET" && url.pathname === "/api/history") {
          await handleHistory(res);
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/chat") {
          await handleChat(req, res);
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/structured") {
          await handleStructured(req, res);
          return;
        }

        if (req.method === "GET" && url.pathname === "/api/learning/week2-9") {
          await handleLearningDemo(res);
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/support-agent") {
          await handleSupportAgent(req, res);
          return;
        }

        if (req.method === "GET") {
          await handleStatic(req, res);
          return;
        }

        json(res, 405, { error: "方法不支持" });
      } catch (error) {
        json(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法读取服务监听地址");
  }
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  const url = `http://${displayHost}:${address.port}`;
  if (options.log !== false) {
    console.log(`CS 凡已启动：${url}`);
  }

  return {
    server,
    url,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) {
            rejectClose(error);
          } else {
            resolveClose();
          }
        });
      }),
  };
}

function readChatHistory(
  value: unknown,
  config: Pick<
    AppConfig,
    "chatHistoryMaxCharacters" | "chatHistoryMaxMessages"
  >,
): ChatContextMessage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error("history 必须是数组");
  }
  if (value.length > config.chatHistoryMaxMessages) {
    throw new Error(`history 最多保留 ${config.chatHistoryMaxMessages} 条消息`);
  }

  let totalLength = 0;
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error("history 每一项都必须是对象");
    }
    const role = item.role;
    const content = item.content;
    if (
      (role !== "assistant" && role !== "user") ||
      typeof content !== "string" ||
      !content.trim()
    ) {
      throw new Error("history 只支持非空的 user/assistant 消息");
    }
    const normalizedContent = content.trim();
    totalLength += normalizedContent.length;
    if (totalLength > config.chatHistoryMaxCharacters) {
      throw new Error(
        `history 总长度不能超过 ${config.chatHistoryMaxCharacters} 个字符`,
      );
    }
    return { role, content: normalizedContent };
  });
}
