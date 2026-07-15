export const PROMPT_TASKS = [
  "summary",
  "task-extraction",
  "risk-detection",
] as const;

export const PROMPT_VERSIONS = ["v1", "v2", "v3"] as const;

export type PromptTask = (typeof PROMPT_TASKS)[number];
export type PromptVersion = (typeof PROMPT_VERSIONS)[number];
export type PromptName = `${PromptTask}.${PromptVersion}`;

export interface PromptTemplate {
  name: PromptName;
  task: PromptTask;
  version: PromptVersion;
  system: string;
  createUserMessage(input: string): string;
}

const groundedSystem = `你是一个严格根据输入内容工作的助手。
不能编造输入中不存在的信息。
信息不足时必须明确写“未说明”，不要猜测。`;

function wrapInput(tag: string, input: string): string {
  return `<${tag}>\n${input.trim()}\n</${tag}>`;
}

export const PROMPTS = {
  "summary.v1": {
    name: "summary.v1",
    task: "summary",
    version: "v1",
    system: "",
    createUserMessage: (input) =>
      `请把下面的文章总结成 3 个要点。\n\n${input.trim()}`,
  },
  "summary.v2": {
    name: "summary.v2",
    task: "summary",
    version: "v2",
    system: groundedSystem,
    createUserMessage: (input) => `请总结下面的文章。

输出格式：
核心主题：

关键点：
1.
2.
3.

结论：

要求：
- 关键点写 3～5 个。
- 保留重要数字。
- 不添加文章中没有的事实。
- 忽略与核心主题无关的背景。

${wrapInput("article", input)}`,
  },
  "summary.v3": {
    name: "summary.v3",
    task: "summary",
    version: "v3",
    system: groundedSystem,
    createUserMessage: (input) => `请总结下面的文章。

输出格式：
核心主题：

关键点：
1.
2.
3.

结论：

要求：
- 关键点写 3～5 个。
- 保留重要数字。
- 不添加文章中没有的事实。
- 忽略与核心主题无关的背景。

示例输入：
<article>
社区图书馆本月新增 500 本图书，并把周末开放时间延长到 20:00。
</article>

示例输出：
核心主题：社区图书馆扩充资源并延长服务时间。

关键点：
1. 本月新增 500 本图书。
2. 周末开放时间延长到 20:00。
3. 两项调整都用于改善读者服务。

结论：图书馆通过增加藏书和延长开放时间提升服务。

现在处理：
${wrapInput("article", input)}`,
  },
  "task-extraction.v1": {
    name: "task-extraction.v1",
    task: "task-extraction",
    version: "v1",
    system: "",
    createUserMessage: (input) =>
      `请从下面的会议记录中提取待办任务。\n\n${input.trim()}`,
  },
  "task-extraction.v2": {
    name: "task-extraction.v2",
    task: "task-extraction",
    version: "v2",
    system: groundedSystem,
    createUserMessage: (input) => `请从下面的会议记录中提取已经确定的任务。

每个任务按以下格式输出：
- 任务内容：
- 负责人：
- 截止时间：

要求：
- 只提取已经明确决定要做的事情。
- 不把建议、问题或普通讨论当成任务。
- 没有负责人或截止时间时写“未说明”。
- 不自行安排负责人或截止时间。
- 如果没有确定任务，写“没有确定任务”。

${wrapInput("meeting", input)}`,
  },
  "task-extraction.v3": {
    name: "task-extraction.v3",
    task: "task-extraction",
    version: "v3",
    system: groundedSystem,
    createUserMessage: (input) => `请从下面的会议记录中提取已经确定的任务。

每个任务按以下格式输出：
- 任务内容：
- 负责人：
- 截止时间：

要求：
- 只提取已经明确决定要做的事情。
- 不把建议、问题或普通讨论当成任务。
- 没有负责人或截止时间时写“未说明”。
- 不自行安排负责人或截止时间。
- 如果没有确定任务，写“没有确定任务”。

示例输入：
<meeting>
大家讨论了是否更换首页图片。李明确认周五前整理三张候选图片，负责人之外没有确定最终上线时间。
</meeting>

示例输出：
- 任务内容：整理三张首页候选图片
- 负责人：李明
- 截止时间：周五前

现在处理：
${wrapInput("meeting", input)}`,
  },
  "risk-detection.v1": {
    name: "risk-detection.v1",
    task: "risk-detection",
    version: "v1",
    system: "",
    createUserMessage: (input) =>
      `请找出下面项目说明中的风险。\n\n${input.trim()}`,
  },
  "risk-detection.v2": {
    name: "risk-detection.v2",
    task: "risk-detection",
    version: "v2",
    system: groundedSystem,
    createUserMessage: (input) => `请识别下面项目说明中的风险。

每个风险按以下格式输出：
- 风险：
- 原文依据：
- 可能影响：
- 是否需要人工确认：是/否

要求：
- 只根据原文判断。
- 区分已经发生的问题和可能发生的风险。
- 不把不确定信息写成确定事实。
- 证据不足时写“信息不足，无法确定”。
- 如果没有可识别风险，写“未发现明确风险”。

${wrapInput("project", input)}`,
  },
  "risk-detection.v3": {
    name: "risk-detection.v3",
    task: "risk-detection",
    version: "v3",
    system: groundedSystem,
    createUserMessage: (input) => `请识别下面项目说明中的风险。

每个风险按以下格式输出：
- 风险：
- 原文依据：
- 可能影响：
- 是否需要人工确认：是/否

要求：
- 只根据原文判断。
- 区分已经发生的问题和可能发生的风险。
- 不把不确定信息写成确定事实。
- 证据不足时写“信息不足，无法确定”。
- 如果没有可识别风险，写“未发现明确风险”。

示例输入：
<project>
发布日期已经确定，但第三方支付接口仍在等待供应商确认测试时间。
</project>

示例输出：
- 风险：支付接口测试可能无法在发布日期前完成
- 原文依据：第三方支付接口仍在等待供应商确认测试时间
- 可能影响：可能推迟支付功能验收或影响发布日期
- 是否需要人工确认：是

现在处理：
${wrapInput("project", input)}`,
  },
} satisfies Record<PromptName, PromptTemplate>;

export function getPrompt(name: PromptName): PromptTemplate {
  return PROMPTS[name];
}
