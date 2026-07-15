import { getPrompt } from "./prompts.js";
import type { CompletionResult, ModelClient } from "./types.js";

export interface ProjectReviewResult {
  tasks: CompletionResult;
  risks: CompletionResult;
}

export async function runProjectReviewChain(
  client: ModelClient,
  model: string,
  temperature: number,
  input: string,
): Promise<ProjectReviewResult> {
  const taskPrompt = getPrompt("task-extraction.v3");
  const tasks = await client.complete({
    model,
    system: taskPrompt.system,
    prompt: taskPrompt.createUserMessage(input),
    temperature,
  });

  const riskPrompt = getPrompt("risk-detection.v3");
  const riskInput = `原始项目记录：
${input}

上一步提取出的任务：
${tasks.text}`;
  const risks = await client.complete({
    model,
    system: riskPrompt.system,
    prompt: riskPrompt.createUserMessage(riskInput),
    temperature,
  });

  return { tasks, risks };
}
