export interface PhotoSpec {
  id: string;
  maxKb: number;
  minKb: number;
  name: string;
  note: string;
  width: number;
  height: number;
}

export interface CropFrame {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface CompressionOptions {
  mode: "smart" | "target";
  targetKb: number;
}

export interface CompressionResult {
  blob: Blob;
  fileName: string;
  note: string;
  originalBytes: number;
  previewUrl: string;
  savedPercent: number;
}

export interface PrintLayoutPreset {
  dpi: number;
  height: number;
  id: string;
  millimeterHeight: number;
  millimeterWidth: number;
  name: string;
  width: number;
}

export interface PrintLayoutResult {
  blob: Blob;
  columns: number;
  count: number;
  rows: number;
}

export const photoSpecs: PhotoSpec[] = [
  {
    id: "one-inch",
    name: "标准一寸",
    width: 295,
    height: 413,
    minKb: 20,
    maxKb: 60,
    note: "25 × 35 mm",
  },
  {
    id: "two-inch",
    name: "标准二寸",
    width: 413,
    height: 626,
    minKb: 30,
    maxKb: 100,
    note: "35 × 53 mm",
  },
  {
    id: "large-one-inch",
    name: "大一寸",
    width: 390,
    height: 567,
    minKb: 25,
    maxKb: 100,
    note: "33 × 48 mm",
  },
  {
    id: "small-two-inch",
    name: "小二寸",
    width: 413,
    height: 531,
    minKb: 20,
    maxKb: 80,
    note: "35 × 45 mm",
  },
  {
    id: "legal-exam",
    name: "法考报名",
    width: 413,
    height: 626,
    minKb: 40,
    maxKb: 100,
    note: "宽 413 × 高 626",
  },
  {
    id: "social-security",
    name: "社保照片",
    width: 358,
    height: 441,
    minKb: 20,
    maxKb: 100,
    note: "白底免冠",
  },
  {
    id: "student-record",
    name: "学籍照片",
    width: 480,
    height: 640,
    minKb: 20,
    maxKb: 200,
    note: "3:4 竖版",
  },
];

export const printLayoutPresets: PrintLayoutPreset[] = [
  {
    id: "six-inch",
    name: "六寸相纸",
    width: 1800,
    height: 1200,
    millimeterWidth: 152,
    millimeterHeight: 102,
    dpi: 300,
  },
  {
    id: "five-inch",
    name: "五寸相纸",
    width: 1500,
    height: 1050,
    millimeterWidth: 127,
    millimeterHeight: 89,
    dpi: 300,
  },
  {
    id: "a4",
    name: "A4 相纸",
    width: 2480,
    height: 3508,
    millimeterWidth: 210,
    millimeterHeight: 297,
    dpi: 300,
  },
];

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("浏览器未能生成图片"));
        }
      },
      type,
      quality,
    );
  });
}

async function loadImage(source: Blob | File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  verticalFocus = 0.44,
): void {
  const scale = Math.max(
    targetWidth / sourceWidth,
    targetHeight / sourceHeight,
  );
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const x = (targetWidth - drawWidth) / 2;
  const overflowY = Math.max(0, drawHeight - targetHeight);
  const y = -overflowY * verticalFocus;
  context.drawImage(image, x, y, drawWidth, drawHeight);
}

export async function removePortraitBackground(
  file: File,
  onProgress: (percent: number) => void,
): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");
  return removeBackground(file, {
    progress: (_key: string, current: number, total: number) => {
      onProgress(total > 0 ? Math.round((current / total) * 100) : 0);
    },
  });
}

export async function createIdPhoto(
  portrait: Blob | File,
  spec: PhotoSpec,
  background: string,
): Promise<Blob> {
  const image = await loadImage(portrait);
  const canvas = document.createElement("canvas");
  canvas.width = spec.width;
  canvas.height = spec.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持 Canvas");

  if (background === "gradient") {
    const gradient = context.createLinearGradient(0, 0, 0, spec.height);
    gradient.addColorStop(0, "#f7fbff");
    gradient.addColorStop(1, "#6caeff");
    context.fillStyle = gradient;
  } else {
    context.fillStyle = background;
  }
  context.fillRect(0, 0, spec.width, spec.height);
  drawCover(
    context,
    image,
    image.naturalWidth,
    image.naturalHeight,
    spec.width,
    spec.height,
  );

  let best = await canvasToBlob(canvas, "image/jpeg", 0.96);
  const maxBytes = spec.maxKb * 1024;
  if (best.size <= maxBytes) return best;

  let low = 0.35;
  let high = 0.95;
  for (let index = 0; index < 8; index += 1) {
    const quality = (low + high) / 2;
    const candidate = await canvasToBlob(canvas, "image/jpeg", quality);
    if (candidate.size > maxBytes) {
      high = quality;
    } else {
      best = candidate;
      low = quality;
    }
  }
  return best;
}

export async function createIdPhotoPrintLayout(
  photo: Blob,
  spec: PhotoSpec,
  layout: PrintLayoutPreset,
): Promise<PrintLayoutResult> {
  const image = await loadImage(photo);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持 Canvas");

  const margin = Math.round(layout.dpi * 0.14);
  const gap = Math.round(layout.dpi * 0.1);
  const columns = Math.max(
    1,
    Math.floor((layout.width - margin * 2 + gap) / (spec.width + gap)),
  );
  const rows = Math.max(
    1,
    Math.floor((layout.height - margin * 2 + gap) / (spec.height + gap)),
  );
  const gridWidth = columns * spec.width + (columns - 1) * gap;
  const gridHeight = rows * spec.height + (rows - 1) * gap;
  const offsetX = Math.round((layout.width - gridWidth) / 2);
  const offsetY = Math.round((layout.height - gridHeight) / 2);

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, layout.width, layout.height);
  context.strokeStyle = "#b8bdc7";
  context.lineWidth = 1;
  context.setLineDash([6, 5]);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = offsetX + column * (spec.width + gap);
      const y = offsetY + row * (spec.height + gap);
      context.drawImage(image, x, y, spec.width, spec.height);
      context.strokeRect(x - 1, y - 1, spec.width + 2, spec.height + 2);
    }
  }

  return {
    blob: await canvasToBlob(canvas, "image/jpeg", 0.96),
    columns,
    count: columns * rows,
    rows,
  };
}

export async function cropImage(
  file: File,
  frame: CropFrame,
  targetWidth: number,
  targetHeight: number,
): Promise<Blob> {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持 Canvas");

  context.drawImage(
    image,
    Math.round(frame.x * image.naturalWidth),
    Math.round(frame.y * image.naturalHeight),
    Math.round(frame.width * image.naturalWidth),
    Math.round(frame.height * image.naturalHeight),
    0,
    0,
    targetWidth,
    targetHeight,
  );
  return canvasToBlob(canvas, "image/jpeg", 0.94);
}

async function compressRaster(
  file: File,
  options: CompressionOptions,
): Promise<{ blob: Blob; note: string }> {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持 Canvas");
  context.drawImage(image, 0, 0);

  const keepsAlpha = file.type === "image/png";
  const outputType = keepsAlpha ? "image/png" : "image/webp";
  const outputExtension = keepsAlpha ? "PNG" : "WebP";
  if (options.mode === "smart") {
    return {
      blob: await canvasToBlob(canvas, outputType, 0.82),
      note:
        file.type === "image/gif"
          ? "GIF 已提取首帧并转换为 WebP"
          : `视觉无损 ${outputExtension} 编码`,
    };
  }

  const targetBytes = Math.max(1, options.targetKb) * 1024;
  let low = 0.08;
  let high = 0.92;
  let best = await canvasToBlob(canvas, outputType, high);
  for (let index = 0; index < 9; index += 1) {
    const quality = (low + high) / 2;
    const candidate = await canvasToBlob(canvas, outputType, quality);
    if (candidate.size > targetBytes) {
      high = quality;
    } else {
      best = candidate;
      low = quality;
    }
  }

  if (best.size > targetBytes && !keepsAlpha) {
    const scale = Math.max(0.35, Math.sqrt(targetBytes / best.size) * 0.94);
    const resized = document.createElement("canvas");
    resized.width = Math.max(1, Math.round(canvas.width * scale));
    resized.height = Math.max(1, Math.round(canvas.height * scale));
    resized
      .getContext("2d")
      ?.drawImage(canvas, 0, 0, resized.width, resized.height);
    best = await canvasToBlob(resized, outputType, 0.78);
  }

  return {
    blob: best,
    note:
      best.size <= targetBytes
        ? `已控制在 ${options.targetKb}KB 内`
        : "PNG 无损编码已尽力压缩，建议改用 WebP",
  };
}

async function compressSvg(file: File): Promise<{ blob: Blob; note: string }> {
  const source = await file.text();
  const optimized = source
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/>\s+</gu, "><")
    .replace(/\s{2,}/gu, " ")
    .trim();
  return {
    blob: new Blob([optimized], { type: "image/svg+xml" }),
    note: "已移除注释、空白与冗余换行",
  };
}

export async function compressImageFile(
  file: File,
  options: CompressionOptions,
): Promise<CompressionResult> {
  const { blob, note } =
    file.type === "image/svg+xml"
      ? await compressSvg(file)
      : await compressRaster(file, options);
  const suffix =
    blob.type === "image/png"
      ? "png"
      : blob.type === "image/svg+xml"
        ? "svg"
        : "webp";
  const baseName = file.name.replace(/\.[^.]+$/u, "");
  return {
    blob,
    fileName: `${baseName}-compressed.${suffix}`,
    note,
    originalBytes: file.size,
    previewUrl: URL.createObjectURL(blob),
    savedPercent:
      file.size > 0
        ? Math.max(0, Math.round((1 - blob.size / file.size) * 100))
        : 0,
  };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
