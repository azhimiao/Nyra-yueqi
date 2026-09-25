/**
 * Reader document model + migration.
 * Keep body format versioned so App / 小手机 / future EPUB spine share one pipeline.
 */

import { splitBookParagraphs } from "./books.js";

export const READER_DOC_VERSION = 1;

/**
 * @typedef {{
 *   id: string,
 *   text: string,
 *   kind: "body" | "heading" | "toc" | "toc-item",
 * }} ReaderParagraph
 *
 * @typedef {{
 *   version: number,
 *   paragraphs: ReaderParagraph[],
 *   sourceFormat: string,
 *   migratedFrom?: string,
 * }} ReaderDocument
 */

const HEADING_RE = /^(第?\s*\d+\s*章|[Cc]hapter\s*\d+|开篇|序章|尾声|目录|扉页|第[一二三四五六七八九十百千]+部分)/;
const TOC_LABEL_RE = /^(目录|CONTENTS|Contents|目\s*录)$/;
const TOC_ITEM_RE = /^(扉页|序章|开篇|尾声|序|跋|第[一二三四五六七八九十百千]+部分|第?\s*\d+\s*章|[Cc]hapter\s*\d+)$/;

/**
 * @param {string} text
 * @param {number} index
 * @returns {ReaderParagraph}
 */
export function makeParagraph(text, index = 0) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  let kind = "body";
  if (TOC_LABEL_RE.test(cleaned)) kind = "toc";
  else if (HEADING_RE.test(cleaned)) kind = "heading";
  return {
    id: `p${index}`,
    text: cleaned,
    kind,
  };
}

/**
 * After plain split, mark short consecutive front-matter lines as toc-items
 * so they render as a single-column list instead of justified body text.
 * @param {ReaderParagraph[]} rows
 */
function annotateTocItems(rows) {
  const out = rows.map((row) => ({ ...row }));
  let tocStart = out.findIndex((row) => row.kind === "toc" || TOC_LABEL_RE.test(row.text));
  if (tocStart < 0) {
    // Leading run of short title-like lines (目录 / 扉页 / 第一部分…)
    if (
      out.length >= 2
      && out.slice(0, Math.min(8, out.length)).every((row) => row.text.length <= 24)
      && out.some((row) => HEADING_RE.test(row.text))
    ) {
      tocStart = 0;
      if (!TOC_LABEL_RE.test(out[0].text)) {
        out.unshift({
          id: "p-toc",
          text: "目录",
          kind: "toc",
        });
        tocStart = 0;
        // re-id later
      }
    } else {
      return out.map((row, index) => ({ ...row, id: `p${index}` }));
    }
  }

  out[tocStart] = { ...out[tocStart], kind: "toc" };
  for (let i = tocStart + 1; i < out.length; i += 1) {
    const text = out[i].text;
    if (TOC_ITEM_RE.test(text) || HEADING_RE.test(text)) {
      out[i] = { ...out[i], kind: "toc-item" };
      continue;
    }
    break;
  }
  return out.map((row, index) => ({ ...row, id: `p${index}` }));
}

/**
 * Normalize any legacy book body into ReaderDocument v1.
 * Accepts: plain string, string[], { paragraphs }, { body }, { text }, already-v1 docs.
 * @param {unknown} input
 * @param {{ sourceFormat?: string }} [opts]
 * @returns {ReaderDocument}
 */
export function migrateReaderDocument(input, opts = {}) {
  const sourceFormat = String(opts.sourceFormat || detectSourceFormat(input) || "plain").trim() || "plain";

  if (input && typeof input === "object" && !Array.isArray(input)) {
    const bag = /** @type {Record<string, unknown>} */ (input);
    const version = Number(bag.version) || 0;
    if (version >= READER_DOC_VERSION && Array.isArray(bag.paragraphs)) {
      return {
        version: READER_DOC_VERSION,
        paragraphs: normalizeParagraphList(bag.paragraphs),
        sourceFormat: String(bag.sourceFormat || sourceFormat),
        migratedFrom: version === READER_DOC_VERSION ? undefined : `v${version}`,
      };
    }
    if (Array.isArray(bag.paragraphs)) {
      return finalize(normalizeParagraphList(bag.paragraphs), sourceFormat, "legacy-paragraphs");
    }
    if (typeof bag.body === "string" || typeof bag.text === "string") {
      const raw = String(bag.body || bag.text || "");
      return finalize(paragraphsFromPlain(raw), sourceFormat, "legacy-body");
    }
  }

  if (Array.isArray(input)) {
    return finalize(normalizeParagraphList(input), sourceFormat, "array");
  }

  if (typeof input === "string") {
    return finalize(paragraphsFromPlain(input), sourceFormat, "plain-string");
  }

  return finalize([], sourceFormat, "empty");
}

/**
 * @param {ReaderDocument} doc
 * @returns {string[]}
 */
export function paragraphsAsText(doc) {
  return (doc?.paragraphs || []).map((row) => row.text).filter(Boolean);
}

function detectSourceFormat(input) {
  if (typeof input === "string") return "plain";
  if (Array.isArray(input)) return "paragraph-array";
  if (input && typeof input === "object") {
    const format = String(/** @type {any} */ (input).format || /** @type {any} */ (input).sourceFormat || "");
    if (format) return format;
    if (/** @type {any} */ (input).version) return "reader-doc";
  }
  return "plain";
}

function paragraphsFromPlain(text) {
  return annotateTocItems(splitBookParagraphs(text).map((block, index) => makeParagraph(block, index)));
}

function normalizeParagraphList(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (typeof row === "string") {
      const p = makeParagraph(row, i);
      if (p.text) out.push(p);
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const text = String(row.text || row.content || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    let kind = "body";
    if (row.kind === "toc" || row.kind === "toc-item" || row.kind === "heading") kind = row.kind;
    else if (TOC_LABEL_RE.test(text)) kind = "toc";
    else if (HEADING_RE.test(text)) kind = "heading";
    out.push({
      id: String(row.id || `p${out.length}`),
      text,
      kind,
    });
  }
  return annotateTocItems(out);
}

function finalize(paragraphs, sourceFormat, migratedFrom) {
  return {
    version: READER_DOC_VERSION,
    paragraphs,
    sourceFormat,
    migratedFrom,
  };
}
