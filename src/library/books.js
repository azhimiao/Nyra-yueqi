import { t } from "../i18n/index.js";

const STORED_PROGRESS_LABELS = Object.freeze({
  待读: "phone.read.toRead",
  未读: "phone.read.unread",
  在读: "phone.read.reading",
  读完: "phone.read.finished",
  已导入: "phone.read.imported",
});

export function normalizeBook(book = {}) {
  return {
    id: String(book.id || ""),
    title: book.title || "未命名书籍",
    author: book.author || "未知作者",
    progress: book.progress || "待读",
    chapter: book.chapter || "",
    excerpt: book.excerpt || "",
    fileId: book.fileId || "",
    format: book.format || "",
    mediaId: book.mediaId || "",
    bundledPath: String(book.bundledPath || ""),
    builtin: Boolean(book.builtin),
    synopsis: String(book.synopsis || ""),
    scrollRatio: Math.max(0, Math.min(1, Number(book.scrollRatio) || 0)),
    pageIndex: Number.isFinite(Number(book.pageIndex)) ? Math.max(0, Math.floor(Number(book.pageIndex))) : undefined,
    pageCount: Number.isFinite(Number(book.pageCount)) ? Math.max(1, Math.floor(Number(book.pageCount))) : undefined,
    readerDocVersion: Number(book.readerDocVersion) || 0,
    updatedAt: book.updatedAt || "",
  };
}

export function booksFromState(rows = []) {
  return rows.map(normalizeBook);
}

/** Short shelf preview; full text lives in media store as `body`. */
export function previewFromBody(body = "", max = 160) {
  return String(body || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function importTextBook(file) {
  if (!file) throw new Error("book_file_required");
  const text = await file.text();
  const body = String(text || "").replace(/\r\n/g, "\n").trim();
  return {
    title: file.name.replace(/\.[^.]+$/, ""),
    author: "本地导入",
    progress: "已导入",
    fileId: file.name,
    format: file.name.split(".").pop()?.toLowerCase() || "txt",
    body,
    excerpt: previewFromBody(body),
  };
}

/** Split plain book text into readable paragraphs. */
export function splitBookParagraphs(text = "") {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];
  const blocks = raw
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n+/g, " ").trim())
    .filter(Boolean);
  if (blocks.length > 1) return blocks;
  // Single block / epub flatten: break on sentence-ish boundaries for long runs
  if (raw.length < 400) return [raw];
  const sentences = raw.split(/(?<=[。！？…!?])\s*/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1) return [raw];
  const paragraphs = [];
  let buf = "";
  for (const sentence of sentences) {
    if (buf.length + sentence.length > 180 && buf) {
      paragraphs.push(buf);
      buf = sentence;
    } else {
      buf = buf ? `${buf}${sentence}` : sentence;
    }
  }
  if (buf) paragraphs.push(buf);
  return paragraphs;
}

/** Localized progress label for stored Chinese tokens or scroll ratio. */
export function displayReadProgress(progressOrRatio) {
  if (typeof progressOrRatio === "number") return formatReadProgress(progressOrRatio);
  const raw = String(progressOrRatio || "").trim();
  if (!raw) return t("phone.read.unread");
  const key = STORED_PROGRESS_LABELS[raw];
  if (key) return t(key);
  return raw;
}

export function displayBookTitle(title) {
  const raw = String(title || "").trim();
  return !raw || raw === "未命名书籍" ? t("phone.read.unnamed") : raw;
}

export function displayBookAuthor(author) {
  const raw = String(author || "").trim();
  if (!raw || raw === "未知作者") return t("phone.read.unknownAuthor");
  if (raw === "本地导入") return t("appShell.library.localImport");
  return raw;
}

export function formatReadProgress(scrollRatio = 0) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(scrollRatio) * 100)));
  if (pct <= 0) return t("phone.read.unread");
  if (pct >= 99) return t("phone.read.finished");
  return t("phone.read.percent", { pct });
}
