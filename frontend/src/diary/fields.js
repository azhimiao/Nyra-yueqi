import { DIARY_STYLES } from "./styles.js";

const STYLE_LABEL_TO_ID = Object.fromEntries(
  DIARY_STYLES.map((style) => [style.label, style.id])
);

export function inferDiaryStyleId(tags = [], fallback = "literary") {
  for (const tag of tags) {
    if (STYLE_LABEL_TO_ID[tag]) return STYLE_LABEL_TO_ID[tag];
  }
  return fallback;
}

export function resolveDiaryStyleId(record, fallback = "literary") {
  if (record?.styleId) return record.styleId;
  if (!record?.tags?.length) return fallback;
  return inferDiaryStyleId(record.tags, fallback);
}

export function diaryDayFromIso(iso) {
  if (!iso) return todayDiaryDay();
  const raw = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return todayDiaryDay(parsed);
  return raw.slice(0, 10);
}

export function todayDiaryDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Attach styleId + diaryDay for diary.memory records. */
export function withDiaryFields(record) {
  if (record.source !== "diary.memory") {
    return {
      styleId: record.styleId || "",
      diaryDay: record.diaryDay || "",
    };
  }
  const tags = Array.isArray(record.tags) ? record.tags : [];
  return {
    styleId: record.styleId || inferDiaryStyleId(tags),
    diaryDay: record.diaryDay || diaryDayFromIso(record.createdAt),
  };
}
