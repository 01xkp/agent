import {
  explainWorkflowPatterns,
  handleMcpMessage,
  runResearchAgent,
} from "./agent-engine.js";
import {
  createWeekDeliveries,
  type LearningRoadmapDemo,
  makeReliabilityDecision,
  runEnterpriseSupportAgent,
} from "./production-agent.js";
import {
  answerWithCitations,
  evaluateRetrieval,
  sampleKnowledgeDocuments,
  sampleRagEvalCases,
} from "./rag-engine.js";
import { createToolSchema } from "./tool-calling.js";

export async function createLearningRoadmapDemo(): Promise<LearningRoadmapDemo> {
  const question = "退款超过三天没有完成怎么办？";
  const agentRun = await runResearchAgent(question);
  const supportAgent = await runEnterpriseSupportAgent(question);
  return {
    agentRun,
    mcp: handleMcpMessage({
      method: "tools/call",
      params: { name: "knowledge.search", arguments: { query: question } },
    }),
    ragAnswer: answerWithCitations(
      sampleKnowledgeDocuments,
      question,
      "support",
    ),
    ragEval: evaluateRetrieval(sampleKnowledgeDocuments, sampleRagEvalCases),
    reliability: makeReliabilityDecision(question),
    supportAgent,
    toolSchema: createToolSchema(),
    weeks: createWeekDeliveries(),
    workflowPatterns: explainWorkflowPatterns(),
  };
}
