import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateAgentRuns,
  explainWorkflowPatterns,
  handleMcpMessage,
  resumeFromCheckpoint,
  runResearchAgent,
} from "../src/agent-engine.js";

describe("Week 5-7 Agent Loop、HITL、Memory、MCP 与 Trace", () => {
  it("解释五类 Workflow 并限制 Agent 最大步数", async () => {
    const patterns = explainWorkflowPatterns();
    assert.match(patterns.sequence, /顺序/u);
    assert.match(patterns.parallel, /并行/u);
    const limited = await runResearchAgent("测试最大轮数", { maxSteps: 1 });
    assert.equal(limited.status, "max_steps_reached");
  });

  it("支持高风险动作等待人工确认", async () => {
    const result = await runResearchAgent("退款超过三天没有完成怎么办？");
    assert.equal(result.status, "waiting_for_human");
    assert.ok(
      result.toolRecords.some(
        (record) => record.status === "pending_confirmation",
      ),
    );
  });

  it("支持 checkpoint、中断恢复和三层记忆", async () => {
    const interrupted = await runResearchAgent("验证码失败怎么办？", {
      interruptAfterStep: 2,
    });
    assert.equal(interrupted.status, "interrupted");
    assert.ok(interrupted.memory.some((item) => item.kind === "long_term"));
    const resumedTrace = resumeFromCheckpoint(interrupted.checkpoint);
    assert.match(resumedTrace.at(-1)?.detail ?? "", /恢复运行/u);
  });

  it("提供最小 MCP Server/Client 消息处理", () => {
    const tools = handleMcpMessage({ method: "tools/list" });
    assert.match(JSON.stringify(tools), /knowledge\.search/u);
    const answer = handleMcpMessage({
      method: "tools/call",
      params: {
        name: "knowledge.search",
        arguments: { query: "验证码失败" },
      },
    });
    assert.match(JSON.stringify(answer), /citations/u);
  });

  it("统计任务成功率、步骤数和工具错误率", async () => {
    const completed = await runResearchAgent("退款超过三天没有完成怎么办？", {
      approved: true,
    });
    const waiting = await runResearchAgent("退款超过三天没有完成怎么办？");
    const summary = evaluateAgentRuns([completed, waiting]);
    assert.equal(summary.taskSuccessRate, 0.5);
    assert.ok(summary.averageSteps > 0);
    assert.equal(summary.toolErrorRate, 0);
  });
});
