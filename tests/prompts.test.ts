import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getPrompt,
  PROMPT_TASKS,
  PROMPT_VERSIONS,
  PROMPTS,
  type PromptName,
} from "../src/prompts.js";

const expectedNames = PROMPT_TASKS.flatMap((task) =>
  PROMPT_VERSIONS.map((version) => `${task}.${version}` as PromptName),
);

describe("versioned prompts", () => {
  it("defines V1, V2, and V3 for every task", () => {
    assert.deepEqual(Object.keys(PROMPTS).sort(), expectedNames.sort());
    assert.equal(new Set(Object.keys(PROMPTS)).size, 9);
  });

  it("creates non-empty user messages containing the input", () => {
    for (const name of expectedNames) {
      const message = getPrompt(name).createUserMessage("测试输入 123");
      assert.ok(message.trim());
      assert.match(message, /测试输入 123/u);
    }
  });

  it("adds boundaries and examples to the detailed versions", () => {
    for (const task of PROMPT_TASKS) {
      const v2 = getPrompt(`${task}.v2`);
      const v3 = getPrompt(`${task}.v3`);
      const v2Message = v2.createUserMessage("测试输入");
      const v3Message = v3.createUserMessage("测试输入");

      assert.match(v2Message, /<(?:article|meeting|project)>/u);
      assert.match(v3Message, /<(?:article|meeting|project)>/u);
      assert.match(v3Message, /示例输入/u);
      assert.ok(v2.system.trim());
      assert.ok(v3.system.trim());
    }
  });

  it("does not place credential-like text in prompts", () => {
    for (const name of expectedNames) {
      const prompt = getPrompt(name);
      const content = `${prompt.system}\n${prompt.createUserMessage("测试输入")}`;
      assert.doesNotMatch(content, /api[_ -]?key|sk-[a-z0-9]{8,}/iu);
    }
  });
});
