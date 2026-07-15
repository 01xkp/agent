function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInlineMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/gu, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/__([^_]+)__/gu, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/gu, "<em>$1</em>");
}

function renderTextBlock(value: string): string {
  const lines = escapeHtml(value).split("\n");
  const output: string[] = [];
  let listType = "";

  function closeList(): void {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = "";
  }

  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.+)$/u);
    const unorderedItem = line.match(/^\s*[-*]\s+(.+)$/u);
    const orderedItem = line.match(/^\s*\d+\.\s+(.+)$/u);
    const quote = line.match(/^&gt;\s+(.+)$/u);

    if (heading) {
      const hashes = heading[1];
      const text = heading[2];
      if (!hashes || !text) continue;
      closeList();
      const level = Math.min(hashes.length + 2, 6);
      output.push(`<h${level}>${renderInlineMarkdown(text)}</h${level}>`);
    } else if (unorderedItem) {
      const text = unorderedItem[1];
      if (!text) continue;
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        output.push("<ul>");
      }
      output.push(`<li>${renderInlineMarkdown(text)}</li>`);
    } else if (orderedItem) {
      const text = orderedItem[1];
      if (!text) continue;
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        output.push("<ol>");
      }
      output.push(`<li>${renderInlineMarkdown(text)}</li>`);
    } else if (quote) {
      const text = quote[1];
      if (!text) continue;
      closeList();
      output.push(`<blockquote>${renderInlineMarkdown(text)}</blockquote>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      output.push(`<p>${renderInlineMarkdown(line)}</p>`);
    }
  }

  closeList();
  return output.join("");
}

export function renderMarkdown(value: string): string {
  return value
    .split(/```/u)
    .map((part, index) => {
      if (index % 2 === 0) return renderTextBlock(part);
      const firstLineEnd = part.indexOf("\n");
      const language =
        firstLineEnd === -1 ? "" : part.slice(0, firstLineEnd).trim();
      const code = firstLineEnd === -1 ? part : part.slice(firstLineEnd + 1);
      return `
        <div class="code-block">
          <div class="code-header">${escapeHtml(language || "text")}</div>
          <pre><code>${escapeHtml(code)}</code></pre>
        </div>
      `;
    })
    .join("");
}
