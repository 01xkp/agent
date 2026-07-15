import type { ModelPrice, TokenUsage } from "./types.js";

export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  return Math.ceil(text.length / 4);
}

export function calculateCost(
  usage: TokenUsage,
  price: ModelPrice | undefined,
): number | null {
  if (!price) {
    return null;
  }

  return (
    (usage.inputTokens * price.inputPerMillion +
      usage.outputTokens * price.outputPerMillion) /
    1_000_000
  );
}
