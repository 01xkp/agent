import { loadConfig } from "./config.js";
import { createModelClient } from "./model-client.js";
import { runProjectReviewChain } from "./prompt-chain.js";

async function main(): Promise<void> {
  const input = process.argv.slice(2).join(" ").trim();
  if (!input) {
    throw new Error(
      "请提供项目或会议记录，例如：npm run chain -- 周五上线，李明明天完成测试",
    );
  }

  const config = loadConfig();
  const model = config.models[0];
  if (!model) {
    throw new Error("至少需要配置一个模型");
  }

  const result = await runProjectReviewChain(
    createModelClient(config),
    model,
    config.temperature,
    input,
  );

  console.log(`模型：${model}`);
  console.log(`\n第一步：提取任务\n${result.tasks.text}`);
  console.log(`\n第二步：识别风险\n${result.risks.text}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Prompt Chain 运行失败：${message}`);
  process.exitCode = 1;
});
