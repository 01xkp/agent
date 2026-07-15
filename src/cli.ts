import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { loadConfig } from "./config.js";
import { createModelClient } from "./model-client.js";

function formatCost(cost: number | null): string {
  return cost === null ? "未配置价格" : `$${cost.toFixed(6)}`;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = createModelClient(config);
  const terminal = createInterface({ input, output });
  let terminalClosed = false;
  let model = config.models[0];

  terminal.once("close", () => {
    terminalClosed = true;
  });

  if (!model) {
    throw new Error("至少需要配置一个模型");
  }

  console.log(`模式：${config.mockMode ? "Mock" : "真实模型"}`);
  console.log(`API 协议：${config.apiType}`);
  console.log(`当前模型：${model}`);
  console.log("命令：/models 查看模型，/model <名称> 切换，/exit 退出");

  try {
    while (!terminalClosed) {
      let answer: string;
      try {
        answer = await terminal.question("\n你：");
      } catch (error) {
        if (terminalClosed) {
          break;
        }
        throw error;
      }

      const prompt = answer.trim();
      if (!prompt) {
        continue;
      }
      if (prompt === "/exit") {
        break;
      }
      if (prompt === "/models") {
        console.log(config.models.join("\n"));
        continue;
      }
      if (prompt.startsWith("/model ")) {
        const requestedModel = prompt.slice("/model ".length).trim();
        if (!config.models.includes(requestedModel)) {
          console.log(`未知模型。可选：${config.models.join(", ")}`);
          continue;
        }
        model = requestedModel;
        console.log(`已切换到：${model}`);
        continue;
      }

      process.stdout.write(`${model}：`);
      const result = await client.complete({
        model,
        prompt,
        temperature: config.temperature,
        onToken: (token) => process.stdout.write(token),
      });

      console.log(
        `\n指标：首 Token ${result.metrics.firstTokenMs}ms｜总延迟 ${result.metrics.totalLatencyMs}ms｜输入 ${result.metrics.usage.inputTokens} tokens｜输出 ${result.metrics.usage.outputTokens} tokens｜估算成本 ${formatCost(result.metrics.estimatedCost)}`,
      );
    }
  } finally {
    terminal.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`运行失败：${message}`);
  process.exitCode = 1;
});
