import type {
  CompletionOptions,
  CompletionResult,
  ModelClient,
} from "./types.js";

export interface RetrySettings {
  maxAttempts?: number;
  baseDelayMs?: number;
  onRetry?: (nextAttempt: number, maxAttempts: number, error: Error) => void;
}

export function isTransientModelError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    /capacity|high demand|rate.?limit|timeout|terminated|connection reset|socket hang up|ECONNRESET|429|500|502|503|504|529/iu.test(
      error.message,
    )
  );
}

export async function completeWithRetry(
  client: ModelClient,
  options: CompletionOptions,
  settings: RetrySettings = {},
): Promise<CompletionResult> {
  const maxAttempts = settings.maxAttempts ?? 3;
  const baseDelayMs = settings.baseDelayMs ?? 5_000;

  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new Error("maxAttempts 必须是正整数");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let emittedToken = false;
    try {
      return await client.complete({
        ...options,
        ...(options.onToken
          ? {
              onToken: (token: string) => {
                emittedToken = true;
                options.onToken?.(token);
              },
            }
          : {}),
      });
    } catch (error) {
      if (
        emittedToken ||
        !isTransientModelError(error) ||
        attempt === maxAttempts
      ) {
        throw error;
      }

      settings.onRetry?.(attempt + 1, maxAttempts, error);
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      if (delayMs > 0) {
        await waitForRetry(delayMs, options.signal);
      }
    }
  }

  throw new Error("模型调用未返回结果");
}

async function waitForRetry(
  delayMs: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("请求已中止");
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new Error("请求已中止"),
        );
      },
      { once: true },
    );
  });
}
