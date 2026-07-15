import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  answerAcrossKnowledgeBases,
  answerWithCitations,
  evaluateRetrieval,
  parseDocuments,
  retrieveChunks,
  runAsyncIndexJob,
  sampleKnowledgeBases,
  sampleKnowledgeDocuments,
  sampleRagEvalCases,
} from "../src/rag-engine.js";

describe("Week 3-4 RAG 与检索评测", () => {
  it("解析文档、切分 chunk 并生成本地向量", () => {
    const chunks = parseDocuments(sampleKnowledgeDocuments);
    assert.ok(chunks.length >= 3);
    assert.equal(chunks[0]?.chunkId, "doc-login#0");
    assert.equal(chunks[0]?.embedding.length, 64);
  });

  it("支持 Keyword、Vector、Hybrid 检索和权限隔离", () => {
    const chunks = parseDocuments(sampleKnowledgeDocuments);
    const keyword = retrieveChunks(
      chunks,
      "退款超过三天怎么办",
      "support",
      "keyword",
      2,
    );
    const vector = retrieveChunks(
      chunks,
      "退款超过三天怎么办",
      "support",
      "vector",
      2,
    );
    const limited = retrieveChunks(
      chunks,
      "退款超过三天怎么办",
      "viewer",
      "hybrid",
      2,
    );

    assert.equal(keyword.hits[0]?.chunk.documentId, "doc-refund");
    assert.ok(vector.hits.length > 0);
    assert.deepEqual(limited.rejectedDocuments, ["doc-refund"]);
  });

  it("回答包含引用并计算 Recall、MRR、忠实度", () => {
    const answer = answerWithCitations(
      sampleKnowledgeDocuments,
      "验证码一直失败怎么处理？",
      "viewer",
    );
    assert.ok(answer.citations.some((item) => item.source.includes("login")));
    assert.match(answer.answer, /根据知识库/u);

    const evalSummary = evaluateRetrieval(
      sampleKnowledgeDocuments,
      sampleRagEvalCases,
    );
    assert.equal(evalSummary.averageRecall, 1);
    assert.equal(evalSummary.averageMrr, 1);
    assert.equal(evalSummary.averageFaithfulness, 1);
  });

  it("异步索引记录运维状态和重试次数", async () => {
    const result = await runAsyncIndexJob(sampleKnowledgeDocuments);
    assert.equal(result.operation.status, "succeeded");
    assert.ok(result.chunks.length > 0);
  });

  it("按租户、知识库白名单和角色隔离多知识库", () => {
    const viewer = answerAcrossKnowledgeBases(
      sampleKnowledgeBases,
      {
        allowedKnowledgeBaseIds: ["public-help"],
        role: "viewer",
        tenantId: "csfan",
      },
      "退款超过三天怎么办？",
    );
    assert.equal(viewer.citations.length, 0);
    assert.ok(viewer.rejectedKnowledgeBases.includes("support-private"));

    const support = answerAcrossKnowledgeBases(
      sampleKnowledgeBases,
      {
        allowedKnowledgeBaseIds: ["support-private"],
        role: "support",
        tenantId: "csfan",
      },
      "退款超过三天怎么办？",
    );
    assert.equal(support.citations[0]?.chunkId, "doc-refund#0");
  });
});
