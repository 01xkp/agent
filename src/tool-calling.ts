import { randomUUID } from "node:crypto";

export type ToolRiskLevel = "low" | "medium" | "high";
export type ToolEffect = "read" | "write";
export type ToolCallStatus =
  | "approved"
  | "failed"
  | "pending_confirmation"
  | "rejected"
  | "success";
export type ToolErrorCategory =
  | "permission"
  | "timeout"
  | "validation"
  | "transient"
  | "unknown";

export interface ToolParameterSpec {
  description: string;
  required: boolean;
  type: "boolean" | "number" | "string";
}

export interface ToolDefinition {
  description: string;
  effect: ToolEffect;
  execute: (
    input: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<unknown>;
  idempotent: boolean;
  name: string;
  parameters: Record<string, ToolParameterSpec>;
  permissions: string[];
  retryable: boolean;
  risk: ToolRiskLevel;
  timeoutMs: number;
  validateInput: (input: unknown) => Record<string, unknown>;
  validateOutput: (output: unknown) => unknown;
}

export interface ToolCallRequest {
  approved?: boolean;
  idempotencyKey?: string;
  input: unknown;
  name: string;
  permissions: string[];
}

export interface ToolCallRecord {
  category?: ToolErrorCategory;
  detail: string;
  effect: ToolEffect;
  id: string;
  input: unknown;
  name: string;
  risk: ToolRiskLevel;
  status: ToolCallStatus;
}

export interface ToolLoopResult {
  records: ToolCallRecord[];
  results: Record<string, unknown>;
}

export interface SupportTicket {
  body: string;
  id: string;
  priority: "high" | "low" | "medium";
  status: "closed" | "open";
  title: string;
}

export interface RefundPreview {
  amount: number;
  idempotencyKey: string;
  requiresApproval: true;
  ticketId: string;
}

export interface ToolRuntimeOptions {
  maxRetries: number;
}

const ticketData: SupportTicket[] = [
  {
    id: "T-1001",
    title: "会员无法登录",
    body: "用户绑定手机号后仍提示验证码过期，可先清理浏览器缓存，再重新发送验证码。",
    priority: "medium",
    status: "open",
  },
  {
    id: "T-1002",
    title: "退款进度查询",
    body: "订单进入退款审核后通常 1-3 个工作日完成，超过 3 天需要人工确认。",
    priority: "high",
    status: "open",
  },
];

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function readRequiredString(
  value: Record<string, unknown>,
  key: string,
): string {
  const field = value[key];
  if (typeof field !== "string" || !field.trim()) {
    throw new Error(`${key} 必须是非空字符串`);
  }
  return field.trim();
}

function readRequiredNumber(
  value: Record<string, unknown>,
  key: string,
): number {
  const field = value[key];
  if (typeof field !== "number" || !Number.isFinite(field)) {
    throw new Error(`${key} 必须是数字`);
  }
  return field;
}

function classifyToolError(error: unknown): ToolErrorCategory {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("权限")) return "permission";
  if (message.includes("超时")) return "timeout";
  if (message.includes("必须")) return "validation";
  if (message.includes("重试")) return "transient";
  return "unknown";
}

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`工具执行超时：${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(
  run: () => Promise<T>,
  retryable: boolean,
  maxRetries: number,
): Promise<T> {
  let lastError: unknown;
  const attempts = retryable ? maxRetries + 1 : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!retryable || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 10));
    }
  }
  throw lastError;
}

function outputTicket(value: unknown): SupportTicket {
  const record = requireRecord(value, "ticket");
  const status = record.status;
  const priority = record.priority;
  if (
    (status !== "open" && status !== "closed") ||
    (priority !== "low" && priority !== "medium" && priority !== "high")
  ) {
    throw new Error("ticket 输出格式无效");
  }
  return {
    body: readRequiredString(record, "body"),
    id: readRequiredString(record, "id"),
    priority,
    status,
    title: readRequiredString(record, "title"),
  };
}

function outputRefundPreview(value: unknown): RefundPreview {
  const record = requireRecord(value, "refund");
  if (record.requiresApproval !== true) {
    throw new Error("退款工具必须标记 requiresApproval");
  }
  return {
    amount: readRequiredNumber(record, "amount"),
    idempotencyKey: readRequiredString(record, "idempotencyKey"),
    requiresApproval: true,
    ticketId: readRequiredString(record, "ticketId"),
  };
}

export const supportTools: ToolDefinition[] = [
  {
    name: "ticket.lookup",
    description: "按工单号读取客服工单，只读且可重试。",
    effect: "read",
    risk: "low",
    permissions: ["ticket:read"],
    idempotent: true,
    retryable: true,
    timeoutMs: 1_500,
    parameters: {
      ticketId: {
        type: "string",
        required: true,
        description: "客服工单 ID，例如 T-1001",
      },
    },
    validateInput(input: unknown) {
      const record = requireRecord(input, "ticket.lookup input");
      return { ticketId: readRequiredString(record, "ticketId") };
    },
    validateOutput: outputTicket,
    async execute(input: Record<string, unknown>, signal: AbortSignal) {
      if (signal.aborted) throw new Error("工具执行超时");
      const ticketId = readRequiredString(input, "ticketId");
      const ticket = ticketData.find((item) => item.id === ticketId);
      if (!ticket) throw new Error("未找到工单");
      return ticket;
    },
  },
  {
    name: "refund.preview",
    description: "生成退款动作预览；属于副作用工具，必须人工确认。",
    effect: "write",
    risk: "high",
    permissions: ["refund:preview"],
    idempotent: true,
    retryable: false,
    timeoutMs: 1_500,
    parameters: {
      ticketId: {
        type: "string",
        required: true,
        description: "退款关联工单 ID",
      },
      amount: {
        type: "number",
        required: true,
        description: "退款金额",
      },
      idempotencyKey: {
        type: "string",
        required: true,
        description: "幂等键，避免重复执行",
      },
    },
    validateInput(input: unknown) {
      const record = requireRecord(input, "refund.preview input");
      const amount = readRequiredNumber(record, "amount");
      if (amount <= 0) throw new Error("amount 必须大于 0");
      return {
        amount,
        idempotencyKey: readRequiredString(record, "idempotencyKey"),
        ticketId: readRequiredString(record, "ticketId"),
      };
    },
    validateOutput: outputRefundPreview,
    async execute(input: Record<string, unknown>, signal: AbortSignal) {
      if (signal.aborted) throw new Error("工具执行超时");
      return {
        amount: readRequiredNumber(input, "amount"),
        idempotencyKey: readRequiredString(input, "idempotencyKey"),
        requiresApproval: true as const,
        ticketId: readRequiredString(input, "ticketId"),
      };
    },
  },
];

export function createToolSchema(): Array<
  Pick<
    ToolDefinition,
    | "description"
    | "effect"
    | "idempotent"
    | "name"
    | "parameters"
    | "permissions"
    | "risk"
  >
> {
  return supportTools.map((tool) => ({
    description: tool.description,
    effect: tool.effect,
    idempotent: tool.idempotent,
    name: tool.name,
    parameters: tool.parameters,
    permissions: tool.permissions,
    risk: tool.risk,
  }));
}

export async function runToolLoop(
  requests: ToolCallRequest[],
  options: ToolRuntimeOptions = { maxRetries: 1 },
): Promise<ToolLoopResult> {
  const records: ToolCallRecord[] = [];
  const results: Record<string, unknown> = {};
  const seenIdempotencyKeys = new Set<string>();

  for (const request of requests) {
    const tool = supportTools.find((item) => item.name === request.name);
    const recordBase = {
      id: randomUUID(),
      input: request.input,
      name: request.name,
    };

    if (!tool) {
      records.push({
        ...recordBase,
        category: "validation",
        detail: "工具不存在",
        effect: "read",
        risk: "low",
        status: "failed",
      });
      continue;
    }

    const missingPermission = tool.permissions.find(
      (permission) => !request.permissions.includes(permission),
    );
    if (missingPermission) {
      records.push({
        ...recordBase,
        category: "permission",
        detail: `缺少权限：${missingPermission}`,
        effect: tool.effect,
        risk: tool.risk,
        status: "failed",
      });
      continue;
    }

    if (tool.risk === "high" && request.approved !== true) {
      records.push({
        ...recordBase,
        detail: "高风险工具等待人工确认",
        effect: tool.effect,
        risk: tool.risk,
        status: "pending_confirmation",
      });
      continue;
    }

    try {
      const input = tool.validateInput(request.input);
      const idempotencyKey =
        request.idempotencyKey ??
        (typeof input === "object" &&
        input !== null &&
        "idempotencyKey" in input &&
        typeof input.idempotencyKey === "string"
          ? input.idempotencyKey
          : "");
      if (tool.effect === "write" && idempotencyKey) {
        if (seenIdempotencyKeys.has(idempotencyKey)) {
          records.push({
            ...recordBase,
            detail: "幂等键重复，本次跳过",
            effect: tool.effect,
            risk: tool.risk,
            status: "success",
          });
          continue;
        }
        seenIdempotencyKeys.add(idempotencyKey);
      }
      const output = await withRetry(
        () =>
          withTimeout((signal) => tool.execute(input, signal), tool.timeoutMs),
        tool.retryable,
        options.maxRetries,
      );
      const validatedOutput = tool.validateOutput(output);
      results[tool.name] = validatedOutput;
      records.push({
        ...recordBase,
        detail: "工具执行成功",
        effect: tool.effect,
        risk: tool.risk,
        status: "success",
      });
    } catch (error) {
      records.push({
        ...recordBase,
        category: classifyToolError(error),
        detail: error instanceof Error ? error.message : String(error),
        effect: tool.effect,
        risk: tool.risk,
        status: "failed",
      });
    }
  }

  return { records, results };
}
