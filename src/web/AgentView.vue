<script setup lang="ts">
import { ElMessage } from "element-plus";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import {
  apiUrl,
  type ChatContextMessage,
  createStructuredOutput,
  fetchHealth,
  fetchHistory,
  fetchLearningDemo,
  type LearningDemoResponse,
  type RunMetrics,
  runSupportAgent,
  type StreamEvent,
  type SupportAgentResponse,
  streamChat,
  type WorkflowStep,
} from "./api";
import { renderMarkdown } from "./markdown";

type InspectorTab = "learning" | "metrics" | "structured";
type NavigationSection = "chat" | InspectorTab;
type PipelineState = "idle" | "active" | "done" | "error";
type RunState = "done" | "error" | "idle" | "running";
type TurnState = "done" | "error" | "running" | "stopped";

const emit = defineEmits<{
  openToolbox: [];
}>();

interface ConversationTurn {
  answer: string;
  createdAt: string;
  id: string;
  model: string;
  prompt: string;
  state: TurnState;
  status: string;
}

interface ChatExperiment {
  createdAt: string;
  id: string;
  name: string;
  turns: ConversationTurn[];
  updatedAt: string;
}

interface DisplayHistory {
  detail: string;
  experimentId?: string;
  icon: string;
  prompt: string;
}

const suggestions = [
  {
    icon: "P",
    tone: "violet",
    title: "Prompt 边界",
    description: "理解 System 与 User Prompt 的职责",
    prompt: "请用小白能懂的话解释：System Prompt 和 User Prompt 有什么区别？",
  },
  {
    icon: "{ }",
    tone: "cyan",
    title: "结构化输出",
    description: "为什么必须做 Schema 校验",
    prompt:
      "为什么 LLM 的 Structured Output 必须做 Schema 校验？请举一个失败例子。",
  },
  {
    icon: "↗",
    tone: "amber",
    title: "运行指标",
    description: "认识延迟、Token 与成本",
    prompt: "请解释首 Token 时间、总延迟和 Token 成本分别反映什么问题。",
  },
  {
    icon: "✓",
    tone: "green",
    title: "上线检查",
    description: "从 Mock 切换到真实模型",
    prompt: "请给我一个从 Mock 模式切换到真实模型前的检查清单。",
  },
] as const;

const placeholderHistory: DisplayHistory[] = [
  { icon: "01", prompt: "Prompt 边界解释", detail: "刚刚" },
  { icon: "02", prompt: "项目风险提取", detail: "结构化输出" },
  { icon: "03", prompt: "Token 成本实验", detail: "模型对照" },
];

const experimentStorageKey = "csfan-chat-experiments-v1";
const storedExperiments = loadStoredExperiments();
const initialExperiments = storedExperiments.length
  ? storedExperiments
  : [createExperiment(1)];

const activeInspector = ref<InspectorTab>("metrics");
const activeNavigation = ref<NavigationSection>("chat");
const activeExperimentId = ref(
  initialExperiments[initialExperiments.length - 1]?.id ?? "",
);
const chatController = ref<AbortController>();
const cloudHistory = ref<DisplayHistory[]>([]);
const conversationEndRef = ref<HTMLElement>();
const experiments = ref<ChatExperiment[]>(initialExperiments);
const experimentCount = ref(initialExperiments.length);
const firstToken = ref("—");
const inputTokens = ref("—");
const inspectorRef = ref<HTMLElement>();
const latency = ref("—");
const learningBusy = ref(false);
const learningDemo = ref<LearningDemoResponse>();
const learningError = ref("");
const message = ref("");
const model = ref("");
const modelPlaceholder = ref("自动选择");
const historyMessageLimit = ref(8);
const outputTokens = ref("—");
const persisted = ref(false);
let experimentSaveTimer: ReturnType<typeof setTimeout> | undefined;
let tokenAnimationFrame: number | undefined;
let tokenBuffer = "";
const pipelineStatus = ref("等待运行");
const projectRecord = ref(
  "本周五准备上线 CS 凡，李明负责周四前完成回归测试。第三方模型接口偶尔超时，价格表还没确认。",
);
const runLabel = ref("IDLE");
const runState = ref<RunState>("idle");
const saveState = ref("自动保存");
const sidebarMode = ref("读取运行模式...");
const sidebarStatus = ref("正在连接服务");
const statusTone = ref<"offline" | "online" | "pending">("pending");
const structuredBusy = ref(false);
const structuredResult = ref("等待生成...");
const supportApproved = ref(false);
const supportBusy = ref(false);
const supportQuestion = ref("退款超过三天没有完成怎么办？");
const supportResult = ref<SupportAgentResponse>();
const theme = ref<"dark" | "light">("light");
const thinking = ref(false);
const runningTurnId = ref<string>();

const pipeline = reactive<Record<WorkflowStep, PipelineState>>({
  guardrail: "idle",
  context: "idle",
  generate: "idle",
  validate: "idle",
  persist: "idle",
});

const healthLink = computed(() => apiUrl("/api/health"));
const isElectron = computed(() => window.desktop?.isElectron === true);
const running = computed(() => runState.value === "running");
const activeExperiment = computed(() =>
  experiments.value.find(
    (experiment) => experiment.id === activeExperimentId.value,
  ),
);
const conversationTurns = computed(() => activeExperiment.value?.turns ?? []);
const experimentName = computed(
  () => activeExperiment.value?.name ?? "对话实验室",
);
const historyItems = computed(() => {
  const localItems = [...experiments.value].reverse().map(
    (experiment, index): DisplayHistory => ({
      detail: experiment.turns.length
        ? `${experiment.turns.length} 轮 · ${formatHistoryTime(experiment.updatedAt)}`
        : "等待开始",
      experimentId: experiment.id,
      icon: String(experiments.value.length - index).padStart(2, "0"),
      prompt: experiment.turns[0]?.prompt ?? experiment.name,
    }),
  );
  const items = [...localItems, ...cloudHistory.value];
  return items.length ? items.slice(0, 8) : placeholderHistory;
});
const learningWeeks = computed(() => learningDemo.value?.weeks ?? []);
const learningCitations = computed(
  () => learningDemo.value?.ragAnswer.citations ?? [],
);
const learningTrace = computed(() => learningDemo.value?.agentRun.trace ?? []);
const learningToolRecords = computed(
  () => learningDemo.value?.agentRun.toolRecords ?? [],
);

function createExperiment(sequence: number): ChatExperiment {
  const createdAt = new Date().toISOString();
  return {
    createdAt,
    id: crypto.randomUUID(),
    name:
      sequence === 1
        ? "对话实验室"
        : `实验 ${String(sequence).padStart(2, "0")}`,
    turns: [],
    updatedAt: createdAt,
  };
}

function openToolbox(): void {
  emit("openToolbox");
}

function isConversationTurn(value: unknown): value is ConversationTurn {
  return (
    isRecord(value) &&
    typeof value.answer === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.id === "string" &&
    typeof value.model === "string" &&
    typeof value.prompt === "string" &&
    (value.state === "done" ||
      value.state === "error" ||
      value.state === "running" ||
      value.state === "stopped") &&
    typeof value.status === "string"
  );
}

function isChatExperiment(value: unknown): value is ChatExperiment {
  return (
    isRecord(value) &&
    typeof value.createdAt === "string" &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.turns) &&
    value.turns.every(isConversationTurn) &&
    typeof value.updatedAt === "string"
  );
}

function loadStoredExperiments(): ChatExperiment[] {
  try {
    const stored = localStorage.getItem(experimentStorageKey);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatExperiment).map((experiment) => ({
      ...experiment,
      turns: experiment.turns.map((turn) =>
        turn.state === "running"
          ? { ...turn, state: "stopped", status: "上次会话已中断" }
          : turn,
      ),
    }));
  } catch {
    return [];
  }
}

function selectedModel(): string | undefined {
  return model.value.trim() || undefined;
}

function resetMetrics(): void {
  firstToken.value = "—";
  latency.value = "—";
  inputTokens.value = "—";
  outputTokens.value = "—";
  pipeline.guardrail = "idle";
  pipeline.context = "idle";
  pipeline.generate = "idle";
  pipeline.validate = "idle";
  pipeline.persist = "idle";
  pipelineStatus.value = "等待运行";
}

function setPipelineStep(step: WorkflowStep, state: PipelineState): void {
  pipeline[step] = state;
}

function updateMetrics(metrics: RunMetrics): void {
  firstToken.value = `${metrics.firstTokenMs}ms`;
  latency.value = `${metrics.totalLatencyMs}ms`;
  inputTokens.value = String(metrics.usage.inputTokens);
  outputTokens.value = String(metrics.usage.outputTokens);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number") return "—";
  return `${Math.round(value * 100)}%`;
}

function renderTurnAnswer(answer: string): string {
  return renderMarkdown(answer);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function scrollConversation(
  behavior: ScrollBehavior = "smooth",
): Promise<void> {
  await nextTick();
  conversationEndRef.value?.scrollIntoView({
    behavior,
    block: "end",
  });
}

function findTurn(turnId: string | undefined): ConversationTurn | undefined {
  if (!turnId) return undefined;
  for (const experiment of experiments.value) {
    const turn = experiment.turns.find((item) => item.id === turnId);
    if (turn) return turn;
  }
  return undefined;
}

function touchTurnExperiment(turnId: string): void {
  const experiment = experiments.value.find((item) =>
    item.turns.some((turn) => turn.id === turnId),
  );
  if (experiment) {
    experiment.updatedAt = new Date().toISOString();
  }
}

function flushTokenBuffer(): void {
  if (tokenAnimationFrame !== undefined) {
    cancelAnimationFrame(tokenAnimationFrame);
    tokenAnimationFrame = undefined;
  }
  if (!tokenBuffer) return;
  const turn = findTurn(runningTurnId.value);
  if (!turn) {
    tokenBuffer = "";
    return;
  }
  turn.answer += tokenBuffer;
  tokenBuffer = "";
  touchTurnExperiment(turn.id);
  void scrollConversation("auto");
}

function queueToken(token: string): void {
  tokenBuffer += token;
  if (tokenAnimationFrame === undefined) {
    tokenAnimationFrame = requestAnimationFrame(flushTokenBuffer);
  }
}

function buildChatHistory(turns: ConversationTurn[]): ChatContextMessage[] {
  const turnLimit = Math.floor(historyMessageLimit.value / 2);
  if (turnLimit <= 0) return [];
  return turns
    .filter((turn) => turn.answer.trim())
    .slice(-turnLimit)
    .flatMap((turn) => [
      { role: "user" as const, content: turn.prompt },
      { role: "assistant" as const, content: turn.answer },
    ]);
}

function handleStreamEvent(event: StreamEvent): void {
  const turn = findTurn(runningTurnId.value);
  if (!turn) return;

  if (event.type === "token") {
    if (!turn.answer) {
      thinking.value = false;
      turn.status = "正在生成";
    }
    queueToken(event.token);
    setPipelineStep("generate", "active");
    pipelineStatus.value = "模型正在流式生成";
  } else if (event.type === "metrics") {
    flushTokenBuffer();
    updateMetrics(event.metrics);
  } else if (event.type === "workflow") {
    flushTokenBuffer();
    setPipelineStep(event.step, event.status);
    pipelineStatus.value = event.detail;
  } else if (event.type === "done") {
    flushTokenBuffer();
    persisted.value = event.persisted;
  }
}

async function sendMessage(): Promise<void> {
  const prompt = message.value.trim();
  if (!prompt) {
    ElMessage.warning("请先输入一个问题");
    return;
  }
  if (running.value) return;
  const experiment = activeExperiment.value;
  if (!experiment) return;
  const history = buildChatHistory(experiment.turns);

  chatController.value = new AbortController();
  const turn: ConversationTurn = {
    answer: "",
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    model: selectedModel() ?? modelPlaceholder.value,
    prompt,
    state: "running",
    status: "正在思考",
  };
  experiment.turns.push(turn);
  experiment.updatedAt = turn.createdAt;
  runningTurnId.value = turn.id;
  message.value = "";
  thinking.value = true;
  saveState.value = "生成中";
  runState.value = "running";
  runLabel.value = "RUNNING";
  persisted.value = false;
  resetMetrics();
  setPipelineStep("guardrail", "active");
  pipelineStatus.value = "工作流已启动";
  await scrollConversation();

  try {
    persisted.value = await streamChat(
      prompt,
      selectedModel(),
      chatController.value.signal,
      handleStreamEvent,
      history,
    );
    flushTokenBuffer();
    thinking.value = false;
    turn.state = "done";
    turn.status = "生成完成";
    touchTurnExperiment(turn.id);
    saveState.value = persisted.value ? "云端已保存" : "本地会话";
    runState.value = "done";
    runLabel.value = "DONE";
    if (persisted.value) {
      await loadHistory();
    }
  } catch (error) {
    flushTokenBuffer();
    thinking.value = false;
    if (error instanceof Error && error.name === "AbortError") {
      turn.answer += turn.answer ? "\n\n> 已停止生成" : "> 已停止生成";
      turn.state = "stopped";
      turn.status = "已停止";
      saveState.value = "已保存";
      runState.value = "idle";
      runLabel.value = "STOPPED";
      pipelineStatus.value = "用户主动停止";
    } else {
      turn.answer += `\n\n> 请求失败：${errorMessage(error)}`;
      turn.state = "error";
      turn.status = "生成失败";
      saveState.value = "保存失败";
      runState.value = "error";
      runLabel.value = "ERROR";
      pipelineStatus.value = "调用失败";
    }
    touchTurnExperiment(turn.id);
  } finally {
    thinking.value = false;
    chatController.value = undefined;
    runningTurnId.value = undefined;
  }
}

function stopGeneration(): void {
  chatController.value?.abort();
}

function resetRunState(): void {
  chatController.value?.abort();
  message.value = "";
  thinking.value = false;
  saveState.value = "自动保存";
  runState.value = "idle";
  runLabel.value = "IDLE";
  structuredResult.value = "等待生成...";
  resetMetrics();
}

function startNewExperiment(): void {
  if (running.value) {
    ElMessage.warning("请先停止当前生成，再新建实验");
    return;
  }
  resetRunState();
  experimentCount.value += 1;
  const experiment = createExperiment(experimentCount.value);
  experiments.value.push(experiment);
  activeExperimentId.value = experiment.id;
  activeNavigation.value = "chat";
  ElMessage.success(
    `已创建实验 ${String(experimentCount.value).padStart(2, "0")}`,
  );
}

function selectHistory(item: DisplayHistory): void {
  if (item.experimentId) {
    activeExperimentId.value = item.experimentId;
    activeNavigation.value = "chat";
    message.value = "";
    const experiment = activeExperiment.value;
    saveState.value = experiment?.turns.length
      ? `${experiment.turns.length} 轮对话`
      : "自动保存";
    void scrollConversation();
    return;
  }
  message.value = item.prompt;
  ElMessage.success("已载入历史问题，可再次发送");
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "云端记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function loadHistory(): Promise<void> {
  try {
    const history = await fetchHistory();
    if (!history.enabled || !history.items.length) {
      cloudHistory.value = [];
      return;
    }
    cloudHistory.value = [...history.items].reverse().map((item, index) => ({
      detail: formatHistoryTime(item.createdAt),
      icon: String(history.items.length - index).padStart(2, "0"),
      prompt: item.prompt,
    }));
  } catch {
    cloudHistory.value = [];
  }
}

async function loadHealth(): Promise<void> {
  try {
    const health = await fetchHealth();
    sidebarStatus.value = "服务运行正常";
    statusTone.value = "online";
    const databaseLabel =
      health.database.state === "connected"
        ? "CloudBase 已连接"
        : health.database.enabled
          ? "CloudBase 已配置"
          : "数据库未启用";
    sidebarMode.value = `${health.mode.toUpperCase()} · ${health.apiType} · ${databaseLabel}`;
    const firstModel = health.models[0];
    if (firstModel) {
      modelPlaceholder.value = firstModel;
    }
    historyMessageLimit.value = health.limits.chatHistoryMaxMessages;
  } catch {
    sidebarStatus.value = "服务连接失败";
    sidebarMode.value = "请检查后端服务";
    statusTone.value = "offline";
  }
}

async function loadLearningDemo(): Promise<void> {
  learningBusy.value = true;
  learningError.value = "";
  try {
    learningDemo.value = await fetchLearningDemo();
  } catch (error) {
    learningError.value = errorMessage(error);
  } finally {
    learningBusy.value = false;
  }
}

async function runSupportDemo(approved: boolean): Promise<void> {
  const question = supportQuestion.value.trim();
  if (!question) {
    ElMessage.warning("请先输入客服问题");
    return;
  }
  supportBusy.value = true;
  learningError.value = "";
  try {
    supportApproved.value = approved;
    supportResult.value = await runSupportAgent(question, approved);
  } catch (error) {
    learningError.value = errorMessage(error);
  } finally {
    supportBusy.value = false;
  }
}

async function generateStructuredOutput(): Promise<void> {
  const value = projectRecord.value.trim();
  if (!value) {
    ElMessage.warning("请先填写项目记录");
    return;
  }

  structuredBusy.value = true;
  structuredResult.value = "等待模型输出...";
  runState.value = "running";
  runLabel.value = "VALIDATING";
  try {
    const data = await createStructuredOutput(value, selectedModel());
    structuredResult.value = JSON.stringify(data, null, 2);
    const degraded = isRecord(data) && data.degraded === true;
    runState.value = degraded ? "error" : "done";
    runLabel.value = degraded ? "DEGRADED" : "VALID";
    if (degraded) {
      ElMessage.warning("已降级，建议人工复核");
    } else {
      ElMessage.success("JSON Schema 校验通过");
    }
  } catch (error) {
    structuredResult.value = `请求失败：${errorMessage(error)}`;
    runState.value = "error";
    runLabel.value = "ERROR";
  } finally {
    structuredBusy.value = false;
  }
}

async function copyText(value: string, successMessage: string): Promise<void> {
  if (!value.trim()) {
    ElMessage.warning("当前没有可复制内容");
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    ElMessage.success(successMessage);
  } catch {
    ElMessage.error("复制失败，请手动选择内容");
  }
}

function selectNavigation(section: NavigationSection): void {
  activeNavigation.value = section;
  if (
    section === "structured" ||
    section === "metrics" ||
    section === "learning"
  ) {
    activeInspector.value = section;
    inspectorRef.value?.scrollIntoView({ behavior: "smooth" });
  }
}

function applyTheme(value: "dark" | "light"): void {
  theme.value = value;
  document.documentElement.dataset.theme = value;
  localStorage.setItem("workbench-theme", value);
}

function toggleTheme(): void {
  applyTheme(theme.value === "dark" ? "light" : "dark");
}

function handleGlobalShortcut(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    startNewExperiment();
  }
}

function handleComposerKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void sendMessage();
  }
}

watch(theme, (value) => {
  document.documentElement.dataset.theme = value;
});

watch(
  experiments,
  (value) => {
    clearTimeout(experimentSaveTimer);
    experimentSaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(experimentStorageKey, JSON.stringify(value));
      } catch {
        saveState.value = "本地保存失败";
      }
    }, 250);
  },
  { deep: true },
);

onMounted(() => {
  const savedTheme = localStorage.getItem("workbench-theme");
  const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)")
    .matches
    ? "dark"
    : "light";
  applyTheme(
    savedTheme === "dark"
      ? "dark"
      : savedTheme === "light"
        ? "light"
        : preferredTheme,
  );
  window.addEventListener("keydown", handleGlobalShortcut);
  resetMetrics();
  void loadHealth();
  void loadHistory();
  void loadLearningDemo();
});

onBeforeUnmount(() => {
  chatController.value?.abort();
  clearTimeout(experimentSaveTimer);
  flushTokenBuffer();
  window.removeEventListener("keydown", handleGlobalShortcut);
});
</script>

<template>
  <div class="ambient ambient-one"></div>
  <div class="ambient ambient-two"></div>

  <div class="app-shell">
    <aside class="sidebar" aria-label="主导航">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">凡</div>
        <div>
          <strong>CS 凡</strong>
          <span>Vue · Electron</span>
        </div>
      </div>

      <el-button class="new-chat" type="primary" @click="startNewExperiment">
        <span class="button-symbol">＋</span>
        新建实验
        <kbd>Ctrl K</kbd>
      </el-button>

      <el-scrollbar class="nav-scroll">
        <nav class="nav-list">
          <p class="nav-label">工作台</p>
          <el-button
            class="nav-item"
            :class="{ active: activeNavigation === 'chat' }"
            text
            @click="selectNavigation('chat')"
          >
            <span class="nav-icon">◫</span>
            对话实验
            <span class="nav-dot"></span>
          </el-button>
          <el-button
            class="nav-item"
            :class="{ active: activeNavigation === 'structured' }"
            text
            @click="selectNavigation('structured')"
          >
            <span class="nav-icon">{ }</span>
            结构化输出
          </el-button>
          <el-button
            class="nav-item"
            :class="{ active: activeNavigation === 'metrics' }"
            text
            @click="selectNavigation('metrics')"
          >
            <span class="nav-icon">▥</span>
            运行指标
          </el-button>
          <el-button
            class="nav-item"
            :class="{ active: activeNavigation === 'learning' }"
            text
            @click="selectNavigation('learning')"
          >
            <span class="nav-icon">◎</span>
            Week 2-9
          </el-button>
          <p class="nav-label recent-label">最近实验</p>
          <el-button
            v-for="item in historyItems"
            :key="item.experimentId ?? `${item.icon}-${item.prompt}-${item.detail}`"
            class="history-item"
            :class="{ active: item.experimentId === activeExperimentId }"
            text
            @click="selectHistory(item)"
          >
            <span class="history-icon">{{ item.icon }}</span>
            <span class="history-text">
              <strong>{{ item.prompt }}</strong>
              <small>{{ item.detail }}</small>
            </span>
          </el-button>
        </nav>
      </el-scrollbar>

      <div class="sidebar-footer">
        <div class="status-card">
          <span class="status-dot" :class="statusTone"></span>
          <div>
            <strong>{{ sidebarStatus }}</strong>
            <span>{{ sidebarMode }}</span>
          </div>
        </div>
        <a :href="healthLink" target="_blank" rel="noreferrer">
          API Health
          <span>↗</span>
        </a>
      </div>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div class="mobile-brand">
          <div class="brand-mark small" aria-hidden="true">凡</div>
          <strong>CS 凡</strong>
        </div>
        <div class="experiment-title">
          <span class="eyebrow">PLAYGROUND / CHAT</span>
          <div>
            <h1>{{ experimentName }}</h1>
            <span class="save-state">{{ saveState }}</span>
          </div>
        </div>
        <el-button class="toolbox-switch" text @click="openToolbox">
          <span class="toolbox-switch-icon">✦</span>
          创图工具箱
        </el-button>
        <div class="topbar-actions">
          <label class="model-selector">
            <span class="model-orb"></span>
            <span>
              <small>当前模型</small>
              <input
                v-model="model"
                aria-label="模型名"
                :placeholder="modelPlaceholder"
              />
            </span>
          </label>
          <el-tooltip content="切换深浅色" placement="bottom">
            <el-button
              class="icon-button"
              circle
              :aria-label="theme === 'dark' ? '切换浅色' : '切换深色'"
              @click="toggleTheme"
            >
              {{ theme === "dark" ? "☀" : "☾" }}
            </el-button>
          </el-tooltip>
          <el-button class="mobile-new" type="primary" @click="startNewExperiment">
            ＋
          </el-button>
        </div>
      </header>

      <div class="content-grid">
        <section class="chat-stage">
          <el-scrollbar class="conversation">
            <div v-if="!conversationTurns.length" class="welcome">
              <div class="welcome-avatar">
                <img src="/assets/ai-avatar.jpg" alt="CS 凡 AI 助手头像" />
              </div>
              <div class="welcome-badge"><span>✦</span> CS 凡 · AI 实验助手</div>
              <h2>如果回答不理想，请考虑一下自身问题。</h2>
              <div class="suggestion-grid">
                <el-button
                  v-for="suggestion in suggestions"
                  :key="suggestion.title"
                  class="suggestion-card"
                  text
                  @click="message = suggestion.prompt"
                >
                  <span class="suggestion-icon" :class="suggestion.tone">
                    {{ suggestion.icon }}
                  </span>
                  <span>
                    <strong>{{ suggestion.title }}</strong>
                    <small>{{ suggestion.description }}</small>
                  </span>
                  <span class="arrow">↗</span>
                </el-button>
              </div>
            </div>

            <div v-else class="message-thread">
              <div class="conversation-header">
                <div>
                  <span class="eyebrow">CONVERSATION</span>
                  <strong>{{ experimentName }}</strong>
                </div>
                <span>{{ conversationTurns.length }} 轮对话</span>
              </div>

              <section
                v-for="(turn, index) in conversationTurns"
                :key="turn.id"
                class="conversation-turn"
              >
                <div class="turn-divider">
                  <span>第 {{ index + 1 }} 轮</span>
                  <time>{{ formatHistoryTime(turn.createdAt) }}</time>
                </div>

                <article class="message user-message">
                  <div class="avatar user-avatar">你</div>
                  <div>
                    <div class="message-meta">
                      <strong>你</strong>
                      <span>{{ formatHistoryTime(turn.createdAt) }}</span>
                    </div>
                    <div class="message-content">{{ turn.prompt }}</div>
                  </div>
                </article>

                <article class="message assistant-message">
                  <div class="avatar ai-avatar">
                    <img src="/assets/ai-avatar.jpg" alt="" />
                  </div>
                  <div>
                    <div class="message-meta">
                      <strong>CS 凡</strong>
                      <span>{{ turn.status }} · {{ turn.model }}</span>
                    </div>
                    <div
                      v-if="
                        thinking &&
                        turn.state === 'running' &&
                        turn.id === runningTurnId
                      "
                      class="thinking-indicator"
                    >
                      <span class="thinking-orb">✦</span>
                      <span>模型正在分析问题</span>
                      <span class="thinking-dots" aria-hidden="true">
                        <i></i><i></i><i></i>
                      </span>
                    </div>
                    <div
                      class="message-content assistant-content rich-content"
                      :aria-busy="turn.state === 'running'"
                      v-html="renderTurnAnswer(turn.answer)"
                    ></div>
                    <div v-if="turn.answer && turn.state !== 'running'" class="message-actions">
                      <el-button text @click="copyText(turn.answer, '回答已复制')">
                        复制回答
                      </el-button>
                    </div>
                  </div>
                </article>
              </section>
            </div>
            <div ref="conversationEndRef" class="conversation-end"></div>
          </el-scrollbar>

          <div class="composer-wrap">
            <div class="composer">
              <el-input
                v-model="message"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 5 }"
                resize="none"
                placeholder="输入问题，Enter 发送，Shift + Enter 换行"
                aria-label="聊天消息"
                @keydown="handleComposerKeydown"
              />
              <div class="composer-footer">
                <div class="composer-hint">
                  <span>Vue 3</span>
                  <span>Element Plus</span>
                  <span v-if="isElectron">Electron</span>
                </div>
                <div class="composer-actions">
                  <el-button
                    class="stop-button"
                    :disabled="!running"
                    @click="stopGeneration"
                  >
                    停止
                  </el-button>
                  <el-button
                    class="send-button"
                    type="primary"
                    :disabled="running"
                    @click="sendMessage"
                  >
                    发送 ↑
                  </el-button>
                </div>
              </div>
            </div>
            <p>模型输出可能不准确，请结合业务数据复核。</p>
          </div>
        </section>

        <aside ref="inspectorRef" class="inspector" aria-label="实验检查器">
          <div class="inspector-header">
            <div>
              <span class="eyebrow">INSPECTOR</span>
              <h2>实验观察台</h2>
            </div>
            <el-tag class="run-badge" :class="runState" effect="plain">
              {{ runLabel }}
            </el-tag>
          </div>

          <el-tabs v-model="activeInspector" class="inspector-tabs" stretch>
            <el-tab-pane label="运行指标" name="metrics">
              <div class="metric-grid">
                <article class="metric-card">
                  <span>首 Token</span>
                  <strong>{{ firstToken }}</strong>
                  <small>响应体感</small>
                </article>
                <article class="metric-card">
                  <span>总延迟</span>
                  <strong>{{ latency }}</strong>
                  <small>完整耗时</small>
                </article>
                <article class="metric-card">
                  <span>输入 Token</span>
                  <strong>{{ inputTokens }}</strong>
                  <small>上下文规模</small>
                </article>
                <article class="metric-card">
                  <span>输出 Token</span>
                  <strong>{{ outputTokens }}</strong>
                  <small>生成规模</small>
                </article>
              </div>

              <div class="panel-block">
                <div class="panel-title">
                  <strong>调用流水线</strong>
                  <span>{{ pipelineStatus }}</span>
                </div>
                <ol class="pipeline">
                  <li :class="pipeline.guardrail">
                    <span>1</span>
                    <div><strong>输入护栏</strong><small>长度与有效性检查</small></div>
                  </li>
                  <li :class="pipeline.context">
                    <span>2</span>
                    <div><strong>装配上下文</strong><small>规则与任务要求</small></div>
                  </li>
                  <li :class="pipeline.generate">
                    <span>3</span>
                    <div><strong>模型生成</strong><small>流式输出与有限重试</small></div>
                  </li>
                  <li :class="pipeline.validate">
                    <span>4</span>
                    <div><strong>输出检查</strong><small>防止空结果进入页面</small></div>
                  </li>
                  <li :class="pipeline.persist">
                    <span>5</span>
                    <div><strong>保存记录</strong><small>本地会话 / CloudBase</small></div>
                  </li>
                </ol>
              </div>

              <div class="panel-block compact">
                <div class="panel-title">
                  <strong>双端运行架构</strong>
                  <span class="live-dot">LIVE</span>
                </div>
                <p>
                  Web 由 Node 服务托管 Vite 产物；Electron 主进程启动同一后端，
                  渲染进程继续复用当前 Vue 页面。
                </p>
              </div>
            </el-tab-pane>

            <el-tab-pane label="运行结果" name="learning">
              <div v-if="learningError" class="panel-block compact">
                <div class="panel-title">
                  <strong>加载失败</strong>
                  <span>ERROR</span>
                </div>
                <p>{{ learningError }}</p>
              </div>

              <div class="learning-summary">
                <article class="metric-card">
                  <span>RAG Recall</span>
                  <strong>
                    {{ formatPercent(learningDemo?.ragEval.averageRecall) }}
                  </strong>
                  <small>固定数据集</small>
                </article>
                <article class="metric-card">
                  <span>MRR</span>
                  <strong>
                    {{ formatPercent(learningDemo?.ragEval.averageMrr) }}
                  </strong>
                  <small>首个正确引用</small>
                </article>
                <article class="metric-card">
                  <span>忠实度</span>
                  <strong>
                    {{
                      formatPercent(learningDemo?.ragEval.averageFaithfulness)
                    }}
                  </strong>
                  <small>回答来自引用</small>
                </article>
                <article class="metric-card">
                  <span>HITL</span>
                  <strong>
                    {{
                      learningDemo?.supportAgent.humanConfirmationRequired
                        ? "等待确认"
                        : "无需确认"
                    }}
                  </strong>
                  <small>高风险工具</small>
                </article>
              </div>

              <div class="panel-block support-demo">
                <div class="panel-title">
                  <strong>企业客服纵向切片</strong>
                  <span>{{ supportResult?.status ?? "READY" }}</span>
                </div>
                <el-input
                  v-model="supportQuestion"
                  type="textarea"
                  :rows="3"
                  resize="vertical"
                  aria-label="企业客服演示问题"
                />
                <div class="support-actions">
                  <el-button
                    :loading="supportBusy && !supportApproved"
                    @click="runSupportDemo(false)"
                  >
                    运行并等待确认
                  </el-button>
                  <el-button
                    type="primary"
                    :loading="supportBusy && supportApproved"
                    @click="runSupportDemo(true)"
                  >
                    人工批准后继续
                  </el-button>
                </div>
                <div v-if="supportResult" class="support-result">
                  <span
                    :class="[
                      'week-status',
                      supportResult.humanConfirmationRequired
                        ? 'pending_confirmation'
                        : 'success',
                    ]"
                  >
                    {{
                      supportResult.humanConfirmationRequired
                        ? "等待确认"
                        : "已完成"
                    }}
                  </span>
                  <p>{{ supportResult.answer }}</p>
                  <small>Trace: {{ supportResult.traceId }}</small>
                  <small>
                    工具：{{ supportResult.toolStatuses.join(" / ") || "无" }}
                  </small>
                </div>
              </div>
              <div class="panel-block">
                <div class="panel-title">
                  <strong>工具调用与确认状态</strong>
                  <span>Tool Calling</span>
                </div>
                <ul class="learning-list compact-list">
                  <li v-for="record in learningToolRecords" :key="record.name">
                    <span :class="['week-status', record.status]">
                      {{ record.status }}
                    </span>
                    <div>
                      <strong>{{ record.name }}</strong>
                      <small>{{ record.detail }}</small>
                    </div>
                  </li>
                </ul>
              </div>

              <div class="panel-block">
                <div class="panel-title">
                  <strong>引用来源与 Trace</strong>
                  <span>{{ learningDemo?.supportAgent.traceId ?? "—" }}</span>
                </div>
                <ul class="citation-list">
                  <li v-for="item in learningCitations" :key="item.source">
                    <strong>{{ item.title }}</strong>
                    <small>{{ item.source }}</small>
                  </li>
                </ul>
                <ol class="trace-list">
                  <li v-for="event in learningTrace" :key="event.detail">
                    <span>{{ event.kind }}</span>
                    <small>{{ event.detail }}</small>
                  </li>
                </ol>
              </div>
            </el-tab-pane>

            <el-tab-pane label="结构化输出" name="structured">
              <div class="structured-intro">
                <span class="code-mark">{ }</span>
                <div>
                  <strong>项目复盘提取器</strong>
                  <p>生成、校验并展示结构化 JSON，失败时保留降级状态。</p>
                </div>
              </div>
              <el-input
                v-model="projectRecord"
                type="textarea"
                :rows="7"
                resize="vertical"
                aria-label="项目记录"
              />
              <el-button
                class="structure-button"
                type="primary"
                :loading="structuredBusy"
                @click="generateStructuredOutput"
              >
                生成并校验 JSON
              </el-button>
              <div class="json-result">
                <div class="json-toolbar">
                  <span>schema-result.json</span>
                  <el-button
                    text
                    @click="copyText(structuredResult, 'JSON 已复制')"
                  >
                    复制 JSON
                  </el-button>
                </div>
                <pre aria-live="polite">{{ structuredResult }}</pre>
              </div>
            </el-tab-pane>
          </el-tabs>
        </aside>
      </div>
    </main>
  </div>
</template>
