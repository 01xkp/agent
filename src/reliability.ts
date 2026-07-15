export type CircuitState = "closed" | "half_open" | "open";

export class SlidingWindowRateLimiter {
  private readonly timestamps = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const active = (this.timestamps.get(key) ?? []).filter(
      (timestamp) => now - timestamp < this.windowMs,
    );
    if (active.length >= this.limit) {
      this.timestamps.set(key, active);
      return false;
    }
    active.push(now);
    this.timestamps.set(key, active);
    return true;
  }
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private stateValue: CircuitState = "closed";

  constructor(
    private readonly failureThreshold: number,
    private readonly resetTimeoutMs: number,
  ) {}

  get state(): CircuitState {
    if (
      this.stateValue === "open" &&
      Date.now() - this.openedAt >= this.resetTimeoutMs
    ) {
      this.stateValue = "half_open";
    }
    return this.stateValue;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      throw new Error("熔断器已打开");
    }
    try {
      const result = await operation();
      this.failures = 0;
      this.stateValue = "closed";
      return result;
    } catch (error) {
      this.failures += 1;
      if (this.failures >= this.failureThreshold) {
        this.stateValue = "open";
        this.openedAt = Date.now();
      }
      throw error;
    }
  }
}

export class TtlCache<T> {
  private readonly values = new Map<string, { expiresAt: number; value: T }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string, now = Date.now()): T | undefined {
    const item = this.values.get(key);
    if (!item) return undefined;
    if (item.expiresAt <= now) {
      this.values.delete(key);
      return undefined;
    }
    return item.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    this.values.set(key, { expiresAt: now + this.ttlMs, value });
  }
}

export async function runWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`请求超过延迟预算：${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function selectModelRoute(
  prompt: string,
  tokenBudget: number,
): "fast" | "mock" | "smart" {
  if (process.env.MOCK_MODE === "true") return "mock";
  if (
    tokenBudget > 2_000 ||
    prompt.includes("退款") ||
    prompt.includes("投诉")
  ) {
    return "smart";
  }
  return "fast";
}
