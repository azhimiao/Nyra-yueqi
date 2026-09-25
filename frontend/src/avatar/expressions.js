/** Expression catalog + emotion → action mapping (open JSON only). */

export const DEFAULT_EXPRESSIONS = [
  { id: "neutral", name: "平静", emotion: "neutral", actionId: "idle_default" },
  { id: "soft_smile", name: "浅笑", emotion: "warm", actionId: "talking_default" },
  { id: "shy", name: "害羞", emotion: "shy", actionId: "react_tap" },
  { id: "comfort_look", name: "安慰", emotion: "warm", actionId: "comfort" },
];

export function normalizeExpression(raw = {}) {
  const id = String(raw.id || "").trim();
  if (!id) return null;
  return {
    id,
    name: String(raw.name || id).trim() || id,
    emotion: String(raw.emotion || "neutral").trim() || "neutral",
    actionId: String(raw.actionId || "").trim(),
  };
}

export function resolveActionFromExpression(state, expressionId = "", emotion = "") {
  const expressions = state?.expressions || [];
  if (expressionId) {
    const hit = expressions.find((item) => item.id === expressionId);
    if (hit?.actionId) return hit.actionId;
  }
  if (emotion) {
    const byEmotion = expressions.find((item) => item.emotion === emotion && item.actionId);
    if (byEmotion?.actionId) return byEmotion.actionId;
  }
  return "";
}
