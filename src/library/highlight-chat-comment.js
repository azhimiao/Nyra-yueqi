/**
 * Stream the companion's highlight comment from the live chat turn.
 * Empty text = pending; fail with no model → honest "没接到模型".
 */

import { CHAT_TURN_PROGRESS_EVENT } from "../chat/turn-progress-event.js";
import { t } from "../i18n/index.js";
import { updateHighlight } from "./book-highlights.js";

let pending = null;
let bound = false;
const paints = new Set();

export function beginHighlightChatComment({
  bookId,
  highlightId,
  characterId = "",
  characterName = "",
} = {}) {
  const id = String(highlightId || "").trim();
  const book = String(bookId || "").trim();
  if (!id || !book) return;
  pending = {
    bookId: book,
    highlightId: id,
    characterId: String(characterId || "").trim(),
    characterName: String(characterName || "").trim(),
  };
  ensureBound();
}

export function watchHighlightCommentPaint(fn) {
  if (typeof fn !== "function") return () => {};
  paints.add(fn);
  ensureBound();
  return () => paints.delete(fn);
}

function ensureBound() {
  if (bound || typeof document === "undefined") return;
  bound = true;
  document.addEventListener(CHAT_TURN_PROGRESS_EVENT, onProgress);
}

function writeComment(text) {
  if (!pending) return;
  updateHighlight(pending.bookId, pending.highlightId, {
    companionComment: {
      characterId: pending.characterId,
      characterName: pending.characterName,
      text: String(text || ""),
      createdAt: Date.now(),
      sentToChat: true,
    },
  });
  paints.forEach((fn) => {
    try {
      fn();
    } catch {
      /* paint is optional */
    }
  });
}

function onProgress(event) {
  if (!pending) return;
  const detail = event?.detail || {};
  const phase = String(detail.phase || "");
  const visible = String(detail.visibleText || "").trim();
  if (phase === "fail") {
    writeComment(visible || t("chat.modelNotReached"));
    pending = null;
    return;
  }
  if (visible) writeComment(visible);
  if (phase === "done") pending = null;
}
