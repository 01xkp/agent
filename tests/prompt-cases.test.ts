import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PROMPT_TASKS } from "../src/prompts.js";

interface PromptCase {
  id: string;
  task: string;
  input: string;
  expectedSignals: string[];
}

function loadPromptCases(): PromptCase[] {
  return readFileSync("evals/prompt-cases.jsonl", "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PromptCase);
}

describe("prompt evaluation dataset", () => {
  it("covers every prompt task with multiple examples", () => {
    const cases = loadPromptCases();

    for (const task of PROMPT_TASKS) {
      assert.ok(
        cases.filter((testCase) => testCase.task === task).length >= 3,
        `缺少 ${task} 的评测用例`,
      );
    }
  });

  it("keeps every case grounded by expected signals", () => {
    for (const testCase of loadPromptCases()) {
      assert.ok(testCase.id);
      assert.ok(testCase.input.length > 20);
      assert.ok(testCase.expectedSignals.length > 0);
    }
  });
});
