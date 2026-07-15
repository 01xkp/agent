import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readJsonLines(fileName: string): unknown[] {
  return readFileSync(new URL(`../evals/${fileName}`, import.meta.url), "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

describe("Week 2-9 固定评测数据", () => {
  it("保留可重复的 RAG 与 Red Team 数据集", () => {
    const rag = readJsonLines("rag-cases.jsonl");
    const redTeam = readJsonLines("red-team-cases.jsonl");
    assert.equal(rag.length, 3);
    assert.equal(redTeam.length, 3);
  });
});
