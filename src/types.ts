export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionMetrics {
  firstTokenMs: number;
  totalLatencyMs: number;
  usage: TokenUsage;
  estimatedCost: number | null;
}

export interface CompletionResult {
  text: string;
  metrics: CompletionMetrics;
}

export interface ChatContextMessage {
  content: string;
  role: "assistant" | "user";
}

export interface CompletionOptions {
  history?: ChatContextMessage[] | undefined;
  model: string;
  prompt: string;
  temperature: number;
  system?: string | undefined;
  signal?: AbortSignal | undefined;
  onToken?: (token: string) => void;
}

export interface ModelClient {
  complete(options: CompletionOptions): Promise<CompletionResult>;
}

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface BaselineCase {
  id: string;
  category: string;
  prompt: string;
  expectedSignals: string[];
}
