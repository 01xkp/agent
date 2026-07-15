import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Vue Web 与 Electron 双端工作台", () => {
  it("使用 Vue 3、Element Plus 和 Vite 组织渲染层", () => {
    const app = readFileSync("src/web/App.vue", "utf8");
    const agent = readFileSync("src/web/AgentView.vue", "utf8");
    const entry = readFileSync("src/web/main.ts", "utf8");
    const packageJson = readFileSync("package.json", "utf8");

    assert.match(entry, /createApp\(App\)/u);
    assert.match(entry, /\.component\("ElButton", ElButton\)/u);
    assert.match(packageJson, /"vue": "3\.5\.39"/u);
    assert.match(packageJson, /"element-plus": "2\.14\.2"/u);
    assert.match(
      packageJson,
      /"dev:server": "tsx watch --env-file=\.env src\/server-entry\.ts"/u,
    );
    assert.match(app, /AgentView/u);
    assert.match(app, /ToolboxView/u);
    assert.match(agent, /CS 凡 · AI 实验助手/u);
    assert.match(agent, /实验观察台/u);
    assert.match(agent, /<el-tabs/u);
    assert.match(agent, /<el-input/u);
    assert.match(agent, /<el-button/u);
  });

  it("保留流式聊天、停止生成、指标和 Markdown 富文本", () => {
    const agent = readFileSync("src/web/AgentView.vue", "utf8");
    const api = readFileSync("src/web/api.ts", "utf8");
    const markdown = readFileSync("src/web/markdown.ts", "utf8");

    assert.match(agent, /模型正在分析问题/u);
    assert.match(agent, /new AbortController/u);
    assert.match(agent, /chatController\.value\?\.abort/u);
    assert.match(agent, /firstTokenMs/u);
    assert.match(api, /\/api\/chat/u);
    assert.match(api, /response\.body\.getReader/u);
    assert.match(agent, /event\.type === "token"/u);
    assert.match(agent, /requestAnimationFrame\(flushTokenBuffer\)/u);
    assert.match(agent, /buildChatHistory/u);
    assert.match(agent, /setTimeout\(\(\) =>/u);
    assert.match(markdown, /export function renderMarkdown/u);
  });

  it("保留结构化输出、云端历史、主题切换和响应式布局", () => {
    const agent = readFileSync("src/web/AgentView.vue", "utf8");
    const api = readFileSync("src/web/api.ts", "utf8");
    const styles = readFileSync("src/web/styles.css", "utf8");

    assert.match(agent, /生成并校验 JSON/u);
    assert.match(agent, /workbench-theme/u);
    assert.match(agent, /startNewExperiment/u);
    assert.match(api, /\/api\/structured/u);
    assert.match(api, /\/api\/history/u);
    assert.match(styles, /@media \(max-width: 620px\)/u);
  });

  it("每个实验保留独立的完整多轮对话", () => {
    const agent = readFileSync("src/web/AgentView.vue", "utf8");
    const styles = readFileSync("src/web/styles.css", "utf8");

    assert.match(agent, /interface ChatExperiment/u);
    assert.match(agent, /interface ConversationTurn/u);
    assert.match(agent, /experiment\.turns\.push\(turn\)/u);
    assert.match(agent, /experiments\.value\.push\(experiment\)/u);
    assert.match(agent, /v-for="\(turn, index\) in conversationTurns"/u);
    assert.match(agent, /localStorage\.setItem\(experimentStorageKey/u);
    assert.match(styles, /\.conversation-turn/u);
    assert.match(styles, /\.history-item\.active/u);
  });

  it("Electron 使用隔离的主进程、预加载桥和同一后端", () => {
    const main = readFileSync("electron/main/index.ts", "utf8");
    const preload = readFileSync("electron/preload/index.ts", "utf8");
    const server = readFileSync("src/server.ts", "utf8");

    assert.match(main, /contextIsolation: true/u);
    assert.match(main, /nodeIntegration: false/u);
    assert.match(main, /sandbox: true/u);
    assert.match(main, /startServer/u);
    assert.match(preload, /contextBridge\.exposeInMainWorld/u);
    assert.match(server, /export async function startServer/u);
    assert.match(server, /dist\/web/u);
  });
});
