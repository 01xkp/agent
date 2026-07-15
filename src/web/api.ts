export interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
}

export interface RunMetrics {
  firstTokenMs: number;
  totalLatencyMs: number;
  usage: UsageMetrics;
}

export interface ChatContextMessage {
  content: string;
  role: "assistant" | "user";
}

export interface HealthResponse {
  apiType: string;
  database: {
    enabled: boolean;
    state: string;
  };
  limits: {
    chatHistoryMaxCharacters: number;
    chatHistoryMaxMessages: number;
    chatMaxAttempts: number;
    chatRetryBaseDelayMs: number;
    firstTokenTimeoutMs: number;
    maxOutputTokens: number;
    modelTimeoutMs: number;
  };
  mode: string;
  models: string[];
  ok: boolean;
}

export interface HistoryRecord {
  createdAt: string;
  id: string;
  model: string;
  prompt: string;
}

export interface HistoryResponse {
  enabled: boolean;
  error?: string;
  items: HistoryRecord[];
}

export interface WeekDelivery {
  code: string[];
  status: "done" | "partial";
  tests: string[];
  title: string;
  week: string;
}

export interface LearningDemoResponse {
  agentRun: {
    status: string;
    toolRecords: Array<{
      detail: string;
      name: string;
      status: string;
    }>;
    trace: Array<{
      detail: string;
      kind: string;
    }>;
  };
  ragAnswer: {
    answer: string;
    citations: Array<{
      source: string;
      title: string;
    }>;
  };
  ragEval: {
    averageFaithfulness: number;
    averageMrr: number;
    averageRecall: number;
  };
  supportAgent: {
    humanConfirmationRequired: boolean;
    toolStatuses: string[];
    traceId: string;
  };
  weeks: WeekDelivery[];
}

export interface SupportAgentResponse {
  answer: string;
  citations: Array<{
    source: string;
    title: string;
  }>;
  humanConfirmationRequired: boolean;
  status: string;
  toolStatuses: string[];
  traceId: string;
}

export type WorkflowStep =
  | "context"
  | "generate"
  | "guardrail"
  | "persist"
  | "validate";

type StreamEventPayload =
  | { token: string; type: "token" }
  | { metrics: RunMetrics; type: "metrics" }
  | {
      detail: string;
      status: "active" | "done" | "error";
      step: WorkflowStep;
      type: "workflow";
    }
  | { message: string; type: "error" }
  | { persisted: boolean; type: "done" };

export type StreamEvent = StreamEventPayload & { runId: string };

export function apiUrl(path: string): string {
  const baseUrl = window.desktop?.apiBaseUrl.replace(/\/$/u, "") ?? "";
  return `${baseUrl}${path}`;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(apiUrl("/api/health"));
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as HealthResponse;
}

export async function fetchHistory(): Promise<HistoryResponse> {
  const response = await fetch(apiUrl("/api/history"));
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as HistoryResponse;
}

export async function fetchLearningDemo(): Promise<LearningDemoResponse> {
  const response = await fetch(apiUrl("/api/learning/week2-9"));
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as LearningDemoResponse;
}

export async function runSupportAgent(
  message: string,
  approved: boolean,
): Promise<SupportAgentResponse> {
  const response = await fetch(apiUrl("/api/support-agent"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ approved, message, tenantId: "csfan" }),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as SupportAgentResponse;
}

export async function createStructuredOutput(
  message: string,
  model: string | undefined,
): Promise<unknown> {
  const response = await fetch(apiUrl("/api/structured"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, model }),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json();
}

export async function streamChat(
  message: string,
  model: string | undefined,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
  history: ChatContextMessage[] = [],
): Promise<boolean> {
  const response = await fetch(apiUrl("/api/chat"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ history, message, model }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(await readError(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let persisted = false;

  function processEvent(rawEvent: string): void {
    const line = rawEvent.split("\n").find((item) => item.startsWith("data: "));
    if (!line) return;
    const event = JSON.parse(line.slice(6)) as StreamEvent;
    if (event.type === "error") {
      throw new Error(event.message);
    }
    if (event.type === "done") {
      persisted = event.persisted;
    }
    onEvent(event);
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      processEvent(event);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    processEvent(buffer);
  }
  return persisted;
}
