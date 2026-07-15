import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadConfig } from "./config.js";
import { createModelClient } from "./model-client.js";
import {
  generateProjectReviewJson,
  type StructuredOutputResult,
} from "./structured-output.js";

interface StructuredEvaluationCase {
  id: string;
  input: string;
  expectedTaskSignals: string[];
  expectedRiskSignals: string[];
}

interface StructuredEvaluationResult {
  caseId: string;
  model: string;
  input: string;
  expectedTaskSignals: string[];
  expectedRiskSignals: string[];
  output: StructuredOutputResult;
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

function parseCase(line: string, lineNumber: number): StructuredEvaluationCase {
  const parsed: unknown = JSON.parse(line);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`第 ${lineNumber} 行必须是对象`);
  }

  const record = parsed as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.input !== "string" ||
    !Array.isArray(record.expectedTaskSignals) ||
    !record.expectedTaskSignals.every((signal) => typeof signal === "string") ||
    !Array.isArray(record.expectedRiskSignals) ||
    !record.expectedRiskSignals.every((signal) => typeof signal === "string")
  ) {
    throw new Error(`第 ${lineNumber} 行数据格式无效`);
  }

  return {
    id: record.id,
    input: record.input,
    expectedTaskSignals: record.expectedTaskSignals,
    expectedRiskSignals: record.expectedRiskSignals,
  };
}

async function loadCases(
  filePath: string,
): Promise<StructuredEvaluationCase[]> {
  const content = await readFile(filePath, "utf8");
  return content
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line, index) => parseCase(line, index + 1));
}

function createReport(
  results: StructuredEvaluationResult[],
  mockMode: boolean,
): string {
  const rows = results.map((result) => {
    const output = result.output;
    return `| ${result.caseId} | ${result.model} | ${output.ok ? "通过" : "降级"} | ${output.attempts} | ${output.value.tasks.length} | ${output.value.risks.length} | ${output.validationErrors.join("；")} |`;
  });
  const okCount = results.filter((result) => result.output.ok).length;
  const degradedCount = results.filter(
    (result) => result.output.degraded,
  ).length;

  return `# Structured Output 评测报告

> 生成时间：${new Date().toISOString()}
> 运行模式：${mockMode ? "Mock（仅验证流程，不能作为模型质量结论）" : "真实模型"}

## 汇总

- 用例数：${results.length}
- 结构校验通过：${okCount}
- 降级人工复核：${degradedCount}

## 明细

| 用例 | 模型 | 结构状态 | 校验尝试次数 | 任务数 | 风险数 | 校验错误 |
|---|---|---|---:|---:|---:|---|
${rows.join("\n")}

## 人工质量复核

从 \`evals/results/structured-latest.jsonl\` 中逐条检查：

| 用例 | 任务是否提全 | 风险是否提全 | 是否少编造 | 备注 |
|---|---:|---:|---:|---|
${results.map((result) => `| ${result.caseId} | 待评 | 待评 | 待评 |  |`).join("\n")}
`;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = createModelClient(config);
  const root = resolve(import.meta.dirname, "..");
  const cases = await loadCases(resolve(root, "evals/structured-cases.jsonl"));
  const limit = readLimit(process.argv.slice(2));
  const selectedCases = limit ? cases.slice(0, limit) : cases;
  const results: StructuredEvaluationResult[] = [];

  for (const model of config.models) {
    for (const testCase of selectedCases) {
      console.log(`[${model}] ${testCase.id}`);
      const output = await generateProjectReviewJson(
        client,
        model,
        config.temperature,
        testCase.input,
      );
      results.push({
        caseId: testCase.id,
        model,
        input: testCase.input,
        expectedTaskSignals: testCase.expectedTaskSignals,
        expectedRiskSignals: testCase.expectedRiskSignals,
        output,
      });
    }
  }

  const resultPath = resolve(root, "evals/results/structured-latest.jsonl");
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(
    resultPath,
    `${results.map((result) => JSON.stringify(result)).join("\n")}\n`,
    "utf8",
  );
  await writeFile(
    resolve(root, "docs/structured-output-report.md"),
    createReport(results, config.mockMode),
    "utf8",
  );

  console.log(`完成 ${results.length} 次结构化输出评测`);
  console.log("结果：evals/results/structured-latest.jsonl");
  console.log("报告：docs/structured-output-report.md");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`结构化输出评测失败：${message}`);
  process.exitCode = 1;
});
