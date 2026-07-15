import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { createModelClient } from "./model-client.js";
import { completeWithRetry } from "./retry.js";
import type { BaselineCase, CompletionResult } from "./types.js";

interface EvaluationResult {
  caseId: string;
  category: string;
  model: string;
  prompt: string;
  expectedSignals: string[];
  answer: string;
  metrics: CompletionResult["metrics"];
}

interface EvaluationJob {
  model: string;
  testCase: BaselineCase;
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

async function loadCases(filePath: string): Promise<BaselineCase[]> {
  const content = await readFile(filePath, "utf8");
  return content
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as BaselineCase);
}

async function loadExistingResults(
  filePath: string,
): Promise<EvaluationResult[]> {
  try {
    await access(filePath);
  } catch {
    return [];
  }

  const content = await readFile(filePath, "utf8");
  return content
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EvaluationResult);
}

async function saveResults(
  filePath: string,
  results: EvaluationResult[],
): Promise<void> {
  await writeFile(
    filePath,
    `${results.map((result) => JSON.stringify(result)).join("\n")}\n`,
    "utf8",
  );
}

function resultKey(model: string, caseId: string): string {
  return `${model}||${caseId}`;
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

function createReport(results: EvaluationResult[], mockMode: boolean): string {
  const models = [...new Set(results.map((result) => result.model))];
  const rows = models.map((model) => {
    const modelResults = results.filter((result) => result.model === model);
    const knownCosts = modelResults
      .map((result) => result.metrics.estimatedCost)
      .filter((cost): cost is number => cost !== null);
    const cost =
      knownCosts.length === 0
        ? "未配置"
        : `$${knownCosts.reduce((a, b) => a + b, 0).toFixed(6)}`;

    return `| ${model} | ${modelResults.length} | ${Math.round(
      average(modelResults.map((result) => result.metrics.firstTokenMs)),
    )} | ${Math.round(
      average(modelResults.map((result) => result.metrics.totalLatencyMs)),
    )} | ${modelResults.reduce(
      (total, result) => total + result.metrics.usage.inputTokens,
      0,
    )} | ${modelResults.reduce(
      (total, result) => total + result.metrics.usage.outputTokens,
      0,
    )} | ${cost} |`;
  });

  return `# 模型对照记录

> 生成时间：${new Date().toISOString()}
> 运行模式：${mockMode ? "Mock（仅验证流程，不能作为模型结论）" : "真实模型"}

## 量化结果

| 模型 | 用例数 | 平均首 Token/ms | 平均总延迟/ms | 输入 Token | 输出 Token | 总估算成本 |
|---|---:|---:|---:|---:|---:|---:|
${rows.join("\n")}

## 人工质量复核

从 \`evals/results/latest.jsonl\` 中抽查每个模型相同的 5 条结果，按 1～5 分记录：

| 模型 | 正确性 | 指令遵循 | 简洁性 | 不确定性表达 | 备注 |
|---|---:|---:|---:|---:|---|
${models.map((model) => `| ${model} | 待评 | 待评 | 待评 | 待评 |  |`).join("\n")}

## 今日结论

1. 质量最高：
2. 速度最快：
3. 成本最低：
4. 下一次实验唯一要改变的变量：
`;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = createModelClient(config);
  const root = resolve(import.meta.dirname, "..");
  const cases = await loadCases(resolve(root, "evals/baseline.jsonl"));
  const args = process.argv.slice(2);
  const limit = readLimit(args);
  const resume = args.includes("--resume");
  const selectedCases = limit ? cases.slice(0, limit) : cases;
  const concurrency = readConcurrency(process.env);
  const resultPath = resolve(root, "evals/results/latest.jsonl");
  await mkdir(dirname(resultPath), { recursive: true });

  const jobs: EvaluationJob[] = config.models.flatMap((model) =>
    selectedCases.map((testCase) => ({ model, testCase })),
  );
  const expectedKeys = new Set(
    jobs.map((job) => resultKey(job.model, job.testCase.id)),
  );
  const existingResults = resume
    ? (await loadExistingResults(resultPath)).filter((result) =>
        expectedKeys.has(resultKey(result.model, result.caseId)),
      )
    : [];
  const existingByKey = new Map(
    existingResults.map((result) => [
      resultKey(result.model, result.caseId),
      result,
    ]),
  );
  const resultByKey = new Map(existingByKey);

  for (let index = 0; index < jobs.length; index += concurrency) {
    const batch = jobs.slice(index, index + concurrency);
    const pendingJobs = batch.filter((job) => {
      const key = resultKey(job.model, job.testCase.id);
      if (resultByKey.has(key)) {
        console.log(`[${job.model}] ${job.testCase.id}（复用已有结果）`);
        return false;
      }
      return true;
    });

    const settled = await Promise.allSettled(
      pendingJobs.map(async ({ model, testCase }) => {
        console.log(`[${model}] ${testCase.id}`);
        const completion = await completeWithRetry(
          client,
          {
            model,
            prompt: testCase.prompt,
            temperature: config.temperature,
          },
          {
            onRetry: (attempt, maxAttempts, error) =>
              console.warn(
                `临时错误，准备第 ${attempt}/${maxAttempts} 次调用：${error.message}`,
              ),
          },
        );
        const result: EvaluationResult = {
          caseId: testCase.id,
          category: testCase.category,
          model,
          prompt: testCase.prompt,
          expectedSignals: testCase.expectedSignals,
          answer: completion.text,
          metrics: completion.metrics,
        };
        return { key: resultKey(model, testCase.id), result };
      }),
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        resultByKey.set(outcome.value.key, outcome.value.result);
      }
    }

    const checkpoint = jobs.flatMap((job) => {
      const result = resultByKey.get(resultKey(job.model, job.testCase.id));
      return result ? [result] : [];
    });
    await saveResults(resultPath, checkpoint);

    const failed = settled.find((outcome) => outcome.status === "rejected");
    if (failed?.status === "rejected") {
      throw failed.reason;
    }
  }

  const results = jobs.map((job) => {
    const result = resultByKey.get(resultKey(job.model, job.testCase.id));
    if (!result) {
      throw new Error(`缺少评测结果：${job.model} ${job.testCase.id}`);
    }
    return result;
  });
  await saveResults(resultPath, results);
  await writeFile(
    resolve(root, "docs/model-comparison.md"),
    createReport(results, config.mockMode),
    "utf8",
  );

  console.log(`完成 ${results.length} 次调用`);
  console.log("结果：evals/results/latest.jsonl");
  console.log("报告：docs/model-comparison.md");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`评测失败：${message}`);
  process.exitCode = 1;
});
