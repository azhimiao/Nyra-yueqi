const DIARY_KINDS = new Set([
  "diary",
  "diary-artifact",
  "diary_activity",
]);

function clean(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

export function isDiaryMessageMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") return false;
  return [
    metadata.activityType,
    metadata.artifactType,
    metadata.domainType,
    metadata.kind,
    metadata.mediaType,
  ].some((value) => DIARY_KINDS.has(clean(value, 40)));
}

export function resolveDiaryMessageCard(metadata = {}, { locale = "zh-CN" } = {}) {
  if (!isDiaryMessageMetadata(metadata)) return null;
  const en = String(locale || "zh-CN").toLowerCase().startsWith("en");
  const diaryId = clean(metadata.diaryId || metadata.sourceId || metadata.artifactId, 120)
    .replace(/^diary:/, "");
  return {
    diaryId,
    day: clean(metadata.diaryDay || metadata.day, 32),
    title: clean(metadata.diaryTitle || metadata.title, 120) || (en ? "New diary entry" : "新的日记"),
    preview: clean(metadata.diaryPreview || metadata.previewText || metadata.preview, 280),
    deepLink: clean(metadata.deepLink, 500),
    actionLabel: clean(metadata.actionLabel, 40) || (en ? "View diary" : "查看日记"),
  };
}
