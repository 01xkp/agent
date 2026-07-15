import { completeWithRetry } from "./retry.js";
import type { CompletionOptions, ModelClient } from "./types.js";

export interface StructuredTask {
  content: string;
  owner: string;
  deadline: string;
}

export interface StructuredRisk {
  risk: string;
  evidence: string;
  impact: string;
  needsHumanReview: boolean;
}

export interface ProjectReviewJson {
  summary: string;
  tasks: StructuredTask[];
  risks: StructuredRisk[];
  nextStep: string;
}

export interface StructuredOutputResult {
  ok: boolean;
  value: ProjectReviewJson;
  attempts: number;
  rawText: string;
  validationErrors: string[];
  degraded: boolean;
}

export interface StructuredOutputOptions {
  maxValidationAttempts?: number;
  signal?: AbortSignal;
}

const structuredSystem = `你是一个只输出 JSON 的信息抽取助手。
必须严格根据输入内容工作，不能编造输入中不存在的信息。
信息不足时字符串字段写“未说明”，布尔字段按是否需要人工确认填写。`;

export function createProjectReviewPrompt(input: string): string {
  return `请把下面的项目记录整理成 ProjectReviewJSON。

只输出一个 JSON 对象，不要输出 Markdown，不要输出解释。

JSON 结构必须完全符合：
{
  "summary": "一句话总结项目记录",
  "tasks": [
    {
      "content": "已经确定要做的任务",
      "owner": "负责人；没有就写未说明",
      "deadline": "截止时间；没有就写未说明"
    }
  ],
  "risks": [
    {
      "risk": "风险名称",
      "evidence": "原文依据",
      "impact": "可能影响",
      "needsHumanReview": true
    }
  ],
  "nextStep": "最建议下一步做什么"
}

要求：
- tasks 只放已经明确决定要做的事情。
- risks 只放从原文能看出的风险。
- 没有任务或风险时使用空数组。
- needsHumanReview 必须是 boolean，不能写成字符串。

<project_record>
${input.trim()}
</project_record>`;
}

export function extractJsonObject(text: string): unknown {
  const withoutFence = text
    .replace(/^```(?:json)?/iu, "")
    .replace(/```$/u, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("模型输出中没有 JSON 对象");
  }

  return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
}

export function validateProjectReviewJson(
  value: unknown,
): { ok: true; value: ProjectReviewJson } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["根节点必须是 JSON 对象"] };
  }

  const summary = readString(value, "summary", errors);
  const tasks = readTaskArray(value.tasks, errors);
  const risks = readRiskArray(value.risks, errors);
  const nextStep = readString(value, "nextStep", errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      summary,
      tasks,
      risks,
      nextStep,
    },
  };
}

export async function generateProjectReviewJson(
  client: ModelClient,
  model: string,
  temperature: number,
  input: string,
  options: StructuredOutputOptions = {},
): Promise<StructuredOutputResult> {
  const maxValidationAttempts = options.maxValidationAttempts ?? 3;
  if (
    !Number.isInteger(maxValidationAttempts) ||
    maxValidationAttempts <= 0 ||
    maxValidationAttempts > 5
  ) {
    throw new Error("maxValidationAttempts 必须是 1～5 之间的整数");
  }

  let prompt = createProjectReviewPrompt(input);
  let rawText = "";
  let validationErrors: string[] = [];

  for (let attempt = 1; attempt <= maxValidationAttempts; attempt += 1) {
    const completion = await completeWithRetry(client, {
      model,
      prompt,
      system: structuredSystem,
      temperature,
      signal: options.signal,
    } satisfies CompletionOptions);
    rawText = completion.text;

    try {
      const parsed = extractJsonObject(rawText);
      const validation = validateProjectReviewJson(parsed);
      if (validation.ok) {
        return {
          ok: true,
          value: validation.value,
          attempts: attempt,
          rawText,
          validationErrors: [],
          degraded: false,
        };
      }
      validationErrors = validation.errors;
    } catch (error) {
      validationErrors = [
        error instanceof Error ? error.message : String(error),
      ];
    }

    prompt = createRepairPrompt(input, rawText, validationErrors);
  }

  return {
    ok: false,
    value: createDegradedProjectReview(input, validationErrors),
    attempts: maxValidationAttempts,
    rawText,
    validationErrors,
    degraded: true,
  };
}

function createRepairPrompt(
  input: string,
  invalidOutput: string,
  errors: string[],
): string {
  return `上一次 ProjectReviewJSON 输出没有通过校验。

校验错误：
${errors.map((error) => `- ${error}`).join("\n")}

请重新输出严格 JSON，不要解释，不要 Markdown。

原始项目记录：
<project_record>
${input.trim()}
</project_record>

上一次无效输出：
<invalid_output>
${invalidOutput.trim()}
</invalid_output>`;
}

function createDegradedProjectReview(
  input: string,
  errors: string[],
): ProjectReviewJson {
  return {
    summary: "结构化输出未通过校验，需要人工复核。",
    tasks: [],
    risks: [
      {
        risk: "模型输出无法被程序安全解析",
        evidence: errors.join("；") || "未说明",
        impact: "不能直接进入自动化流程或业务系统",
        needsHumanReview: true,
      },
    ],
    nextStep: `人工检查原始输入：${input.trim().slice(0, 80) || "未说明"}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
  errors: string[],
  label = key,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    errors.push(`${label} 必须是字符串`);
    return "";
  }
  return value;
}

function readTaskArray(value: unknown, errors: string[]): StructuredTask[] {
  if (!Array.isArray(value)) {
    errors.push("tasks 必须是数组");
    return [];
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      errors.push(`tasks[${index}] 必须是对象`);
      return { content: "", owner: "", deadline: "" };
    }

    return {
      content: readString(item, "content", errors, `tasks[${index}].content`),
      owner: readString(item, "owner", errors, `tasks[${index}].owner`),
      deadline: readString(
        item,
        "deadline",
        errors,
        `tasks[${index}].deadline`,
      ),
    };
  });
}

function readRiskArray(value: unknown, errors: string[]): StructuredRisk[] {
  if (!Array.isArray(value)) {
    errors.push("risks 必须是数组");
    return [];
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      errors.push(`risks[${index}] 必须是对象`);
      return {
        risk: "",
        evidence: "",
        impact: "",
        needsHumanReview: true,
      };
    }

    const needsHumanReview = item.needsHumanReview;
    if (typeof needsHumanReview !== "boolean") {
      errors.push(`risks[${index}].needsHumanReview 必须是 boolean`);
    }

    return {
      risk: readString(item, "risk", errors, `risks[${index}].risk`),
      evidence: readString(
        item,
        "evidence",
        errors,
        `risks[${index}].evidence`,
      ),
      impact: readString(item, "impact", errors, `risks[${index}].impact`),
      needsHumanReview:
        typeof needsHumanReview === "boolean" ? needsHumanReview : true,
    };
  });
}
