import { unzipSync } from "fflate";
import { previewFromBody } from "./books.js";

const MAX_EPUB_CHARS = 800_000;

function decodeHtmlText(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function pickHtmlFiles(entries) {
  return Object.entries(entries)
    .filter(([name, data]) => name.endsWith(".html") || name.endsWith(".xhtml") || name.endsWith(".htm"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, data]) => decodeHtmlText(new TextDecoder("utf-8").decode(data)))
    .filter(Boolean);
}

export async function importEpubBook(file) {
  if (!file) throw new Error("book_file_required");
  const buffer = new Uint8Array(await file.arrayBuffer());
  const entries = unzipSync(buffer);
  const text = pickHtmlFiles(entries).join("\n\n").slice(0, MAX_EPUB_CHARS);
  if (!text) throw new Error("epub_text_empty");
  return {
    title: file.name.replace(/\.[^.]+$/, ""),
    author: "EPUB 导入",
    progress: "已导入",
    fileId: file.name,
    format: "epub",
    body: text,
    excerpt: previewFromBody(text),
  };
}
