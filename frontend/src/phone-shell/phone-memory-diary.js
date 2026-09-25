/**
 * Phone diary — mounts the same Memory gallery + overlay reader as App mode.
 */

import { createMemoryDiaryGallery } from "../ui/memory-diary-gallery.js";
import { createDiaryBook } from "../ui/diary-book.js";
import { togetherDaysFromAnniversary } from "../calendar/anniversaries.js";
import { getDiarySettings } from "../settings/preferences.js";
import { applyI18n } from "../i18n/index.js";
import { refreshIcons } from "../lib/icons.js";

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
    }));
}

function dispatchDiaryRequest(type, detail = {}) {
  document.dispatchEvent(new CustomEvent(type, { detail }));
}

export function mountPhoneMemoryDiary(screenRoot, {
  getDiaries,
  getAnniversaryDate,
} = {}) {
  if (!screenRoot) {
    return {
      open() {},
      openToDiaryId() {},
      openCompose() {},
      refresh() {},
      destroy() {},
    };
  }

  const galleryRoot = screenRoot.querySelector("[data-phone-memory-gallery]");
  const readerRoot = galleryRoot?.querySelector("[data-diary-book]");
  if (!galleryRoot || !readerRoot) {
    return {
      open() {},
      openToDiaryId() {},
      openCompose() {},
      refresh() {},
      destroy() {},
    };
  }

  const book = createDiaryBook(readerRoot, {
    async onPin(id) {
      dispatchDiaryRequest("yueqi:diary-pin-request", { id });
    },
    onEdit(record) {
      dispatchDiaryRequest("yueqi:diary-edit-request", { record });
    },
    async onDelete(id) {
      dispatchDiaryRequest("yueqi:diary-delete-request", { id });
    },
    onOpen: () => {
      try {
        refreshIcons();
      } catch {
        /* optional */
      }
    },
  });

  const gallery = createMemoryDiaryGallery(galleryRoot, {
    onOpenDiary(id) {
      book.openToDiaryId(id);
    },
    getDefaultStyleId: () => getDiarySettings().style || "literary",
    async onGenerateDiary(day, sourceButton, options = {}) {
      dispatchDiaryRequest("yueqi:diary-generate-request", {
        diaryDay: day,
        sourceButton,
        styleId: options.styleId,
        withImage: Boolean(options.withImage),
      });
    },
    onOpenCharacter() {
      /* character tab lives in App UI */
    },
    onSearch() {
      /* gallery filters its own feed */
    },
  });
  let openRevision = 0;

  galleryRoot.querySelectorAll("[data-diary-generate]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      gallery.openCompose?.({ sourceButton: button });
    });
  });

  async function refresh({ focusDay } = {}) {
    const records = normalizeDiaryRecords(await Promise.resolve(getDiaries?.() || []));
    const togetherDays = togetherDaysFromAnniversary(getAnniversaryDate?.() || "") ?? 1;
    gallery.render(records, { togetherDays, focusDay });
    book.render(records);
    try {
      applyI18n(galleryRoot);
    } catch {
      /* ignore */
    }
    try {
      refreshIcons();
    } catch {
      /* ignore */
    }
  }

  const onDiaryChanged = (event) => {
    const detail = event.detail || {};
    void refresh({ focusDay: detail.diaryDay }).then(() => {
      if (detail.action === "saved" && detail.id) book.openToDiaryId(String(detail.id));
    });
  };
  document.addEventListener("yueqi:diary-changed", onDiaryChanged);

  return {
    async open() {
      const revision = ++openRevision;
      await refresh();
      if (revision !== openRevision) return;
      book.close?.();
    },
    async openToDiaryId(diaryId) {
      const revision = ++openRevision;
      await refresh();
      if (revision !== openRevision) return false;
      const id = String(diaryId || "").trim();
      if (!id) return false;
      const opened = book.openToDiaryId(id);
      if (!opened) book.close?.();
      return opened;
    },
    openCompose() {
      gallery.openCompose?.();
    },
    refresh,
    destroy() {
      openRevision += 1;
      document.removeEventListener("yueqi:diary-changed", onDiaryChanged);
      book.destroy?.();
      book.close?.();
    },
  };
}
