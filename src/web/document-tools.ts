export interface DocumentSlide {
  bullets: string[];
  image?: string;
  title: string;
}

export interface WordConversion {
  messages: string[];
  slides: DocumentSlide[];
  sourceName: string;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function flushSlide(
  slides: DocumentSlide[],
  title: string,
  bullets: string[],
  image?: string,
): void {
  if (!title && bullets.length === 0 && !image) return;
  slides.push({
    title: title || `第 ${slides.length + 1} 页`,
    bullets: bullets.filter(Boolean).slice(0, 10),
    ...(image ? { image } : {}),
  });
}

export async function parseWordDocument(file: File): Promise<WordConversion> {
  if (file.name.toLowerCase().endsWith(".doc")) {
    throw new Error("旧版 .doc 请先在 Word 中另存为 .docx，再进行高保真转换");
  }

  const mammoth = await import("mammoth/mammoth.browser");
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
      ],
    },
  );
  const documentNode = new DOMParser().parseFromString(
    result.value,
    "text/html",
  );
  const slides: DocumentSlide[] = [];
  let title = file.name.replace(/\.docx$/iu, "");
  let bullets: string[] = [];
  let image: string | undefined;

  for (const element of documentNode.body.children) {
    const tagName = element.tagName.toLowerCase();
    const text = cleanText(element.textContent);
    if (tagName === "h1" || tagName === "h2") {
      flushSlide(slides, title, bullets, image);
      title = text || `第 ${slides.length + 1} 页`;
      bullets = [];
      image = undefined;
      continue;
    }
    const nestedImage = element.querySelector("img");
    const source = nestedImage?.getAttribute("src");
    if (source?.startsWith("data:image/") && !image) image = source;
    if (tagName === "table") {
      for (const row of element.querySelectorAll("tr")) {
        const cells = [...row.querySelectorAll("th,td")]
          .map((cell) => cleanText(cell.textContent))
          .filter(Boolean);
        if (cells.length) bullets.push(cells.join(" ｜ "));
      }
    } else if (text) {
      bullets.push(text);
    }
    if (bullets.length >= 8) {
      flushSlide(slides, title, bullets, image);
      title = `${title}（续）`;
      bullets = [];
      image = undefined;
    }
  }
  flushSlide(slides, title, bullets, image);

  return {
    messages: result.messages.map((message) => message.message),
    slides: slides.length
      ? slides
      : [{ title, bullets: ["文档中没有可提取的正文内容"] }],
    sourceName: file.name,
  };
}

export async function exportPresentation(
  conversion: WordConversion,
): Promise<void> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "CS 凡在线工具箱";
  pptx.company = "CS 凡";
  pptx.subject = "Word 转 PPT";
  pptx.title = conversion.sourceName;
  pptx.theme = {
    headFontFace: "Microsoft YaHei",
    bodyFontFace: "Microsoft YaHei",
  };

  for (const [index, item] of conversion.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: "F6F8FC" };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.16,
      h: 7.5,
      fill: { color: "5B63F6" },
      line: { color: "5B63F6" },
    });
    slide.addText(item.title, {
      x: 0.75,
      y: 0.62,
      w: item.image ? 7.3 : 11.8,
      h: 0.65,
      fontFace: "Microsoft YaHei",
      fontSize: 25,
      bold: true,
      color: "151A2D",
      margin: 0,
      breakLine: false,
    });
    const bulletText = item.bullets.map((text) => ({
      text,
      options: {
        bullet: { indent: 18 },
        breakLine: true,
        hanging: 4,
      },
    }));
    if (bulletText.length) {
      slide.addText(bulletText, {
        x: 0.9,
        y: 1.6,
        w: item.image ? 7 : 11.4,
        h: 4.9,
        fontFace: "Microsoft YaHei",
        fontSize: 16,
        color: "384057",
        breakLine: false,
        valign: "top",
        paraSpaceAfter: 12,
        margin: 0.04,
      });
    }
    if (item.image) {
      slide.addImage({
        data: item.image,
        x: 8.3,
        y: 1.55,
        w: 4.2,
        h: 4.8,
        transparency: 0,
      });
    }
    slide.addText(`${index + 1} / ${conversion.slides.length}`, {
      x: 11.45,
      y: 7.05,
      w: 1.1,
      h: 0.2,
      fontSize: 9,
      color: "8A92A8",
      align: "right",
      margin: 0,
    });
  }

  const fileName = conversion.sourceName.replace(/\.(doc|docx)$/iu, "");
  await pptx.writeFile({ fileName: `${fileName}.pptx` });
}
