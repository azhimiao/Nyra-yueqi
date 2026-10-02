/** ScenarioTurn contract — CEV2 §6.2 */

export const SCENARIO_TURN_SCHEMA_VERSION = 1;

export const SCENARIO_PHASES = Object.freeze([
  "library",
  "setup",
  "opening",
  "playing",
  "waiting_choice",
  "waiting_user",
  "resolving",
  "paused",
  "finale",
  "memory_commit",
]);

const SAFE_CAMERA_SHOTS = new Set(["wide", "medium", "close", "over"]);
const SAFE_TRANSITIONS = new Set(["cut", "fade", "soft"]);

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, errors: string[], value: object|null }}
 */
export function normalizeScenarioTurn(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["turn_not_object"], value: null };
  }

  const errors = [];
  const schemaVersion = Number(raw.schemaVersion) || SCENARIO_TURN_SCHEMA_VERSION;
  if (schemaVersion !== SCENARIO_TURN_SCHEMA_VERSION) {
    errors.push("unsupported_schema");
  }

  const dialogue = String(raw.dialogue || raw.reply || "").trim();
  const narration = String(raw.narration || "").trim();
  if (!dialogue && !narration) errors.push("empty_turn");

  const choicesIn = Array.isArray(raw.choices) ? raw.choices : [];
  const choices = choicesIn
    .map((item, index) => ({
      id: String(item?.id || `c${index + 1}`).trim() || `c${index + 1}`,
      text: String(item?.text || item?.label || "").trim(),
      intent: String(item?.intent || "").trim(),
    }))
    .filter((item) => item.text)
    .slice(0, 4);

  const stateDeltaRaw = raw.stateDelta && typeof raw.stateDelta === "object" ? raw.stateDelta : {};
  const flags = Array.isArray(stateDeltaRaw.flags)
    ? stateDeltaRaw.flags.map(String).filter(Boolean).slice(0, 12)
    : [];

  const voiceRaw = raw.voice && typeof raw.voice === "object" ? raw.voice : {};
  const cameraRaw = raw.camera && typeof raw.camera === "object" ? raw.camera : {};
  const shot = String(cameraRaw.shot || "medium").trim();
  const transition = String(cameraRaw.transition || "soft").trim();

  const value = {
    schemaVersion: SCENARIO_TURN_SCHEMA_VERSION,
    sceneId: String(raw.sceneId || "").trim(),
    beatId: String(raw.beatId || "").trim(),
    narration,
    speakerId: String(raw.speakerId || "").trim(),
    dialogue,
    emotion: String(raw.emotion || "neutral").trim() || "neutral",
    expressionId: String(raw.expressionId || "").trim(),
    actionId: String(raw.actionId || "").trim(),
    backgroundId: String(raw.backgroundId || "").trim(),
    soundId: String(raw.soundId || "").trim(),
    voice: {
      enabled: voiceRaw.enabled !== false,
      style: String(voiceRaw.style || "soft").trim() || "soft",
    },
    camera: {
      shot: SAFE_CAMERA_SHOTS.has(shot) ? shot : "medium",
      focus: String(cameraRaw.focus || "lead").trim() || "lead",
      transition: SAFE_TRANSITIONS.has(transition) ? transition : "soft",
    },
    choices,
    stateDelta: {
      tension: clampInt(stateDeltaRaw.tension, -1, 1, 0),
      intimacy: clampInt(stateDeltaRaw.intimacy, -1, 1, 0),
      trust: clampInt(stateDeltaRaw.trust, -1, 1, 0),
      flags,
    },
    memoryCandidate: String(raw.memoryCandidate || "").trim(),
    suggestEnding: Boolean(raw.suggestEnding),
    offline: Boolean(raw.offline),
  };

  return {
    ok: errors.length === 0,
    errors,
    value: errors.includes("empty_turn") ? null : value,
  };
}

/**
 * Safe offline fallback when director JSON is broken.
 * @param {{ tension?: number, sceneId?: string, speakerId?: string }} [ctx]
 */
export function safeOfflineTurn(ctx = {}) {
  return normalizeScenarioTurn({
    schemaVersion: SCENARIO_TURN_SCHEMA_VERSION,
    sceneId: ctx.sceneId || "",
    beatId: `safe-${Date.now().toString(36)}`,
    narration: "灯光微微一顿。",
    speakerId: ctx.speakerId || "",
    dialogue: "……我还在。你想怎么继续？",
    emotion: "warm",
    expressionId: "soft_smile",
    actionId: "talking_default",
    backgroundId: "",
    voice: { enabled: true, style: "soft" },
    camera: { shot: "medium", focus: "lead", transition: "soft" },
    choices: [
      { id: "lean-in", text: "靠近一点", intent: "closeness" },
      { id: "ask", text: "轻轻问一句", intent: "curious" },
      { id: "silence", text: "先不说话", intent: "pause" },
    ],
    stateDelta: { tension: 0, intimacy: 0, trust: 0, flags: [] },
    memoryCandidate: "",
    suggestEnding: false,
    offline: true,
  }).value;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
