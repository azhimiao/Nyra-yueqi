/**
 * Book highlights — first-class co-read annotations.
 * Locator is text-stable (nyra CFI dialect over flat EPUB body), never page numbers.
 */

import { readLocalObject, writeLocalObject } from "../lib/utils.js";

export const HIGHLIGHTS_STORE_KEY = "yueqi.book.highlights.v1";

/**
 * @typedef {{
 *   type: "epub_cfi",
 *   start: string,
 *   end: string,
 * }} BookLocator
 *
 * @typedef {{
 *   id: string,
 *   bookId: string,
 *   locator: BookLocator,
 *   quote: string,
 *   prefix: string,
 *   suffix: string,
 *   createdAt: number,
   *   companionComment?: {
   *     characterId: string,
   *     characterName?: string,
   *     text: string,
   *     createdAt: number,
   *     sentToChat?: boolean,
   *   },
   *   commentCollapsed?: boolean,
   * }} BookHighlight
 */

function readBag() {
  const raw = readLocalObject(HIGHLIGHTS_STORE_KEY, null);
  if (!raw || typeof raw !== "object") return { byBook: {} };
  if (!raw.byBook || typeof raw.byBook !== "object") return { byBook: {} };
  return raw;
}

function writeBag(bag) {
  writeLocalObject(HIGHLIGHTS_STORE_KEY, bag);
}

/**
 * Build a stable locator for flat-text EPUB bodies.
 * Format: nyra-cfi(/body/p{index}:{offset})
 * @param {number} startPara
 * @param {number} startOffset
 * @param {number} endPara
 * @param {number} endOffset
 * @returns {BookLocator}
 */
export function makeTextLocator(startPara, startOffset, endPara, endOffset) {
  return {
    type: "epub_cfi",
    start: `nyra-cfi(/body/p${Math.max(0, startPara)}:${Math.max(0, startOffset)})`,
    end: `nyra-cfi(/body/p${Math.max(0, endPara)}:${Math.max(0, endOffset)})`,
  };
}

/**
 * @param {string} cfi
 * @returns {{ para: number, offset: number } | null}
 */
export function parseTextLocatorPoint(cfi) {
  const m = String(cfi || "").match(/\/p(\d+):(\d+)/);
  if (!m) return null;
  return { para: Number(m[1]), offset: Number(m[2]) };
}

/**
 * Absolute character offset of (container, offset) within a paragraph element.
 * @param {Element} paraEl
 * @param {Node} container
 * @param {number} offset
 */
export function offsetWithinParagraph(paraEl, container, offset) {
  if (!paraEl || !container) return 0;
  if (container === paraEl) {
    let total = 0;
    const children = [...paraEl.childNodes];
    for (let i = 0; i < children.length && i < offset; i += 1) {
      total += String(children[i].textContent || "").length;
    }
    return total;
  }
  const walker = document.createTreeWalker(paraEl, NodeFilter.SHOW_TEXT);
  let total = 0;
  let node = walker.nextNode();
  while (node) {
    if (node === container) return total + Math.max(0, offset);
    total += String(node.textContent || "").length;
    node = walker.nextNode();
  }
  return total;
}

function plainParagraphText(paraEl) {
  return String(paraEl?.textContent || "");
}

/**
 * @param {string} bookId
 * @returns {BookHighlight[]}
 */
export function listHighlights(bookId) {
  const id = String(bookId || "").trim();
  if (!id) return [];
  const rows = readBag().byBook[id];
  return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
}

/**
 * @param {Omit<BookHighlight, "id"|"createdAt"> & { id?: string, createdAt?: number }} input
 * @returns {BookHighlight|null}
 */
export function addHighlight(input = {}) {
  const bookId = String(input.bookId || "").trim();
  const quote = String(input.quote || "").trim();
  if (!bookId || !quote) return null;
  const row = {
    id: String(input.id || `hl-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 7)}`),
    bookId,
    locator: input.locator && typeof input.locator === "object"
      ? {
        type: "epub_cfi",
        start: String(input.locator.start || ""),
        end: String(input.locator.end || ""),
      }
      : makeTextLocator(0, 0, 0, quote.length),
    quote: quote.slice(0, 2000),
    prefix: String(input.prefix || "").slice(0, 240),
    suffix: String(input.suffix || "").slice(0, 240),
    createdAt: Number(input.createdAt) || Date.now(),
    companionComment: input.companionComment || undefined,
    commentCollapsed: input.commentCollapsed === true,
  };
  const bag = readBag();
  const list = Array.isArray(bag.byBook[bookId]) ? bag.byBook[bookId] : [];
  bag.byBook[bookId] = [row, ...list].slice(0, 200);
  writeBag(bag);
  return { ...row };
}

/**
 * @param {string} bookId
 * @param {string} highlightId
 * @param {Partial<BookHighlight>} patch
 */
export function updateHighlight(bookId, highlightId, patch = {}) {
  const bid = String(bookId || "").trim();
  const hid = String(highlightId || "").trim();
  if (!bid || !hid) return null;
  const bag = readBag();
  const list = Array.isArray(bag.byBook[bid]) ? bag.byBook[bid] : [];
  let hit = null;
  bag.byBook[bid] = list.map((row) => {
    if (row.id !== hid) return row;
    hit = {
      ...row,
      ...patch,
      id: row.id,
      bookId: row.bookId,
      locator: patch.locator || row.locator,
      companionComment: patch.companionComment !== undefined
        ? patch.companionComment
        : row.companionComment,
      commentCollapsed: patch.commentCollapsed !== undefined
        ? patch.commentCollapsed === true
        : row.commentCollapsed === true,
    };
    return hit;
  });
  if (!hit) return null;
  writeBag(bag);
  return { ...hit };
}

/** Tap the highlight mark to fold / unfold the inline comment. */
export function toggleHighlightCommentFold(bookId, highlightId) {
  const hid = String(highlightId || "").trim();
  const row = listHighlights(bookId).find((item) => item.id === hid);
  if (!row?.companionComment) return null;
  return updateHighlight(bookId, hid, { commentCollapsed: row.commentCollapsed !== true });
}

/**
 * Resolve selection offsets within paragraph nodes (absolute to paragraph text).
 * @param {HTMLElement} root
 * @param {Selection} selection
 */
export function selectionToLocator(root, selection) {
  if (!root || !selection || selection.rangeCount < 1 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const quote = String(selection.toString() || "").replace(/\s+/g, " ").trim();
  if (!quote) return null;

  const paras = [...root.querySelectorAll("[data-p-index]")];
  const startP = (range.startContainer.nodeType === Node.TEXT_NODE
    ? range.startContainer.parentElement
    : range.startContainer)?.closest?.("[data-p-index]");
  const endP = (range.endContainer.nodeType === Node.TEXT_NODE
    ? range.endContainer.parentElement
    : range.endContainer)?.closest?.("[data-p-index]");
  if (!startP || !endP) return null;

  const startPara = Number(startP.dataset.pIndex);
  const endPara = Number(endP.dataset.pIndex);
  if (!Number.isFinite(startPara) || !Number.isFinite(endPara)) return null;

  const startOffset = offsetWithinParagraph(startP, range.startContainer, range.startOffset);
  const endOffset = offsetWithinParagraph(endP, range.endContainer, range.endOffset);

  const startIdx = paras.findIndex((p) => Number(p.dataset.pIndex) === startPara);
  const endIdx = paras.findIndex((p) => Number(p.dataset.pIndex) === endPara);
  const prefixPara = paras[Math.max(0, startIdx - 1)];
  const suffixPara = paras[Math.min(paras.length - 1, endIdx + 1)];

  return {
    locator: makeTextLocator(startPara, startOffset, endPara, endOffset),
    quote,
    prefix: String(prefixPara?.textContent || "").slice(-160),
    suffix: String(suffixPara?.textContent || "").slice(0, 160),
    startPara,
    endPara,
    startOffset,
    endOffset,
  };
}

/**
 * Strip previous marks/notes and restore plain paragraph text.
 * @param {HTMLElement} host
 */
export function clearHighlightPaint(host) {
  if (!host) return;
  host.querySelectorAll(".ebook-inline-note").forEach((node) => node.remove());
  host.querySelectorAll("mark.ebook-hl-mark").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    mark.remove();
    parent.normalize?.();
  });
  host.querySelectorAll(".has-highlight").forEach((node) => node.classList.remove("has-highlight"));
}

/**
 * Rebuild one paragraph with non-overlapping mark ranges.
 * @param {HTMLElement} paraEl
 * @param {{ start: number, end: number, hlId: string }[]} ranges
 */
function rebuildParagraphWithMarks(paraEl, ranges) {
  const text = plainParagraphText(paraEl);
  const sorted = (ranges || [])
    .map((row) => ({
      start: Math.max(0, Math.min(text.length, Math.floor(row.start))),
      end: Math.max(0, Math.min(text.length, Math.floor(row.end))),
      hlId: String(row.hlId || ""),
    }))
    .filter((row) => row.end > row.start && row.hlId)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const picked = [];
  let cursor = 0;
  for (const row of sorted) {
    if (row.start < cursor) continue;
    picked.push(row);
    cursor = row.end;
  }

  paraEl.textContent = "";
  let at = 0;
  for (const row of picked) {
    if (row.start > at) {
      paraEl.append(document.createTextNode(text.slice(at, row.start)));
    }
    const mark = document.createElement("mark");
    mark.className = "ebook-hl-mark";
    mark.dataset.hlId = row.hlId;
    mark.textContent = text.slice(row.start, row.end);
    paraEl.append(mark);
    at = row.end;
  }
  if (at < text.length) {
    paraEl.append(document.createTextNode(text.slice(at)));
  }
  if (!paraEl.childNodes.length) {
    paraEl.textContent = text;
  }
}

function cssEscapeId(id) {
  const value = String(id || "");
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Paint exact selected spans + WeChat-Reading-style inline companion notes.
 * @param {HTMLElement} host
 * @param {BookHighlight[]} highlights
 * @param {{
 *   escapeHtml?: (s: string) => string,
 *   thinkingLabel?: string,
 *   continueChatLabel?: string,
 * }} [opts]
 */
export function paintHighlightDecorations(host, highlights = [], opts = {}) {
  if (!host) return;
  clearHighlightPaint(host);

  const list = Array.isArray(highlights) ? highlights : [];
  /** @type {Map<number, { start: number, end: number, hlId: string }[]>} */
  const byPara = new Map();

  for (const hl of list) {
    const start = parseTextLocatorPoint(hl?.locator?.start);
    const end = parseTextLocatorPoint(hl?.locator?.end);
    if (!start || !end || !hl?.id) {
      const quote = String(hl?.quote || "").trim();
      if (!quote || !hl?.id) continue;
      const hit = [...host.querySelectorAll("[data-p-index]")].find((p) => (
        plainParagraphText(p).includes(quote)
      ));
      if (!hit) continue;
      const para = Number(hit.dataset.pIndex);
      const idx = plainParagraphText(hit).indexOf(quote);
      if (!Number.isFinite(para) || idx < 0) continue;
      const rows = byPara.get(para) || [];
      rows.push({ start: idx, end: idx + quote.length, hlId: hl.id });
      byPara.set(para, rows);
      continue;
    }

    for (let para = start.para; para <= end.para; para += 1) {
      const nodes = [...host.querySelectorAll(`[data-p-index="${para}"]`)];
      if (!nodes.length) continue;
      const textLen = plainParagraphText(nodes[0]).length;
      let rangeStart = para === start.para ? start.offset : 0;
      let rangeEnd = para === end.para ? end.offset : textLen;
      const quote = String(hl.quote || "").trim();
      // Heal legacy bad offsets: prefer locating the quote text in-paragraph.
      if (quote && start.para === end.para) {
        const full = plainParagraphText(nodes[0]);
        const sliced = full.slice(Math.max(0, rangeStart), Math.max(0, rangeEnd));
        const needle = quote.slice(0, Math.min(16, quote.length));
        if (needle && !sliced.includes(needle)) {
          const idx = full.indexOf(quote);
          if (idx >= 0) {
            rangeStart = idx;
            rangeEnd = idx + quote.length;
          }
        }
      }
      const rows = byPara.get(para) || [];
      rows.push({ start: rangeStart, end: rangeEnd, hlId: hl.id });
      byPara.set(para, rows);
    }
  }

  for (const [para, ranges] of byPara) {
    host.querySelectorAll(`[data-p-index="${para}"]`).forEach((paraEl) => {
      rebuildParagraphWithMarks(paraEl, ranges);
    });
  }

  const escape = typeof opts.escapeHtml === "function"
    ? opts.escapeHtml
    : (s) => String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const continueLabel = opts.continueChatLabel || "继续聊";

  for (const hl of list) {
    // Pure highlights have no companionComment — WeChat-style note only for TA说说.
    if (!hl?.companionComment) continue;
    const comment = hl.companionComment;
    const mark = host.querySelector(`mark.ebook-hl-mark[data-hl-id="${cssEscapeId(hl.id)}"]`);
    const anchorP = mark?.closest?.("[data-p-index]");
    if (!anchorP) continue;
    if (anchorP.parentElement?.querySelector(`.ebook-inline-note[data-hl-id="${cssEscapeId(hl.id)}"]`)) {
      continue;
    }

    const note = document.createElement("aside");
    note.className = "ebook-inline-note";
    note.dataset.hlId = hl.id;
    const collapsed = hl.commentCollapsed === true;
    if (collapsed) note.classList.add("is-collapsed");
    mark.classList.add("has-comment");
    mark.setAttribute("role", "button");
    mark.setAttribute("tabindex", "0");
    mark.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const name = String(comment?.characterName || "").trim();
    const body = String(comment?.text || "").trim();
    if (!body) {
      note.classList.add("is-pending");
      note.innerHTML = `<p class="ebook-inline-note__pending">${escape(opts.thinkingLabel || "…")}</p>`;
    } else {
      note.innerHTML = `
        <div class="ebook-inline-note__head">${escape(name || "TA")}</div>
        <p class="ebook-inline-note__text">${escape(body)}</p>
        <button type="button" class="ebook-inline-note__chat" data-ebook-note-chat="${escape(hl.id)}">${escape(continueLabel)}</button>
      `;
    }
    anchorP.after(note);
  }
}
