import { randomUUID } from "node:crypto";

export type RetrievalStrategy = "hybrid" | "keyword" | "vector";
export type KnowledgeRole = "support" | "viewer";
export type IndexJobStatus = "failed" | "queued" | "running" | "succeeded";

export interface KnowledgeDocument {
  content: string;
  id: string;
  requiredRole: KnowledgeRole;
  source: string;
  title: string;
}

export interface KnowledgeBase {
  documents: KnowledgeDocument[];
  id: string;
  tenantId: string;
  title: string;
}

export interface KnowledgeChunk {
  chunkId: string;
  content: string;
  documentId: string;
  embedding: number[];
  requiredRole: KnowledgeRole;
  source: string;
  title: string;
  tokens: string[];
}

export interface RetrievalHit {
  chunk: KnowledgeChunk;
  keywordScore: number;
  score: number;
  vectorScore: number;
}

export interface RagAnswer {
  answer: string;
  citations: Array<{
    chunkId: string;
    excerpt: string;
    source: string;
    title: string;
  }>;
  rejectedDocuments: string[];
  strategy: RetrievalStrategy;
}

export interface RagEvalCase {
  expectedChunkIds: string[];
  id: string;
  query: string;
  role: KnowledgeRole;
}

export interface RagEvalResult {
  caseId: string;
  faithfulness: number;
  firstRelevantRank: number | null;
  mrr: number;
  recall: number;
}

export interface RagEvalSummary {
  averageFaithfulness: number;
  averageMrr: number;
  averageRecall: number;
  results: RagEvalResult[];
}

export interface IndexOperation {
  detail: string;
  id: string;
  retries: number;
  status: IndexJobStatus;
}

const vectorSize = 64;

export const sampleKnowledgeDocuments: KnowledgeDocument[] = [
  {
    id: "doc-login",
    title: "登录验证码处理",
    source: "docs/support/login.md",
    requiredRole: "viewer",
    content:
      "如果用户无法登录，先确认手机号是否正确，再重新发送验证码。验证码连续失败时，建议清理浏览器缓存并等待 60 秒后重试。",
  },
  {
    id: "doc-refund",
    title: "退款审核规则",
    source: "docs/support/refund.md",
    requiredRole: "support",
    content:
      "退款审核通常需要 1-3 个工作日。超过 3 个工作日仍未完成时，需要人工客服确认订单、支付渠道和退款流水。",
  },
  {
    id: "doc-security",
    title: "数据安全边界",
    source: "docs/security/data-boundary.md",
    requiredRole: "viewer",
    content:
      "客服 Agent 不应在回答中输出 API Key、SecretId、SecretKey、身份证号或完整手机号。涉及敏感字段时只能说明处理流程。",
  },
];

export const sampleKnowledgeBases: KnowledgeBase[] = [
  {
    documents: sampleKnowledgeDocuments.filter(
      (document) => document.requiredRole === "viewer",
    ),
    id: "public-help",
    tenantId: "csfan",
    title: "公开帮助中心",
  },
  {
    documents: sampleKnowledgeDocuments.filter(
      (document) => document.requiredRole === "support",
    ),
    id: "support-private",
    tenantId: "csfan",
    title: "客服内部知识库",
  },
];

export const sampleRagEvalCases: RagEvalCase[] = [
  {
    id: "rag-login-001",
    query: "验证码一直失败怎么处理？",
    role: "viewer",
    expectedChunkIds: ["doc-login#0"],
  },
  {
    id: "rag-refund-001",
    query: "退款超过三天没有完成怎么办？",
    role: "support",
    expectedChunkIds: ["doc-refund#0"],
  },
  {
    id: "rag-security-001",
    query: "客服回答里可以展示 SecretKey 吗？",
    role: "viewer",
    expectedChunkIds: ["doc-security#0"],
  },
];

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const words = normalized.match(/[a-z0-9]+|[\u4e00-\u9fa5]/gu) ?? [];
  const bigrams: string[] = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const pair = normalized.slice(index, index + 2);
    if (/^[\u4e00-\u9fa5]{2}$/u.test(pair)) {
      bigrams.push(pair);
    }
  }
  return [...words, ...bigrams];
}

function hashToken(token: string): number {
  let hash = 0;
  for (const char of token) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2_147_483_647;
  }
  return hash;
}

function embed(tokens: string[]): number[] {
  const vector = Array.from({ length: vectorSize }, () => 0);
  for (const token of tokens) {
    const index = hashToken(token) % vectorSize;
    vector[index] = (vector[index] ?? 0) + 1;
  }
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
}

function cosine(left: number[], right: number[]): number {
  return left.reduce(
    (sum, value, index) => sum + value * (right[index] ?? 0),
    0,
  );
}

function keywordScore(queryTokens: string[], chunkTokens: string[]): number {
  if (!queryTokens.length) return 0;
  const chunkSet = new Set(chunkTokens);
  const matched = queryTokens.filter((token) => chunkSet.has(token)).length;
  return matched / queryTokens.length;
}

export function parseDocuments(
  documents: KnowledgeDocument[],
): KnowledgeChunk[] {
  return documents.flatMap((document) => {
    const sentences = document.content.match(/[^。！？.!?]+[。！？.!?]?/gu) ?? [
      document.content,
    ];
    const chunks: string[] = [];
    let current = "";
    for (const sentence of sentences) {
      const candidate = `${current}${sentence}`.trim();
      if (candidate.length > 180 && current) {
        chunks.push(current);
        current = sentence.trim();
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);

    return chunks.map((content, index) => {
      const tokens = tokenize(`${document.title} ${content}`);
      return {
        chunkId: `${document.id}#${index}`,
        content,
        documentId: document.id,
        embedding: embed(tokens),
        requiredRole: document.requiredRole,
        source: document.source,
        title: document.title,
        tokens,
      };
    });
  });
}

function canRead(role: KnowledgeRole, requiredRole: KnowledgeRole): boolean {
  return role === "support" || requiredRole === "viewer";
}

export function retrieveChunks(
  chunks: KnowledgeChunk[],
  query: string,
  role: KnowledgeRole,
  strategy: RetrievalStrategy,
  topK: number,
): { hits: RetrievalHit[]; rejectedDocuments: string[] } {
  const queryTokens = tokenize(query);
  const queryVector = embed(queryTokens);
  const minimumScore =
    strategy === "keyword"
      ? Number.EPSILON
      : strategy === "vector"
        ? 0.25
        : 0.2;
  const rejectedDocuments = chunks
    .filter((chunk) => !canRead(role, chunk.requiredRole))
    .map((chunk) => chunk.documentId);
  const hits = chunks
    .filter((chunk) => canRead(role, chunk.requiredRole))
    .map((chunk): RetrievalHit => {
      const vectorScore = cosine(queryVector, chunk.embedding);
      const keyword = keywordScore(queryTokens, chunk.tokens);
      const score =
        strategy === "keyword"
          ? keyword
          : strategy === "vector"
            ? vectorScore
            : keyword * 0.55 + vectorScore * 0.45;
      return { chunk, keywordScore: keyword, score, vectorScore };
    })
    .filter((hit) => queryTokens.length > 0 && hit.score >= minimumScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);

  return { hits, rejectedDocuments: [...new Set(rejectedDocuments)] };
}

export function answerWithCitations(
  documents: KnowledgeDocument[],
  query: string,
  role: KnowledgeRole,
  strategy: RetrievalStrategy = "hybrid",
): RagAnswer {
  const chunks = parseDocuments(documents);
  const { hits, rejectedDocuments } = retrieveChunks(
    chunks,
    query,
    role,
    strategy,
    3,
  );
  const citations = hits.map((hit) => ({
    chunkId: hit.chunk.chunkId,
    excerpt: hit.chunk.content,
    source: hit.chunk.source,
    title: hit.chunk.title,
  }));
  const evidence = citations.map((item) => item.excerpt).join(" ");
  const answer = citations.length
    ? `根据知识库：${evidence}。如果仍无法解决，请转人工复核。`
    : "当前权限范围内没有找到可引用资料，请补充知识库或升级权限。";

  return { answer, citations, rejectedDocuments, strategy };
}

export function answerAcrossKnowledgeBases(
  knowledgeBases: KnowledgeBase[],
  access: {
    allowedKnowledgeBaseIds: string[];
    role: KnowledgeRole;
    tenantId: string;
  },
  query: string,
  strategy: RetrievalStrategy = "hybrid",
): RagAnswer & { rejectedKnowledgeBases: string[] } {
  const allowed = knowledgeBases.filter(
    (knowledgeBase) =>
      knowledgeBase.tenantId === access.tenantId &&
      access.allowedKnowledgeBaseIds.includes(knowledgeBase.id),
  );
  const rejectedKnowledgeBases = knowledgeBases
    .filter((knowledgeBase) => !allowed.includes(knowledgeBase))
    .map((knowledgeBase) => knowledgeBase.id);
  return {
    ...answerWithCitations(
      allowed.flatMap((knowledgeBase) => knowledgeBase.documents),
      query,
      access.role,
      strategy,
    ),
    rejectedKnowledgeBases,
  };
}

export function evaluateRetrieval(
  documents: KnowledgeDocument[],
  cases: RagEvalCase[],
  strategy: RetrievalStrategy = "hybrid",
): RagEvalSummary {
  const chunks = parseDocuments(documents);
  const results = cases.map((item): RagEvalResult => {
    const { hits } = retrieveChunks(chunks, item.query, item.role, strategy, 5);
    const hitIds = hits.map((hit) => hit.chunk.chunkId);
    const matched = item.expectedChunkIds.filter((id) => hitIds.includes(id));
    const firstRelevantRank = hitIds.findIndex((id) =>
      item.expectedChunkIds.includes(id),
    );
    const citations = hits.map((hit) => hit.chunk.content);
    const faithfulness =
      citations.length > 0 &&
      citations.every((citation) =>
        documents.some((document) => document.content.includes(citation)),
      )
        ? 1
        : 0;
    return {
      caseId: item.id,
      faithfulness,
      firstRelevantRank: firstRelevantRank >= 0 ? firstRelevantRank + 1 : null,
      mrr: firstRelevantRank >= 0 ? 1 / (firstRelevantRank + 1) : 0,
      recall: matched.length / item.expectedChunkIds.length,
    };
  });
  const denominator = results.length || 1;
  return {
    averageFaithfulness:
      results.reduce((sum, item) => sum + item.faithfulness, 0) / denominator,
    averageMrr: results.reduce((sum, item) => sum + item.mrr, 0) / denominator,
    averageRecall:
      results.reduce((sum, item) => sum + item.recall, 0) / denominator,
    results,
  };
}

export async function runAsyncIndexJob(
  documents: KnowledgeDocument[],
  maxRetries = 1,
): Promise<{ chunks: KnowledgeChunk[]; operation: IndexOperation }> {
  const operation: IndexOperation = {
    detail: "索引任务已排队",
    id: randomUUID(),
    retries: 0,
    status: "queued",
  };
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      operation.status = "running";
      operation.retries = attempt;
      await new Promise((resolve) => setTimeout(resolve, 1));
      const chunks = parseDocuments(documents);
      operation.status = "succeeded";
      operation.detail = `已生成 ${chunks.length} 个 chunk`;
      return { chunks, operation };
    } catch (error) {
      operation.status = "failed";
      operation.detail = error instanceof Error ? error.message : String(error);
      if (attempt === maxRetries) throw error;
    }
  }
  return { chunks: [], operation };
}
