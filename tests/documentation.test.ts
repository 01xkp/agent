import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";

const root = resolve(".");
const markdownFiles = [
  resolve(root, "README.md"),
  ...readdirSync(resolve(root, "docs"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => resolve(root, "docs", name)),
];

describe("documentation", () => {
  it("keeps every local Markdown link valid", () => {
    for (const file of markdownFiles) {
      const content = readFileSync(file, "utf8");
      const links = content.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu);
      for (const match of links) {
        const target = match[1];
        if (
          !target ||
          target.startsWith("#") ||
          target.startsWith("http://") ||
          target.startsWith("https://") ||
          target.startsWith("mailto:")
        ) {
          continue;
        }
        const path = resolve(dirname(file), target.split("#")[0] ?? target);
        assert.ok(existsSync(path), `${file} links to missing ${target}`);
      }
    }
  });

  it("keeps one clear project, configuration and troubleshooting entry", () => {
    const index = readFileSync(resolve(root, "docs/README.md"), "utf8");
    assert.match(index, /\[项目全景与架构\]\(architecture\.md\)/u);
    assert.match(index, /\[配置参数说明\]\(configuration\.md\)/u);
    assert.match(index, /\[故障排查\]\(troubleshooting\.md\)/u);
  });

  it("keeps a beginner Agent guide with concepts, code mapping and sources", () => {
    const index = readFileSync(resolve(root, "docs/README.md"), "utf8");
    const guide = readFileSync(
      resolve(root, "docs/agent-beginner-guide.md"),
      "utf8",
    );

    assert.match(index, /\[Agent 小白白话指南\]\(agent-beginner-guide\.md\)/u);
    for (const concept of [
      "Workflow",
      "Agent Loop",
      "Tool Calling",
      "RAG",
      "Memory",
      "HITL",
      "Trace",
      "Eval",
      "MCP",
      "Multi-Agent",
    ]) {
      assert.ok(guide.includes(concept), `Agent guide misses ${concept}`);
    }
    assert.match(guide, /src\/agent-engine\.ts/u);
    assert.match(guide, /src\/tool-calling\.ts/u);
    assert.match(
      guide,
      /anthropic\.com\/engineering\/building-effective-agents/u,
    );
    assert.match(guide, /modelcontextprotocol\.io\/introduction/u);
  });
});
