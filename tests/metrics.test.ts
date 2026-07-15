import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateCost, estimateTokens } from "../src/metrics.js";

describe("metrics", () => {
  it("estimates tokens for offline mock runs", () => {
    assert.equal(estimateTokens("12345678"), 2);
  });

  it("calculates cost from per-million-token prices", () => {
    assert.equal(
      calculateCost(
        { inputTokens: 1_000_000, outputTokens: 500_000 },
        { inputPerMillion: 1, outputPerMillion: 2 },
      ),
      2,
    );
  });

  it("returns null when pricing is not configured", () => {
    assert.equal(
      calculateCost({ inputTokens: 1, outputTokens: 1 }, undefined),
      null,
    );
  });
});
