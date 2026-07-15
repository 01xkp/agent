import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { createModelClient } from "./model-client.js";
import type { PromptName, PromptTask } from "./prompts.js";
import { getPrompt, PROMPT_TASKS, PROMPT_VERSIONS } from "./prompts.js";
import { completeWithRetry } from "./retry.js";
import type { CompletionResult } from "./types.js";

interface PromptEvaluationCase {
  id: string;
  task: PromptTask;
  input: string;
  expectedSignals: string[];
}

interface PromptEvaluationResult {
  caseId: string;
  task: PromptTask;
  promptName: PromptName;
  model: string;
  input: string;
  expectedSignals: string[];
  answer: string;
  metrics: CompletionResult["metrics"];
}

interface PromptEvaluationJob {
  model: string;
  testCase: PromptEvaluationCase;
  promptName: PromptName;
}

function readLimit(args: string[]): number | undefined {
  const index = args.indexOf("--limit");
  if (index === -1) {
    return undefined;
  }

  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("--limit 后必须是正整数");
  }
  return value;
}

function isPromptTask(value: unknown): value is PromptTask {
  return (
    typeof value === "string" && PROMPT_TASKS.includes(value as PromptTask)
  );
}

function parseCase(line: string, lineNumber: number): PromptEvaluationCase {
  const parsed: unknown = JSON.parse(line);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`第 ${lineNumber} 行必须是对象`);
  }

  const record = parsed as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    !isPromptTask(record.task) ||
    typeof record.input !== "string" ||
    !Array.isArray(record.expectedSignals) ||
    !record.expectedSignals.every((signal) => typeof signal === "string")
  ) {
    throw new Error(`第 ${lineNumber} 行数据格式无效`);
  }

  return {
    id: record.id,
    task: record.task,
    input: record.input,
    expectedSignals: record.expectedSignals,
  };
}

async function loadCases(filePath: string): Promise<PromptEvaluationCase[]> {
  const content = await readFile(filePath, "utf8");
  return content
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) => parseCase(line, index + 1));
}

async function loadExistingResults(
  filePath: string,
): Promise<PromptEvaluationResult[]> {
  try {
    await access(filePath);
  } catch {
    return [];
  }

  const content = await readFile(filePath, "utf8");
  return content
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PromptEvaluationResult);
}

async function saveResults(
  filePath: string,
  results: PromptEvaluationResult[],
): Promise<void> {
  await writeFile(
    filePath,
    `${results.map((result) => JSON.stringify(result)).join("\n")}\n`,
    "utf8",
  );
}

function resultKey(model: string, caseId: string, promptName: string): string {
  return `${model}||${caseId}||${promptName}`;
}

function readConcurrency(env: NodeJS.ProcessEnv): number {
  const concurrency = Number(env.EVAL_CONCURRENCY ?? "1");
  if (!Number.isInteger(concurrency) || concurrency <= 0 || concurrency > 5) {
    throw new Error("EVAL_CONCURRENCY 必须是 1～5 之间的整数");
  }
  return concurrency;
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function promptNamesForTask(task: PromptTask): PromptName[] {
  return PROMPT_VERSIONS.map((version) => `${task}.${version}` as PromptName);
}

function createReport(
  results: PromptEvaluationResult[],
  mockMode: boolean,
): string {
  const keys = [
    ...new Set(
      results.map(
        (result) => `${result.model}||${result.task}||${result.promptName}`,
      ),
    ),
  ];
  const rows = keys.map((key) => {
    const [model, task, promptName] = key.split("||");
    const group = results.filter(
      (result) =>
        result.model === model &&
        result.task === task &&
        result.promptName === promptName,
    );
    const knownCosts = group
      .map((result) => result.metrics.estimatedCost)
      .filter((cost): cost is number => cost !== null);
    const cost =
      knownCosts.length === 0
        ? "未配置"
        : `$${knownCosts.reduce((a, b) => a + b, 0).toFixed(6)}`;

    return `| ${model} | ${task} | ${promptName} | ${group.length} | ${Math.round(
      average(group.map((result) => result.metrics.firstTokenMs)),
    )} | ${Math.round(
      average(group.map((result) => result.metrics.totalLatencyMs)),
    )} | ${group.reduce(
      (total, result) => total + result.metrics.usage.inputTokens,
      0,
    )} | ${group.reduce(
      (total, result) => total + result.metrics.usage.outputTokens,
      0,
    )} | ${cost} |`;
  });

  return `# Prompt 版本对照记录

> 生成时间：${new Date().toISOString()}
> 运行模式：${mockMode ? "Mock（仅验证流程，不能作为模型结论）" : "真实模型"}

## 量化结果

| 模型 | 任务 | Prompt 版本 | 用例数 | 平均首 Token/ms | 平均总延迟/ms | 输入 Token | 输出 Token | 总估算成本 |
|---|---|---|---:|---:|---:|---:|---:|---:|
${rows.join("\n")}

## 人工质量复核

从 \`evals/results/prompt-latest.jsonl\` 中按任务抽查同一输入在 v1、v2、v3 下的回答，按 1～5 分记录：

| 任务 | 推荐版本 | 格式稳定性 | 是否少编造 | 是否易复用 | 备注 |
|---|---|---:|---:|---:|---|
| summary | 待评 | 待评 | 待评 | 待评 |  |
| task-extraction | 待评 | 待评 | 待评 | 待评 |  |
| risk-detection | 待评 | 待评 | 待评 | 待评 |  |

## 今日结论

1. 最适合作为默认版本：
2. 最大改进来自：明确任务 / 输入边界 / 输出格式 / 示例。
3. 下一次实验唯一要改变的变量：
`;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = createModelClient(config);
  const root = resolve(import.meta.dirname, "..");
  const cases = await loadCases(resolve(root, "evals/prompt-cases.jsonl"));
  const args = process.argv.slice(2);
  const limit = readLimit(args);
  const resume = args.includes("--resume");
  const selectedCases = limit ? cases.slice(0, limit) : cases;
  const concurrency = readConcurrency(process.env);
  const resultPath = resolve(root, "evals/results/prompt-latest.jsonl");
  await mkdir(dirname(resultPath), { recursive: true });

  const jobs: PromptEvaluationJob[] = config.models.flatMap((model) =>
    selectedCases.flatMap((testCase) =>
      promptNamesForTask(testCase.task).map((promptName) => ({
        model,
        testCase,
        promptName,
      })),
    ),
  );
  const expectedKeys = new Set(
    jobs.map((job) => resultKey(job.model, job.testCase.id, job.promptName)),
  );
  const existingResults = resume
    ? (await loadExistingResults(resultPath)).filter((result) =>
        expectedKeys.has(
          resultKey(result.model, result.caseId, result.promptName),
        ),
      )
    : [];
  const existingByKey = new Map(
    existingResults.map((result) => [
      resultKey(result.model, result.caseId, result.promptName),
      result,
    ]),
  );
  const resultByKey = new Map(existingByKey);

  for (let index = 0; index < jobs.length; index += concurrency) {
    const batch = jobs.slice(index, index + concurrency);
    const pendingJobs = batch.filter((job) => {
      const key = resultKey(job.model, job.testCase.id, job.promptName);
      if (resultByKey.has(key)) {
        console.log(
          `[${job.model}] ${job.testCase.id} ${job.promptName}（复用已有结果）`,
        );
        return false;
      }
      return true;
    });

    const settled = await Promise.allSettled(
      pendingJobs.map(async ({ model, testCase, promptName }) => {
        const prompt = getPrompt(promptName);
        console.log(`[${model}] ${testCase.id} ${promptName}`);
        const completion = await completeWithRetry(
          client,
          {
            model,
            prompt: prompt.createUserMessage(testCase.input),
            system: prompt.system,
            temperature: config.temperature,
          },
          {
            onRetry: (attempt, maxAttempts, error) =>
              console.warn(
                `临时错误，准备第 ${attempt}/${maxAttempts} 次调用：${error.message}`,
              ),
          },
        );
        const result: PromptEvaluationResult = {
          caseId: testCase.id,
          task: testCase.task,
          promptName,
          model,
          input: testCase.input,
          expectedSignals: testCase.expectedSignals,
          answer: completion.text,
          metrics: completion.metrics,
        };
        return {
          key: resultKey(model, testCase.id, promptName),
          result,
        };
      }),
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        resultByKey.set(outcome.value.key, outcome.value.result);
      }
    }

    const checkpoint = jobs.flatMap((job) => {
      const result = resultByKey.get(
        resultKey(job.model, job.testCase.id, job.promptName),
      );
      return result ? [result] : [];
    });
    await saveResults(resultPath, checkpoint);

    const failed = settled.find((outcome) => outcome.status === "rejected");
    if (failed?.status === "rejected") {
      throw failed.reason;
    }
  }

  const results = jobs.map((job) => {
    const result = resultByKey.get(
      resultKey(job.model, job.testCase.id, job.promptName),
    );
    if (!result) {
      throw new Error(
        `缺少 Prompt 评测结果：${job.model} ${job.testCase.id} ${job.promptName}`,
      );
    }
    return result;
  });
  await saveResults(resultPath, results);
  await writeFile(
    resolve(root, "docs/prompt-comparison.md"),
    createReport(results, config.mockMode),
    "utf8",
  );

  console.log(`完成 ${results.length} 次 Prompt 版本调用`);
  console.log("结果：evals/results/prompt-latest.jsonl");
  console.log("报告：docs/prompt-comparison.md");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Prompt 评测失败：${message}`);
  process.exitCode = 1;
});
