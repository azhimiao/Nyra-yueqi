/** Freeform AI event hint helpers. Legacy type ids are migrated into prompt text. */

export const LEGACY_TYPE_PROMPTS = {
  sync_listen: "到点了，用自然的口吻提醒对方：可以一起听歌。",
  co_read: "到点了，用自然的口吻提醒对方：可以继续共读。",
  generic: "",
};

/** Calendar add-form chip → default title + prompt (storage type stays generic). */
export function eventTemplateForChip(chip = "reminder") {
  const id = String(chip || "reminder").trim();
  if (id === "sync_listen") {
    return { title: "一起听时间", prompt: LEGACY_TYPE_PROMPTS.sync_listen, chip: id };
  }
  if (id === "co_read") {
    return { title: "共读时间", prompt: LEGACY_TYPE_PROMPTS.co_read, chip: id };
  }
  return { title: "新提醒", prompt: "", chip: "reminder" };
}

/** @deprecated categorical types are retired; kept for reading old saves */
export const EVENT_TYPES = [
  { id: "generic", label: "提醒" },
  { id: "sync_listen", label: "同步听歌" },
  { id: "co_read", label: "共读" },
];

export function eventTypeLabel(type = "generic") {
  return EVENT_TYPES.find((item) => item.id === type)?.label || "提醒";
}

export function normalizeEventType(value = "", title = "") {
  const raw = String(value || "").trim();
  if (EVENT_TYPES.some((item) => item.id === raw)) return raw;
  const byLabel = EVENT_TYPES.find((item) => item.label === raw);
  if (byLabel) return byLabel.id;
  const text = String(title || "");
  if (/同步听歌|一起听|共听|听歌/.test(text)) return "sync_listen";
  if (/共读|一起看|读书|阅读/.test(text)) return "co_read";
  return "generic";
}

export function defaultTitleForEventType() {
  return "新提醒";
}

export function eventPromptOf(event = {}) {
  const direct = String(event.prompt || "").trim();
  if (direct) return direct;
  const type = normalizeEventType(event.type, event.title);
  const legacy = LEGACY_TYPE_PROMPTS[type];
  if (legacy) return legacy;
  const title = String(event.title || "").trim();
  return title ? `今天有这件事：${title}。到点后用短消息提醒对方。` : "";
}

export function buildTypedProactiveFallback(event, status = {}) {
  const asleep = Boolean(status.asleep);
  const title = String(event.title || "提醒").trim() || "提醒";
  const prompt = eventPromptOf(event);
  if (asleep) {
    return prompt
      ? `你设的「${title}」到了，我先轻声记着。`
      : `你设定的「${title}」到了。`;
  }
  if (prompt) {
    return `「${title}」到了——${prompt.replace(/^今天有这件事：|\。到点后.*$/g, "").slice(0, 28)}`;
  }
  return `「${title}」到了，想跟你说一句。`;
}
