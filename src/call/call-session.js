/** 通话会话记录 -> 挂断后可入库记忆。 */

export function createCallSession({ characterName = "角色", characterId = "", companionId = "", kind = "video" } = {}) {
  const scopeId = String(companionId || characterId || "").trim();
  return {
    id: `call-${Date.now()}`,
    characterName,
    characterId: scopeId,
    companionId: scopeId,
    kind: kind === "voice" ? "voice" : "video",
    startedAt: new Date().toISOString(),
    endedAt: null,
    turns: [],
  };
}

export function appendCallTurn(session, { role = "assistant", content = "", at = new Date().toISOString() } = {}) {
  if (!session || !content) return session;
  session.turns.push({ role, content: String(content).trim(), at });
  return session;
}

function callDurationMs(session) {
  const startedAt = new Date(session?.startedAt || 0).getTime();
  const endedAt = new Date(session?.endedAt || 0).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return 0;
  return endedAt - startedAt;
}

export function formatCallDuration(durationMs = 0) {
  const seconds = Math.max(0, Math.floor(Number(durationMs) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function buildCallRecordMessage(session, { locale = "zh-CN" } = {}) {
  if (!session?.id || !session?.startedAt || !session?.endedAt) return null;
  const companionId = String(session.companionId || session.characterId || "").trim();
  if (!companionId) return null;
  const kind = session.kind === "voice" ? "voice" : "video";
  const durationMs = callDurationMs(session);
  const en = String(locale || "zh-CN").toLowerCase().startsWith("en");
  const kindLabel = kind === "voice"
    ? (en ? "Voice call" : "语音通话")
    : (en ? "Video call" : "视频通话");
  const durationLabel = formatCallDuration(durationMs);
  return {
    role: "system",
    text: `${kindLabel} · ${durationLabel}`,
    companionId,
    metadata: {
      kind: "call_record",
      mediaType: "call_record",
      source: "call_session",
      call: {
        callId: String(session.id),
        kind,
        status: "completed",
        startedAt: String(session.startedAt),
        endedAt: String(session.endedAt),
        durationMs,
        turnCount: Array.isArray(session.turns) ? session.turns.length : 0,
        characterName: String(session.characterName || ""),
      },
    },
  };
}

export function summarizeCallSession(session) {
  if (!session?.turns?.length) return "";
  const lines = session.turns.map((turn, index) => {
    const who = turn.role === "user" ? "我" : (session.characterName || "TA");
    return `${index + 1}. ${who}：${turn.content}`;
  });
  const started = session.startedAt?.slice(11, 16) || "?";
  const kindLabel = session.kind === "voice" ? "语音通话" : "视频通话";
  return `${kindLabel}纪要（${started} 起，共 ${session.turns.length} 轮）\n${lines.join("\n")}`;
}

export function buildCallSessionMemory(session) {
  const rawText = summarizeCallSession(session);
  if (!rawText) return null;
  const voice = session.kind === "voice";
  const kindLabel = voice ? "语音通话" : "视频通话";
  return {
    rawText,
    source: "call.session",
    title: `${kindLabel} · ${session.characterName || "角色"}`,
    weight: 0.82,
    role: session.characterName || "角色",
    wing: "Relationship",
    room: voice ? "Voice Call" : "Video Call",
    tags: ["通话", voice ? "语音" : "视频"],
    pinned: false,
    searchable: true,
    companionId: String(session.companionId || session.characterId || "").trim(),
    characterId: String(session.companionId || session.characterId || "").trim(),
  };
}
