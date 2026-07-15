import { loadConfig } from "./config.js";
import { createModelClient } from "./model-client.js";
import { generateProjectReviewJson } from "./structured-output.js";

async function main(): Promise<void> {
  const input = process.argv.slice(2).join(" ").trim();
  if (!input) {
    throw new Error(
      "请提供项目记录，例如：npm run structure -- 周五上线，李明周四完成测试，支付接口还没确认",
    );
  }

  const config = loadConfig();
  const model = config.models[0];
  if (!model) {
    throw new Error("至少需要配置一个模型");
  }

  const result = await generateProjectReviewJson(
    createModelClient(config),
    model,
    config.temperature,
    input,
  );

  console.log(`模型：${model}`);
  console.log(`结构化是否通过：${result.ok ? "是" : "否，已降级"}`);
  console.log(`校验尝试次数：${result.attempts}`);
  if (result.validationErrors.length > 0) {
    console.log(`校验错误：${result.validationErrors.join("；")}`);
  }
  console.log(JSON.stringify(result.value, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`结构化输出运行失败：${message}`);
  process.exitCode = 1;
});
