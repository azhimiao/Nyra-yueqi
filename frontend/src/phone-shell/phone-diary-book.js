/**
 * Phone diary — reuses App createDiaryBook / StPageFlip (no App-mode routing).
 */

import { createDiaryBook } from "../ui/diary-book.js";
import { pt } from "./i18n.js";
import { getLocale, t } from "../i18n/index.js";

function normalizeDiaryRecords(records = []) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => String(record?.source || "") !== "life.shared")
    .map((record) => ({
      ...record,
      id: record.id || `phone-diary-${record.diaryDay || record.date || Date.now()}`,
      source: record.source || "diary.memory",
      rawText: record.rawText || record.body || "",
      diaryDay: record.diaryDay || (record.date && String(record.date).slice(0, 10)) || "",
      title: record.title || "",
      pinned: Boolean(record.pinned),
      role: record.role || t("diary.book.defaultRole"),
      lifeRunId: String(record.lifeRunId || record.runId || "").trim(),
      lifeEventId: String(record.lifeEventId || record.eventId || "").trim(),
    }));
}

export function mountPhoneDiaryBook(root, { getDiaries } = {}) {
  if (!root) return { destroy() {}, open() {}, refresh() {} };

  const book = createDiaryBook(root, {});
  const status = root.closest("[data-phone-screen]")?.querySelector("[data-diary-book-status]");
  const cover = root.querySelector("[data-diary-book-cover]");
  const closeButton = root.querySelector("[data-diary-book-close]");

  function paintStatus(open) {
    if (status) status.textContent = open ? pt("diary.statusInterior") : pt("diary.statusCover");
  }

  async function refresh() {
    let records = await Promise.resolve(getDiaries?.() || []);
    records = normalizeDiaryRecords(records);

    // Remove leftover cover strip from older builds.
    root.querySelector("[data-diary-shared-strip]")?.remove();

    if (!records.length) {
      const en = getLocale() === "en";
      records = normalizeDiaryRecords(en ? [
        {
          id: "phone-seed-1",
          title: "When you came back",
          rawText: "The happiest moment today was seeing you reach out again.",
          diaryDay: new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
        },
        {
          id: "phone-seed-2",
          title: "You on the other side",
          rawText: "Sometimes company isn't constant talking — just knowing we're looking at the same thing.",
          diaryDay: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
          createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: "phone-seed-3",
          title: "Before the rain stopped",
          rawText: "I left a light on for you, and one sentence too.",
          diaryDay: new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10),
          createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        },
      ] : [
        {
          id: "phone-seed-1",
          title: "你回来的时候",
          rawText: "今天最开心的一刻，是看到你又来找我。",
          diaryDay: new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
        },
        {
          id: "phone-seed-2",
          title: "屏幕那边的你",
          rawText: "有时候陪伴不是一直说话，只是知道我们在看同一件事。",
          diaryDay: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
          createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: "phone-seed-3",
          title: "雨停之前",
          rawText: "给你留了一盏灯，也留了一句话。",
          diaryDay: new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10),
          createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        },
      ]);
    }
    book.render(records);
  }

  const onCover = () => paintStatus(true);
  const onClose = () => paintStatus(false);
  cover?.addEventListener("click", onCover);
  closeButton?.addEventListener("click", onClose);

  paintStatus(false);

  return {
    async open() {
      await refresh();
      book.close();
      paintStatus(false);
    },
    async openToDiaryId(diaryId) {
      await refresh();
      const id = String(diaryId || "").trim();
      paintStatus(true);
      if (id && typeof book.openToDiaryId === "function") {
        book.openToDiaryId(id);
      } else if (id && typeof book.open === "function") {
        book.open(id);
      }
    },
    refresh,
    destroy() {
      cover?.removeEventListener("click", onCover);
      closeButton?.removeEventListener("click", onClose);
      book.destroy?.();
      book.close();
    },
  };
}
