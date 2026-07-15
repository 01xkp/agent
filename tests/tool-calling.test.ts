import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createToolSchema,
  runToolLoop,
  type ToolCallRecord,
} from "../src/tool-calling.js";

describe("Week 2 Tool Calling 闭环", () => {
  it("暴露工具 Schema、权限、风险和副作用边界", () => {
    const schema = createToolSchema();
    assert.equal(schema.length, 2);
    assert.equal(schema[0]?.name, "ticket.lookup");
    assert.equal(schema[1]?.effect, "write");
    assert.equal(schema[1]?.risk, "high");
  });

  it("只读工具可直接执行，高风险工具进入人工确认", async () => {
    const result = await runToolLoop([
      {
        name: "ticket.lookup",
        input: { ticketId: "T-1001" },
        permissions: ["ticket:read", "refund:preview"],
      },
      {
        name: "refund.preview",
        input: { amount: 100, idempotencyKey: "case-1", ticketId: "T-1002" },
        permissions: ["ticket:read", "refund:preview"],
      },
    ]);

    assert.equal(result.records[0]?.status, "success");
    assert.equal(result.records[1]?.status, "pending_confirmation");
  });

  it("分类权限错误并用幂等键跳过重复副作用", async () => {
    const noPermission = await runToolLoop([
      {
        name: "ticket.lookup",
        input: { ticketId: "T-1001" },
        permissions: [],
      },
    ]);
    assert.equal(noPermission.records[0]?.category, "permission");

    const idempotent = await runToolLoop([
      {
        name: "refund.preview",
        approved: true,
        input: { amount: 100, idempotencyKey: "same-key", ticketId: "T-1002" },
        permissions: ["refund:preview"],
      },
      {
        name: "refund.preview",
        approved: true,
        input: { amount: 100, idempotencyKey: "same-key", ticketId: "T-1002" },
        permissions: ["refund:preview"],
      },
    ]);
    const duplicate = idempotent.records[1] as ToolCallRecord | undefined;
    assert.equal(duplicate?.detail, "幂等键重复，本次跳过");
  });
});
