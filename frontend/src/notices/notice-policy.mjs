function localeCopy(value, locale = "zh-CN") {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (locale === "en") return String(value.en || value["zh-CN"] || value.zh || "");
  return String(value["zh-CN"] || value.zh || value.en || "");
}

export function localizeNotice(notice, locale = "zh-CN") {
  if (!notice) return null;
  return {
    ...notice,
    titleText: localeCopy(notice.title, locale).trim(),
    bodyText: localeCopy(notice.body, locale).trim(),
    ctaLabelText: localeCopy(notice.ctaLabel, locale).trim(),
  };
}

export function pickNoticeToShow(notices, { acked = {}, snoozed = {}, audience = "all", now = Date.now() } = {}) {
  const list = Array.isArray(notices) ? notices : [];
  const eligible = list.filter((notice) => {
    if (!notice?.id || notice.enabled === false) return false;
    if (notice.audience && notice.audience !== "all" && notice.audience !== audience) return false;
    if (notice.startsAt && Date.parse(notice.startsAt) > now) return false;
    if (notice.endsAt && Date.parse(notice.endsAt) <= now) return false;
    if (acked[notice.id]) return false;
    if (notice.kind !== "forced" && snoozed[notice.id]) return false;
    return true;
  });
  eligible.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "forced" ? -1 : 1;
    return (Number(right.priority) || 0) - (Number(left.priority) || 0);
  });
  return eligible[0] || null;
}
