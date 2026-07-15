import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

interface BaselineCase {
  id: string;
  category: string;
  prompt: string;
  expectedSignals: string[];
}

function loadBaselineCases(): BaselineCase[] {
  return readFileSync("evals/baseline.jsonl", "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as BaselineCase);
}

describe("baseline evaluation dataset", () => {
  it("keeps a fixed regression set with at least 20 cases", () => {
    const cases = loadBaselineCases();
    assert.ok(cases.length >= 20);
    assert.equal(
      new Set(cases.map((testCase) => testCase.id)).size,
      cases.length,
    );
  });

  it("keeps every baseline case reviewable", () => {
    for (const testCase of loadBaselineCases()) {
      assert.ok(testCase.id);
      assert.ok(testCase.category);
      assert.ok(testCase.prompt.length > 10);
      assert.ok(testCase.expectedSignals.length > 0);
    }
  });
});
