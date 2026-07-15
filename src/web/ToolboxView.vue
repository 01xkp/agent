<script setup lang="ts">
import { ElMessage } from "element-plus";
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import {
  type DocumentSlide,
  exportPresentation,
  parseWordDocument,
  type WordConversion,
} from "./document-tools";
import {
  type CompressionResult,
  type CropFrame,
  compressImageFile,
  createIdPhoto,
  createIdPhotoPrintLayout,
  cropImage,
  downloadBlob,
  formatBytes,
  type PrintLayoutResult,
  photoSpecs,
  printLayoutPresets,
  removePortraitBackground,
} from "./image-tools";

type ToolKey = "compress" | "crop" | "id-photo" | "word";
type CropDragMode = "move" | "resize";

const emit = defineEmits<{
  openAgent: [];
}>();

const tools: Array<{
  badge: string;
  description: string;
  key: ToolKey;
  name: string;
}> = [
  {
    key: "id-photo",
    badge: "AI",
    name: "智能证件照",
    description: "抠图、换底与合规尺寸",
  },
  {
    key: "crop",
    badge: "01",
    name: "图片裁剪",
    description: "自由裁剪与批量改尺寸",
  },
  {
    key: "compress",
    badge: "02",
    name: "图片压缩",
    description: "视觉无损与指定大小",
  },
  {
    key: "word",
    badge: "W",
    name: "Word 转 PPT",
    description: "智能分页与在线预览",
  },
];

const activeTool = ref<ToolKey>("id-photo");
const theme = ref<"dark" | "light">(
  localStorage.getItem("image-toolbox-theme") === "dark" ? "dark" : "light",
);

const idFile = ref<File>();
const idSourceUrl = ref("");
const removedPortrait = ref<Blob>();
const removedUrl = ref("");
const idResult = ref<Blob>();
const idResultUrl = ref("");
const idBusy = ref(false);
const idProgress = ref(0);
const idStage = ref("等待上传人像照片");
const selectedSpecId = ref(photoSpecs[0]?.id ?? "");
const background = ref("#ffffff");
const customBackground = ref("#d9eaff");
const selectedPrintLayoutId = ref(printLayoutPresets[0]?.id ?? "");
const printResult = ref<PrintLayoutResult>();
const printResultUrl = ref("");
const selectedSpec = computed(
  () =>
    photoSpecs.find((item) => item.id === selectedSpecId.value) ??
    photoSpecs[0],
);
const selectedPrintLayout = computed(
  () =>
    printLayoutPresets.find(
      (item) => item.id === selectedPrintLayoutId.value,
    ) ?? printLayoutPresets[0],
);
const idResultValid = computed(() => {
  if (!idResult.value || !selectedSpec.value) return false;
  const sizeKb = idResult.value.size / 1024;
  return (
    sizeKb >= selectedSpec.value.minKb && sizeKb <= selectedSpec.value.maxKb
  );
});

const cropFiles = ref<File[]>([]);
const cropPreviewUrl = ref("");
const cropImageWidth = ref(1);
const cropImageHeight = ref(1);
const cropTargetWidth = ref(800);
const cropTargetHeight = ref(800);
const cropRatio = ref("1:1");
const cropFrame = reactive<CropFrame>({
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.8,
});
const cropViewportRef = ref<HTMLElement>();
const cropBusy = ref(false);
const cropStatus = ref("上传图片后可拖动裁剪框");
let cropDrag:
  | {
      frame: CropFrame;
      mode: CropDragMode;
      pointerX: number;
      pointerY: number;
    }
  | undefined;
let recolorTimer: number | undefined;

const compressionMode = ref<"smart" | "target">("smart");
const compressionTargetKb = ref(50);
const compressionFiles = ref<File[]>([]);
const compressionResults = ref<CompressionResult[]>([]);
const compressionBusy = ref(false);
const comparePercent = ref(50);
const selectedCompressionIndex = ref(0);
const selectedCompression = computed(
  () => compressionResults.value[selectedCompressionIndex.value],
);
const originalCompressionUrls = ref<string[]>([]);
const selectedCompressionOriginalUrl = computed(
  () => originalCompressionUrls.value[selectedCompressionIndex.value] ?? "",
);

const wordFile = ref<File>();
const wordBusy = ref(false);
const wordConversion = ref<WordConversion>();
const selectedSlideIndex = ref(0);
const selectedSlide = computed<DocumentSlide | undefined>(
  () => wordConversion.value?.slides[selectedSlideIndex.value],
);

function displayBytes(bytes: number): string {
  return formatBytes(bytes);
}

function revokeUrl(url: string): void {
  if (url) URL.revokeObjectURL(url);
}

function replaceUrl(target: { value: string }, source?: Blob | File): void {
  revokeUrl(target.value);
  target.value = source ? URL.createObjectURL(source) : "";
}

function setTheme(nextTheme: "dark" | "light"): void {
  theme.value = nextTheme;
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("image-toolbox-theme", nextTheme);
}

function toggleTheme(): void {
  setTheme(theme.value === "dark" ? "light" : "dark");
}

function openAgent(): void {
  emit("openAgent");
}

function selectTool(key: ToolKey): void {
  activeTool.value = key;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function readSingleFile(event: Event): File | undefined {
  const input = event.target as HTMLInputElement;
  return input.files?.[0];
}

function readMultipleFiles(event: Event): File[] {
  const input = event.target as HTMLInputElement;
  return [...(input.files ?? [])];
}

function handleIdUpload(event: Event): void {
  const file = readSingleFile(event);
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    ElMessage.error("请选择 JPG、PNG 或 WebP 人像照片");
    return;
  }
  idFile.value = file;
  removedPortrait.value = undefined;
  idResult.value = undefined;
  replaceUrl(idSourceUrl, file);
  replaceUrl(removedUrl);
  replaceUrl(idResultUrl);
  printResult.value = undefined;
  replaceUrl(printResultUrl);
  idStage.value = "照片已就绪，可开始 AI 发丝级抠图";
  idProgress.value = 0;
}

async function ensureRemovedPortrait(): Promise<Blob> {
  if (!idFile.value) {
    throw new Error("请先上传人像照片");
  }
  idProgress.value = 1;
  idStage.value = "首次使用正在加载本地 AI 模型";
  const result = await removePortraitBackground(idFile.value, (progress) => {
    idProgress.value = progress;
    idStage.value =
      progress < 100 ? `AI 模型处理中 ${progress}%` : "正在精修发丝边缘";
  });
  removedPortrait.value = result;
  replaceUrl(removedUrl, result);
  idStage.value = "背景已移除，可选择规格与底色";
  return result;
}

async function runBackgroundRemoval(): Promise<void> {
  if (!idFile.value) {
    ElMessage.warning("请先上传人像照片");
    return;
  }
  idBusy.value = true;
  try {
    await ensureRemovedPortrait();
    ElMessage.success("AI 抠图完成");
  } catch (error) {
    idStage.value = "AI 抠图失败，请检查网络后重试";
    ElMessage.error(error instanceof Error ? error.message : "AI 抠图失败");
  } finally {
    idBusy.value = false;
  }
}

async function generateIdPhoto(): Promise<void> {
  const spec = selectedSpec.value;
  if (!idFile.value || !spec) {
    ElMessage.warning("请先上传人像照片");
    return;
  }
  idBusy.value = true;
  try {
    const source = removedPortrait.value ?? (await ensureRemovedPortrait());
    idStage.value = "正在应用背景与进行文件大小校验";
    const result = await createIdPhoto(
      source,
      spec,
      background.value === "custom" ? customBackground.value : background.value,
    );
    idResult.value = result;
    replaceUrl(idResultUrl, result);
    printResult.value = undefined;
    replaceUrl(printResultUrl);
    idStage.value = "证件照已生成，可高清无水印导出";
    ElMessage.success("合规证件照生成完成");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "生成失败");
  } finally {
    idBusy.value = false;
  }
}

async function refreshIdPhotoBackground(): Promise<void> {
  const source = removedPortrait.value;
  const spec = selectedSpec.value;
  if (!source || !spec || !idResult.value || idBusy.value) return;
  try {
    const result = await createIdPhoto(
      source,
      spec,
      background.value === "custom" ? customBackground.value : background.value,
    );
    idResult.value = result;
    replaceUrl(idResultUrl, result);
    printResult.value = undefined;
    replaceUrl(printResultUrl);
    idStage.value = "背景色已更新";
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "背景更新失败");
  }
}

function exportIdPhoto(): void {
  const spec = selectedSpec.value;
  if (!idResult.value || !spec) return;
  downloadBlob(idResult.value, `${spec.name}-${spec.width}x${spec.height}.jpg`);
}

async function generatePrintLayout(): Promise<void> {
  const spec = selectedSpec.value;
  const layout = selectedPrintLayout.value;
  if (!idResult.value || !spec || !layout) {
    ElMessage.warning("请先生成证件照");
    return;
  }
  idBusy.value = true;
  try {
    const result = await createIdPhotoPrintLayout(idResult.value, spec, layout);
    printResult.value = result;
    replaceUrl(printResultUrl, result.blob);
    ElMessage.success(`已生成 ${result.count} 张照片的打印排版`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "排版生成失败");
  } finally {
    idBusy.value = false;
  }
}

function exportPrintLayout(): void {
  const spec = selectedSpec.value;
  const layout = selectedPrintLayout.value;
  if (!printResult.value || !spec || !layout) return;
  downloadBlob(
    printResult.value.blob,
    `${layout.name}-${spec.name}-打印版.jpg`,
  );
}

function handleCropUpload(event: Event): void {
  const files = readMultipleFiles(event).filter((file) =>
    file.type.startsWith("image/"),
  );
  if (!files.length) return;
  cropFiles.value = files;
  replaceUrl(cropPreviewUrl, files[0]);
  cropStatus.value = `已加载 ${files.length} 张图片，拖动白色裁剪框调整范围`;
  Object.assign(cropFrame, { x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
}

function handleCropImageLoad(event: Event): void {
  const image = event.target as HTMLImageElement;
  cropImageWidth.value = image.naturalWidth;
  cropImageHeight.value = image.naturalHeight;
  applyCropRatio(cropRatio.value);
}

function applyCropRatio(value: string): void {
  cropRatio.value = value;
  if (value === "free") return;
  const [widthPart, heightPart] = value.split(":").map(Number);
  if (!widthPart || !heightPart) return;
  const ratio = widthPart / heightPart;
  const imageRatio = cropImageWidth.value / cropImageHeight.value;
  let width = 0.8;
  let height = (width * imageRatio) / ratio;
  if (height > 0.8) {
    height = 0.8;
    width = (height * ratio) / imageRatio;
  }
  Object.assign(cropFrame, {
    width,
    height,
    x: (1 - width) / 2,
    y: (1 - height) / 2,
  });
  cropTargetHeight.value = Math.max(
    1,
    Math.round(cropTargetWidth.value / ratio),
  );
}

function beginCropDrag(event: PointerEvent, mode: CropDragMode): void {
  event.preventDefault();
  cropDrag = {
    mode,
    pointerX: event.clientX,
    pointerY: event.clientY,
    frame: { ...cropFrame },
  };
  window.addEventListener("pointermove", handleCropDrag);
  window.addEventListener("pointerup", endCropDrag, { once: true });
}

function handleCropDrag(event: PointerEvent): void {
  const viewport = cropViewportRef.value;
  if (!cropDrag || !viewport) return;
  const bounds = viewport.getBoundingClientRect();
  const deltaX = (event.clientX - cropDrag.pointerX) / bounds.width;
  const deltaY = (event.clientY - cropDrag.pointerY) / bounds.height;
  if (cropDrag.mode === "move") {
    cropFrame.x = Math.min(
      1 - cropDrag.frame.width,
      Math.max(0, cropDrag.frame.x + deltaX),
    );
    cropFrame.y = Math.min(
      1 - cropDrag.frame.height,
      Math.max(0, cropDrag.frame.y + deltaY),
    );
    return;
  }
  const minimum = 0.08;
  cropFrame.width = Math.min(
    1 - cropDrag.frame.x,
    Math.max(minimum, cropDrag.frame.width + deltaX),
  );
  cropFrame.height = Math.min(
    1 - cropDrag.frame.y,
    Math.max(minimum, cropDrag.frame.height + deltaY),
  );
}

function endCropDrag(): void {
  cropDrag = undefined;
  window.removeEventListener("pointermove", handleCropDrag);
}

async function exportCrops(): Promise<void> {
  if (!cropFiles.value.length) {
    ElMessage.warning("请先上传图片");
    return;
  }
  if (cropTargetWidth.value < 1 || cropTargetHeight.value < 1) {
    ElMessage.warning("请输入有效的目标像素");
    return;
  }
  cropBusy.value = true;
  cropStatus.value = "正在浏览器本地批量裁剪";
  try {
    for (const [index, file] of cropFiles.value.entries()) {
      const result = await cropImage(
        file,
        cropFrame,
        cropTargetWidth.value,
        cropTargetHeight.value,
      );
      const baseName = file.name.replace(/\.[^.]+$/u, "");
      downloadBlob(
        result,
        `${baseName}-${cropTargetWidth.value}x${cropTargetHeight.value}.jpg`,
      );
      cropStatus.value = `已完成 ${index + 1} / ${cropFiles.value.length} 张`;
    }
    ElMessage.success("批量裁剪完成，图片未上传服务器");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "裁剪失败");
  } finally {
    cropBusy.value = false;
  }
}

function handleCompressionUpload(event: Event): void {
  const files = readMultipleFiles(event);
  const supported = files.filter(
    (file) => file.type.startsWith("image/") && file.size <= 100 * 1024 * 1024,
  );
  if (supported.length > 60) {
    ElMessage.warning("单次最多处理 60 张图片");
  }
  compressionFiles.value = supported.slice(0, 60);
  for (const result of compressionResults.value) revokeUrl(result.previewUrl);
  for (const url of originalCompressionUrls.value) revokeUrl(url);
  originalCompressionUrls.value = compressionFiles.value.map((file) =>
    URL.createObjectURL(file),
  );
  compressionResults.value = [];
  selectedCompressionIndex.value = 0;
}

async function runCompression(): Promise<void> {
  if (!compressionFiles.value.length) {
    ElMessage.warning("请先上传图片");
    return;
  }
  compressionBusy.value = true;
  for (const result of compressionResults.value) revokeUrl(result.previewUrl);
  compressionResults.value = [];
  try {
    const results: CompressionResult[] = [];
    for (const file of compressionFiles.value) {
      results.push(
        await compressImageFile(file, {
          mode: compressionMode.value,
          targetKb: compressionTargetKb.value,
        }),
      );
    }
    compressionResults.value = results;
    ElMessage.success(`已完成 ${results.length} 张图片压缩`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "压缩失败");
  } finally {
    compressionBusy.value = false;
  }
}

function exportCompressed(result: CompressionResult): void {
  downloadBlob(result.blob, result.fileName);
}

function exportAllCompressed(): void {
  for (const result of compressionResults.value) exportCompressed(result);
}

function handleWordUpload(event: Event): void {
  const file = readSingleFile(event);
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    ElMessage.error("Word 文件不能超过 50MB");
    return;
  }
  wordFile.value = file;
  wordConversion.value = undefined;
  selectedSlideIndex.value = 0;
}

async function convertWord(): Promise<void> {
  if (!wordFile.value) {
    ElMessage.warning("请先上传 Word 文件");
    return;
  }
  wordBusy.value = true;
  try {
    wordConversion.value = await parseWordDocument(wordFile.value);
    selectedSlideIndex.value = 0;
    ElMessage.success(
      `转换完成，已根据标题层级生成 ${wordConversion.value.slides.length} 页`,
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "转换失败");
  } finally {
    wordBusy.value = false;
  }
}

async function downloadPresentation(): Promise<void> {
  if (!wordConversion.value) return;
  wordBusy.value = true;
  try {
    await exportPresentation(wordConversion.value);
    ElMessage.success("PPTX 已生成并开始下载");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "PPT 导出失败");
  } finally {
    wordBusy.value = false;
  }
}

watch(
  () => cropTargetWidth.value,
  (width) => {
    if (cropRatio.value === "free") return;
    const [widthPart, heightPart] = cropRatio.value.split(":").map(Number);
    if (widthPart && heightPart) {
      cropTargetHeight.value = Math.max(
        1,
        Math.round(width / (widthPart / heightPart)),
      );
    }
  },
);

watch(
  theme,
  (value) => {
    document.documentElement.dataset.theme = value;
  },
  { immediate: true },
);

watch([background, customBackground], () => {
  window.clearTimeout(recolorTimer);
  recolorTimer = window.setTimeout(() => {
    void refreshIdPhotoBackground();
  }, 120);
});

onBeforeUnmount(() => {
  endCropDrag();
  window.clearTimeout(recolorTimer);
  [
    idSourceUrl.value,
    removedUrl.value,
    idResultUrl.value,
    printResultUrl.value,
    cropPreviewUrl.value,
    ...originalCompressionUrls.value,
    ...compressionResults.value.map((item) => item.previewUrl),
  ].forEach(revokeUrl);
});
</script>

<template>
  <div class="toolbox-view app-shell" :data-theme="theme">
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="selectTool('id-photo')">
        <span class="brand-mark">C</span>
        <span>
          <strong>创图工具箱</strong>
          <small>IMAGE STUDIO</small>
        </span>
      </a>

      <button class="agent-back" type="button" @click="openAgent">
        <span>←</span>
        返回 AI Agent 工作台
      </button>

      <div class="privacy-pill">
        <span></span>
        无需登录 · 图片本地处理
      </div>

      <nav class="tool-nav" aria-label="图片与文档工具">
        <p>在线工具</p>
        <button
          v-for="tool in tools"
          :key="tool.key"
          type="button"
          :class="{ active: activeTool === tool.key }"
          @click="selectTool(tool.key)"
        >
          <span class="nav-badge">{{ tool.badge }}</span>
          <span>
            <strong>{{ tool.name }}</strong>
            <small>{{ tool.description }}</small>
          </span>
          <i>›</i>
        </button>
      </nav>

      <div class="sidebar-note">
        <span>隐私承诺</span>
        <p>图片裁剪与压缩均在浏览器端完成，不上传服务器。</p>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div class="mobile-brand">
          <button type="button" aria-label="返回 AI Agent" @click="openAgent">
            ←
          </button>
          <span class="brand-mark">C</span>
          <strong>创图工具箱</strong>
        </div>
        <div class="topbar-copy">
          <span>免费在线图片处理平台</span>
          <strong>打开即用，用完即走</strong>
        </div>
        <div class="topbar-actions">
          <span class="local-badge">浏览器本地计算</span>
          <button
            class="theme-button"
            type="button"
            :aria-label="theme === 'dark' ? '切换浅色' : '切换深色'"
            @click="toggleTheme"
          >
            {{ theme === "dark" ? "☀" : "☾" }}
          </button>
        </div>
      </header>

      <div class="mobile-tools">
        <button
          v-for="tool in tools"
          :key="tool.key"
          type="button"
          :class="{ active: activeTool === tool.key }"
          @click="selectTool(tool.key)"
        >
          {{ tool.name }}
        </button>
      </div>

      <section v-if="activeTool === 'id-photo'" class="tool-page">
        <div class="hero">
          <div>
            <span class="hero-kicker">AI ID PHOTO</span>
            <h1>智能证件照生成</h1>
            <p>
              发丝级 AI 抠图、标准规格裁剪、底色替换与文件大小校验，一次完成。
            </p>
          </div>
          <div class="hero-stats">
            <div><strong>7</strong><span>常用规格</span></div>
            <div><strong>AI</strong><span>发丝级边缘</span></div>
            <div><strong>0</strong><span>水印与登录</span></div>
          </div>
        </div>

        <div class="workflow-grid">
          <section class="panel upload-panel">
            <div class="panel-heading">
              <div><span>01</span><h2>上传与智能抠图</h2></div>
              <small>JPG / PNG / WebP</small>
            </div>
            <label v-if="!idSourceUrl" class="dropzone">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                @change="handleIdUpload"
              />
              <span class="upload-icon">↑</span>
              <strong>点击上传正面人像照片</strong>
              <small>建议光线均匀、面部无遮挡，单张不超过 20MB</small>
            </label>
            <div v-else class="portrait-stage">
              <div class="portrait-card">
                <img :src="removedUrl || idSourceUrl" alt="待处理人像预览" />
                <span>{{ removedUrl ? "透明背景" : "原始照片" }}</span>
              </div>
              <label class="replace-file">
                更换照片
                <input type="file" accept="image/*" @change="handleIdUpload" />
              </label>
            </div>
            <div class="ai-action">
              <div>
                <strong>{{ idStage }}</strong>
                <small>模型仅在浏览器中运行，首次加载后可复用缓存</small>
              </div>
              <el-button
                type="primary"
                :loading="idBusy"
                @click="runBackgroundRemoval"
              >
                AI 智能抠图
              </el-button>
            </div>
            <div v-if="idBusy || idProgress" class="progress-track">
              <span :style="{ width: `${Math.max(4, idProgress)}%` }"></span>
            </div>
          </section>

          <section class="panel settings-panel">
            <div class="panel-heading">
              <div><span>02</span><h2>规格与背景</h2></div>
              <small>自动合规构图</small>
            </div>
            <label class="field-label">证件照规格</label>
            <div class="spec-grid">
              <button
                v-for="spec in photoSpecs"
                :key="spec.id"
                type="button"
                :class="{ active: selectedSpecId === spec.id }"
                @click="selectedSpecId = spec.id"
              >
                <strong>{{ spec.name }}</strong>
                <small>{{ spec.width }} × {{ spec.height }}</small>
                <span>{{ spec.minKb }}–{{ spec.maxKb }}KB</span>
              </button>
            </div>

            <label class="field-label">标准背景</label>
            <div class="color-options">
              <button
                v-for="color in [
                  { value: '#ffffff', name: '白底' },
                  { value: '#438edb', name: '蓝底' },
                  { value: '#d93645', name: '红底' },
                  { value: 'gradient', name: '蓝白渐变' },
                ]"
                :key="color.value"
                type="button"
                :class="{ active: background === color.value }"
                @click="background = color.value"
              >
                <span
                  :class="{ gradient: color.value === 'gradient' }"
                  :style="
                    color.value !== 'gradient'
                      ? { background: color.value }
                      : undefined
                  "
                ></span>
                {{ color.name }}
              </button>
              <button
                type="button"
                :class="{ active: background === 'custom' }"
                @click="background = 'custom'"
              >
                <input
                  v-model="customBackground"
                  type="color"
                  aria-label="自定义底色"
                />
                自定义
              </button>
            </div>

            <el-button
              class="primary-wide"
              type="primary"
              :loading="idBusy"
              @click="generateIdPhoto"
            >
              生成合规证件照
            </el-button>
          </section>
        </div>

        <section
          v-if="idResultUrl && selectedSpec"
          class="result-panel"
        >
          <div class="result-preview">
            <img :src="idResultUrl" alt="证件照处理结果" />
          </div>
          <div class="result-copy">
            <span class="success-label">处理完成</span>
            <h2>{{ selectedSpec.name }}高清证件照</h2>
            <div class="result-data">
              <div>
                <span>像素尺寸</span>
                <strong>{{ selectedSpec.width }} × {{ selectedSpec.height }}</strong>
              </div>
              <div>
                <span>文件大小</span>
                <strong>{{ idResult ? displayBytes(idResult.size) : "—" }}</strong>
              </div>
              <div>
                <span>大小校验</span>
                <strong :class="{ valid: idResultValid }">
                  {{ idResultValid ? "符合要求" : "建议复核" }}
                </strong>
              </div>
            </div>
            <p>已按证件照比例居中裁剪并保持高清画质，无水印导出。</p>
            <el-button type="primary" @click="exportIdPhoto">
              免费下载高清照片
            </el-button>
          </div>
        </section>

        <section
          v-if="idResultUrl && selectedSpec && selectedPrintLayout"
          class="panel print-panel"
        >
          <div class="panel-heading">
            <div><span>04</span><h2>证件照打印排版</h2></div>
            <small>300 DPI · 带裁切参考线</small>
          </div>
          <div class="print-layout">
            <div class="print-settings">
              <label class="field-label">选择相纸格式</label>
              <div class="print-presets">
                <button
                  v-for="layout in printLayoutPresets"
                  :key="layout.id"
                  type="button"
                  :class="{ active: selectedPrintLayoutId === layout.id }"
                  @click="selectedPrintLayoutId = layout.id"
                >
                  <strong>{{ layout.name }}</strong>
                  <small>
                    {{ layout.millimeterWidth }} ×
                    {{ layout.millimeterHeight }} mm
                  </small>
                  <span>{{ layout.width }} × {{ layout.height }} px</span>
                </button>
              </div>
              <p class="print-description">
                按证件照原始像素等比例平铺，保留安全间距与裁切参考线，可直接交由照相馆或家用照片打印机输出。
              </p>
              <div class="print-actions">
                <el-button
                  type="primary"
                  :loading="idBusy"
                  @click="generatePrintLayout"
                >
                  生成打印排版
                </el-button>
                <el-button
                  v-if="printResult"
                  @click="exportPrintLayout"
                >
                  下载打印版 JPG
                </el-button>
              </div>
            </div>
            <div class="print-preview">
              <img
                v-if="printResultUrl"
                :src="printResultUrl"
                alt="证件照打印排版预览"
              />
              <div v-else class="print-placeholder">
                <span>▦</span>
                <strong>{{ selectedPrintLayout.name }}</strong>
                <small>点击生成后预览排版效果</small>
              </div>
              <div v-if="printResult" class="print-meta">
                <span>{{ printResult.columns }} 列 × {{ printResult.rows }} 行</span>
                <strong>共 {{ printResult.count }} 张</strong>
              </div>
            </div>
          </div>
        </section>
      </section>

      <section v-else-if="activeTool === 'crop'" class="tool-page">
        <div class="hero compact-hero">
          <div>
            <span class="hero-kicker">LOCAL CROP</span>
            <h1>图片裁剪与尺寸修改</h1>
            <p>拖动裁剪框自由取景，支持固定比例、精准像素和多图批量处理。</p>
          </div>
          <div class="privacy-card">
            <strong>100% 本地处理</strong><span>原图不会离开浏览器</span>
          </div>
        </div>

        <div class="crop-layout">
          <section class="panel crop-workspace">
            <div class="panel-heading">
              <div><span>01</span><h2>调整裁剪区域</h2></div>
              <small>{{ cropStatus }}</small>
            </div>
            <label v-if="!cropPreviewUrl" class="dropzone large">
              <input
                type="file"
                accept="image/*"
                multiple
                @change="handleCropUpload"
              />
              <span class="upload-icon">＋</span>
              <strong>上传一张或多张图片</strong>
              <small>批量图片将使用同一裁剪比例与目标尺寸</small>
            </label>
            <div
              v-else
              ref="cropViewportRef"
              class="crop-viewport"
              :style="{ aspectRatio: `${cropImageWidth} / ${cropImageHeight}` }"
            >
              <img
                :src="cropPreviewUrl"
                alt="裁剪预览"
                @load="handleCropImageLoad"
              />
              <div
                class="crop-frame"
                :style="{
                  left: `${cropFrame.x * 100}%`,
                  top: `${cropFrame.y * 100}%`,
                  width: `${cropFrame.width * 100}%`,
                  height: `${cropFrame.height * 100}%`,
                }"
                @pointerdown="beginCropDrag($event, 'move')"
              >
                <i class="grid-line vertical one"></i>
                <i class="grid-line vertical two"></i>
                <i class="grid-line horizontal one"></i>
                <i class="grid-line horizontal two"></i>
                <button
                  class="resize-handle"
                  type="button"
                  aria-label="调整裁剪框大小"
                  @pointerdown.stop="beginCropDrag($event, 'resize')"
                ></button>
              </div>
            </div>
            <label v-if="cropPreviewUrl" class="replace-file centered">
              更换或追加图片
              <input
                type="file"
                accept="image/*"
                multiple
                @change="handleCropUpload"
              />
            </label>
          </section>

          <aside class="panel crop-controls">
            <div class="panel-heading">
              <div><span>02</span><h2>输出设置</h2></div>
            </div>
            <label class="field-label">裁剪比例</label>
            <div class="ratio-grid">
              <button
                v-for="ratio in ['free', '1:1', '16:9', '3:4', '4:3']"
                :key="ratio"
                type="button"
                :class="{ active: cropRatio === ratio }"
                @click="applyCropRatio(ratio)"
              >
                {{ ratio === "free" ? "自由" : ratio }}
              </button>
            </div>
            <label class="field-label">目标像素</label>
            <div class="pixel-inputs">
              <label>
                <span>宽度 px</span>
                <input
                  v-model.number="cropTargetWidth"
                  type="number"
                  min="1"
                />
              </label>
              <b>×</b>
              <label>
                <span>高度 px</span>
                <input
                  v-model.number="cropTargetHeight"
                  type="number"
                  min="1"
                />
              </label>
            </div>
            <div class="info-list">
              <div>
                <span>已选图片</span><strong>{{ cropFiles.length }} 张</strong>
              </div>
              <div>
                <span>源图尺寸</span>
                <strong>{{ cropImageWidth }} × {{ cropImageHeight }}</strong>
              </div>
              <div><span>输出格式</span><strong>高清 JPG</strong></div>
            </div>
            <el-button
              class="primary-wide"
              type="primary"
              :loading="cropBusy"
              @click="exportCrops"
            >
              {{
                cropFiles.length > 1
                  ? `批量裁剪并下载 ${cropFiles.length} 张`
                  : "裁剪并下载"
              }}
            </el-button>
            <p class="privacy-tip">浏览器端 Canvas 处理，不上传服务器</p>
          </aside>
        </div>
      </section>

      <section v-else-if="activeTool === 'compress'" class="tool-page">
        <div class="hero compact-hero">
          <div>
            <span class="hero-kicker">SMART COMPRESS</span>
            <h1>智能图片压缩</h1>
            <p>
              支持 JPG、PNG、GIF、WebP 与 SVG，批量压缩并实时比较画质和体积。
            </p>
          </div>
          <div class="hero-stats">
            <div><strong>60</strong><span>单次最多</span></div>
            <div><strong>100MB</strong><span>单张上限</span></div>
          </div>
        </div>

        <div class="compress-layout">
          <section class="panel compress-config">
            <div class="panel-heading">
              <div><span>01</span><h2>上传与压缩模式</h2></div>
            </div>
            <label class="dropzone">
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.webp,.svg,image/*"
                multiple
                @change="handleCompressionUpload"
              />
              <span class="upload-icon">⇣</span>
              <strong>
                {{
                  compressionFiles.length
                    ? `已选择 ${compressionFiles.length} 张图片`
                    : "拖拽或点击批量上传"
                }}
              </strong>
              <small>最多 60 张，单张最大 100MB</small>
            </label>
            <div class="mode-cards">
              <button
                type="button"
                :class="{ active: compressionMode === 'smart' }"
                @click="compressionMode = 'smart'"
              >
                <span>推荐</span><strong>智能 / 视觉无损</strong>
                <small>自动平衡清晰度与文件体积</small>
              </button>
              <button
                type="button"
                :class="{ active: compressionMode === 'target' }"
                @click="compressionMode = 'target'"
              >
                <strong>指定文件大小</strong>
                <small>自动搜索最佳压缩质量</small>
              </button>
            </div>
            <label
              v-if="compressionMode === 'target'"
              class="target-size"
            >
              <span>目标大小不超过</span>
              <input
                v-model.number="compressionTargetKb"
                type="number"
                min="1"
              />
              <b>KB</b>
            </label>
            <el-button
              class="primary-wide"
              type="primary"
              :loading="compressionBusy"
              @click="runCompression"
            >
              开始智能压缩
            </el-button>
          </section>

          <section class="panel compare-panel">
            <div class="panel-heading">
              <div><span>02</span><h2>实时画质对比</h2></div>
              <small v-if="selectedCompression">
                节省 {{ selectedCompression.savedPercent }}%
              </small>
            </div>
            <div
              v-if="selectedCompression && selectedCompressionOriginalUrl"
              class="image-compare"
            >
              <img :src="selectedCompressionOriginalUrl" alt="压缩前" />
              <div
                class="after-image"
                :style="{ width: `${comparePercent}%` }"
              >
                <img :src="selectedCompression.previewUrl" alt="压缩后" />
              </div>
              <span class="before-label">原图</span>
              <span class="after-label">压缩后</span>
              <i :style="{ left: `${comparePercent}%` }"></i>
              <input
                v-model.number="comparePercent"
                type="range"
                min="5"
                max="95"
                aria-label="压缩前后对比"
              />
            </div>
            <div v-else class="empty-preview">
              <span>◐</span>
              <strong>压缩后在这里对比画质</strong>
              <small>拖动滑块检查细节变化</small>
            </div>
            <div v-if="selectedCompression" class="size-comparison">
              <div>
                <span>压缩前</span>
                <strong>
                  {{ displayBytes(selectedCompression.originalBytes) }}
                </strong>
              </div>
              <div class="saving">
                <span>减少</span>
                <strong>{{ selectedCompression.savedPercent }}%</strong>
              </div>
              <div>
                <span>压缩后</span>
                <strong>{{ displayBytes(selectedCompression.blob.size) }}</strong>
              </div>
            </div>
          </section>
        </div>

        <section
          v-if="compressionResults.length"
          class="panel result-list"
        >
          <div class="panel-heading">
            <div><span>03</span><h2>压缩结果</h2></div>
            <el-button type="primary" @click="exportAllCompressed">
              全部下载
            </el-button>
          </div>
          <button
            v-for="(result, index) in compressionResults"
            :key="result.fileName"
            class="compression-row"
            :class="{ active: selectedCompressionIndex === index }"
            type="button"
            @click="selectedCompressionIndex = index"
          >
            <img :src="result.previewUrl" alt="" />
            <span>
              <strong>{{ result.fileName }}</strong>
              <small>{{ result.note }}</small>
            </span>
            <span class="row-size">
              {{ displayBytes(result.originalBytes) }} →
              {{ displayBytes(result.blob.size) }}
            </span>
            <b>-{{ result.savedPercent }}%</b>
            <i @click.stop="exportCompressed(result)">下载</i>
          </button>
        </section>
      </section>

      <section v-else class="tool-page">
        <div class="hero compact-hero">
          <div>
            <span class="hero-kicker">DOCX TO PPTX</span>
            <h1>Word 转 PPT</h1>
            <p>
              识别 Word 标题层级、正文、图片与表格内容，自动分页生成演示文稿。
            </p>
          </div>
          <div class="privacy-card">
            <strong>无需登录</strong><span>单文件最大 50MB</span>
          </div>
        </div>

        <div class="word-layout">
          <section class="panel word-upload">
            <div class="panel-heading">
              <div><span>01</span><h2>上传 Word 文档</h2></div>
              <small>.docx / .doc</small>
            </div>
            <label class="dropzone large document-drop">
              <input
                type="file"
                accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                @change="handleWordUpload"
              />
              <span class="document-icon">W</span>
              <strong>{{ wordFile?.name || "选择 Word 文档" }}</strong>
              <small>
                {{
                  wordFile
                    ? displayBytes(wordFile.size)
                    : "复杂文档转换可能需要等待，请勿关闭页面"
                }}
              </small>
            </label>
            <div class="conversion-steps">
              <div class="active">
                <span>1</span><strong>解析文档</strong>
                <small>标题、正文与图片</small>
              </div>
              <i></i>
              <div :class="{ active: wordConversion }">
                <span>2</span><strong>智能分页</strong>
                <small>按 H1 / H2 划分</small>
              </div>
              <i></i>
              <div :class="{ active: wordConversion }">
                <span>3</span><strong>生成 PPT</strong>
                <small>16:9 宽屏样式</small>
              </div>
            </div>
            <el-button
              class="primary-wide"
              type="primary"
              :loading="wordBusy"
              @click="convertWord"
            >
              一键转换并预览
            </el-button>
            <p class="format-note">
              为保证高保真，旧版 .doc 请先在 Word 中另存为 .docx。
            </p>
          </section>

          <section class="panel ppt-preview">
            <div class="panel-heading">
              <div><span>02</span><h2>幻灯片预览</h2></div>
              <small v-if="wordConversion">
                {{ wordConversion.slides.length }} 页
              </small>
            </div>
            <div v-if="selectedSlide" class="slide-canvas">
              <span class="slide-accent"></span>
              <h3>{{ selectedSlide.title }}</h3>
              <div class="slide-body">
                <ul>
                  <li
                    v-for="bullet in selectedSlide.bullets"
                    :key="bullet"
                  >
                    {{ bullet }}
                  </li>
                </ul>
                <img
                  v-if="selectedSlide.image"
                  :src="selectedSlide.image"
                  alt="文档内图片"
                />
              </div>
              <small>
                {{ selectedSlideIndex + 1 }} /
                {{ wordConversion?.slides.length }}
              </small>
            </div>
            <div v-else class="empty-preview slide-empty">
              <span>▤</span>
              <strong>转换后可逐页在线预览</strong>
              <small>尽可能保留标题层级、文本、图片与表格信息</small>
            </div>
            <div v-if="wordConversion" class="slide-thumbnails">
              <button
                v-for="(slide, index) in wordConversion.slides"
                :key="`${index}-${slide.title}`"
                type="button"
                :class="{ active: selectedSlideIndex === index }"
                @click="selectedSlideIndex = index"
              >
                <span>{{ index + 1 }}</span>
                <strong>{{ slide.title }}</strong>
              </button>
            </div>
            <el-button
              v-if="wordConversion"
              class="primary-wide"
              type="primary"
              :loading="wordBusy"
              @click="downloadPresentation"
            >
              下载 .pptx 演示文稿
            </el-button>
          </section>
        </div>
      </section>

      <footer class="site-footer">
        <div>
          <strong class="footer-brand">创图工具箱</strong>
          <span class="footer-keywords">
            在线证件照制作 · 免费图片压缩 · Word 转 PPT · 图片裁剪工具
          </span>
        </div>
        <p class="footer-privacy">
          隐私声明：图片处理均在本地完成；如使用在线转换服务，文件处理后会定期自动删除，绝不泄露用户隐私。
        </p>
      </footer>
    </main>
  </div>
</template>

<style scoped src="./toolbox.css"></style>
