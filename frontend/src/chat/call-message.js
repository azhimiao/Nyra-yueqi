import { formatCallDuration } from "../call/call-session.js";
import { t } from "../i18n/index.js";

export function resolveCallMessageCard(metadata = {}, content = "", { locale = "zh-CN" } = {}) {
  const kind = String(metadata?.kind || metadata?.mediaType || "").trim();
  if (kind !== "call_record") return null;
  const call = metadata.call && typeof metadata.call === "object" ? metadata.call : {};
  const callKind = call.kind === "voice" ? "voice" : "video";
  const localeId = String(locale || "zh-CN").toLowerCase().startsWith("en") ? "en" : "zh-CN";
  const durationMs = Math.max(0, Number(call.durationMs) || 0);
  return {
    callId: String(call.callId || "").trim(),
    kind: callKind,
    title: callKind === "voice"
      ? t("shared.call.voice", localeId)
      : t("shared.call.video", localeId),
    statusLabel: t("shared.call.ended", localeId),
    duration: formatCallDuration(durationMs),
    durationMs,
    startedAt: String(call.startedAt || "").trim(),
    endedAt: String(call.endedAt || "").trim(),
    turnCount: Math.max(0, Math.floor(Number(call.turnCount) || 0)),
    characterName: String(call.characterName || "").trim(),
    summary: String(call.summary || content || "").trim().slice(0, 240),
  };
}
