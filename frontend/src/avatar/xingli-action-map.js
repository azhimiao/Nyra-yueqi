const ALL_SOURCES = Object.freeze(["reply", "manual", "scene", "system", "gesture"]);
const SAFE_ACTION_ID = /^[a-z][a-z0-9_-]{0,63}$/;

export const XINGLI_MANIFEST_URL = "/assets/characters/xingli/manifest.json";

export const XINGLI_ACTION_GROUPS = Object.freeze({
  presence: Object.freeze({ id: "presence", label: "陪伴状态" }),
  conversation: Object.freeze({ id: "conversation", label: "对话响应" }),
  affection: Object.freeze({ id: "affection", label: "亲密表达" }),
  reaction: Object.freeze({ id: "reaction", label: "互动反应" }),
  activity: Object.freeze({ id: "activity", label: "生活动作" }),
  posture: Object.freeze({ id: "posture", label: "姿态场景" }),
});

function action(id, label, group, options = {}) {
  const sources = Object.freeze([...(options.sources || ALL_SOURCES)]);
  const scenes = Object.freeze([...(options.scenes || [])]);
  return Object.freeze({
    id,
    label,
    group,
    loop: Boolean(options.loop),
    playback: options.loop ? "loop" : "once",
    replyEligible: sources.includes("reply"),
    restricted: sources.length !== ALL_SOURCES.length,
    manualOnly: sources.every((source) => source === "manual" || source === "gesture"),
    sceneLimited: scenes.length > 0,
    sources,
    scenes,
  });
}

export const XINGLI_ACTION_CATALOG = Object.freeze([
  action("idle_loop", "自然待机", "presence", { loop: true }),
  action("talk_loop", "说话", "conversation", { loop: true }),
  action("listen", "认真倾听", "conversation", {
    sources: ["reply", "manual", "system"],
  }),
  action("thinking", "思考", "conversation", {
    sources: ["reply", "manual", "system"],
  }),
  action("react_tap", "点击回应", "reaction", {
    sources: ["reply", "manual", "gesture"],
  }),
  action("comfort", "温柔安慰", "affection", {
    sources: ["reply", "manual", "system"],
  }),
  action("greet", "挥手问候", "affection", {
    sources: ["reply", "manual", "system"],
  }),
  action("lean_close", "靠近你", "affection", {
    sources: ["reply", "manual"],
  }),
  action("shy_look_away", "害羞移开视线", "affection", {
    sources: ["reply", "manual"],
  }),
  action("selfie", "拿起手机自拍", "activity", {
    sources: ["reply", "manual"],
  }),
  action("welcome_home", "欢迎回家", "affection", {
    sources: ["manual", "scene", "system"],
    scenes: ["welcome_home"],
  }),
  action("drag", "被拖动", "reaction", {
    sources: ["manual", "gesture"],
  }),
  action("stand_to_sit", "从站立到坐下", "posture", {
    sources: ["manual", "scene"],
    scenes: ["sit"],
  }),
  action("sit_idle", "坐姿待机", "posture", {
    loop: true,
    sources: ["manual", "scene"],
    scenes: ["sit"],
  }),
  action("sit_to_sleep", "从坐下到入睡", "posture", {
    sources: ["manual", "scene"],
    scenes: ["sleep"],
  }),
  action("sleep_loop", "睡眠呼吸", "posture", {
    loop: true,
    sources: ["reply", "manual", "scene", "system"],
    scenes: ["sleep"],
  }),
]);

export const XINGLI_ACTIONS = XINGLI_ACTION_CATALOG;

export const XINGLI_ACTION_IDS = Object.freeze(
  XINGLI_ACTION_CATALOG.map((item) => item.id),
);

export const XINGLI_ACTIONS_BY_ID = Object.freeze(Object.fromEntries(
  XINGLI_ACTION_CATALOG.map((item) => [item.id, item]),
));

export const XINGLI_ACTION_LABELS = Object.freeze(Object.fromEntries(
  XINGLI_ACTION_CATALOG.map((item) => [item.id, item.label]),
));

export const XINGLI_ACTION_ALIASES = Object.freeze({
  idle: "idle_loop",
  idle_default: "idle_loop",
  breathe: "idle_loop",
  talking: "talk_loop",
  talk: "talk_loop",
  talking_default: "talk_loop",
  listening: "listen",
  listen_default: "listen",
  thinking_default: "thinking",
  reacting: "react_tap",
  tap: "react_tap",
  comfort_look: "comfort",
  greeting: "greet",
  welcome: "welcome_home",
  sleep: "sleep_loop",
  asleep: "sleep_loop",
  sleep_pose: "sleep_loop",
});

export const XINGLI_EMOTION_CLIPS = Object.freeze({
  shy: "shy_look_away",
  bashful: "shy_look_away",
  embarrassed: "shy_look_away",
  sad: "comfort",
  worried: "comfort",
  anxious: "comfort",
  lonely: "comfort",
  caring: "comfort",
  affectionate: "lean_close",
  loving: "lean_close",
  tender: "lean_close",
  happy: "greet",
  excited: "greet",
  joyful: "greet",
  surprised: "react_tap",
  curious: "thinking",
  thoughtful: "thinking",
});

export const XINGLI_REPLY_ACTION_IDS = Object.freeze(
  XINGLI_ACTION_CATALOG.filter((item) => item.replyEligible).map((item) => item.id),
);

const GENERIC_ACTIONS = new Set(["idle_loop", "talk_loop"]);
const PASSIVE_STATES = new Set(["", "idle", "ready", "paused"]);
const RETURN_CLIPS = Object.freeze({
  stand_to_sit: "sit_idle",
  sit_to_sleep: "sleep_loop",
});

export function normalizeXingliActionId(actionId = "") {
  const normalized = String(actionId || "").trim().toLowerCase();
  if (!normalized || !SAFE_ACTION_ID.test(normalized)) return "";
  if (XINGLI_ACTIONS_BY_ID[normalized]) return normalized;
  return XINGLI_ACTION_ALIASES[normalized] || "";
}

export function getXingliAction(actionId = "") {
  const id = normalizeXingliActionId(actionId);
  return id ? XINGLI_ACTIONS_BY_ID[id] || null : null;
}

export function canTriggerXingliAction(actionId, source = "reply") {
  const descriptor = getXingliAction(actionId);
  if (!descriptor) return false;
  return descriptor.sources.includes(normalizeSource(source));
}

export function listXingliActions({ group = "", source = "" } = {}) {
  const normalizedGroup = String(group || "").trim();
  const normalizedSource = source ? normalizeSource(source) : "";
  return XINGLI_ACTION_CATALOG.filter((item) => (
    (!normalizedGroup || item.group === normalizedGroup)
      && (!normalizedSource || item.sources.includes(normalizedSource))
  ));
}

/**
 * Manual / carousel actions for the active pet pack.
 * Only returns protocol actions that exist as non-placeholder clips so UI
 * does not advertise Xingli-only poses on incomplete Yueqi packs.
 *
 * @param {{ group?: string, source?: string, availableClipIds?: Iterable<string>|null, clipMetaById?: Record<string, { placeholder?: boolean }>|null, excludePlaceholders?: boolean }} options
 */
export function listPetActions({
  group = "",
  source = "",
  availableClipIds = null,
  clipMetaById = null,
  excludePlaceholders = true,
} = {}) {
  const available = availableClipIds == null
    ? null
    : new Set([...availableClipIds].map((id) => String(id || "").trim()).filter(Boolean));
  return listXingliActions({ group, source }).filter((item) => {
    if (available && !available.has(item.id)) return false;
    if (excludePlaceholders && clipMetaById?.[item.id]?.placeholder) return false;
    return true;
  });
}

/**
 * Resolve runtime state to a concrete Xingli atlas clip.
 * `source` defaults to `reply`, so manual/scene/gesture-only actions cannot be
 * selected merely because an LLM returned their action id.
 */
export function resolveXingliClipId({
  playState = "idle",
  actionId = "",
  emotion = "",
  asleep = false,
  source = "reply",
} = {}) {
  const normalizedSource = normalizeSource(source);
  const normalizedState = String(playState || "idle").trim().toLowerCase();
  const normalizedAction = normalizeXingliActionId(actionId);
  const explicit = normalizedAction ? XINGLI_ACTIONS_BY_ID[normalizedAction] : null;

  // A specific, permitted action beats generic play-state inference.
  if (explicit && !GENERIC_ACTIONS.has(explicit.id) && explicit.sources.includes(normalizedSource)) {
    return explicit.id;
  }

  if (["sleep", "asleep", "sleeping"].includes(normalizedState)) return "sleep_loop";
  if (asleep && PASSIVE_STATES.has(normalizedState)) return "sleep_loop";

  if (["listening", "hearing", "recording"].includes(normalizedState)) return "listen";
  if (["thinking", "capturing", "watching", "looking"].includes(normalizedState)) return "thinking";
  if (["talking", "speaking"].includes(normalizedState)) return "talk_loop";
  if (["drag", "dragging"].includes(normalizedState)
    && canTriggerXingliAction("drag", normalizedSource)) return "drag";

  if (["reacting", "reaction", "proactive"].includes(normalizedState)) {
    const emotionClip = resolveEmotionClip(emotion, normalizedSource);
    return emotionClip || "react_tap";
  }

  if (explicit && explicit.sources.includes(normalizedSource)) return explicit.id;
  return "idle_loop";
}

export function resolveXingliClip(state = {}) {
  const clipId = resolveXingliClipId(state);
  const action = XINGLI_ACTIONS_BY_ID[clipId];
  return {
    clipId,
    playback: action.playback,
    returnClip: action.loop ? "" : (RETURN_CLIPS[clipId] || "idle_loop"),
    action,
  };
}

export function resolveXingliAction(state = {}) {
  return resolveXingliClip(state).action;
}

function resolveEmotionClip(emotion, source) {
  if (source !== "reply" && source !== "system") return "";
  const normalized = String(emotion || "").trim().toLowerCase();
  const clipId = XINGLI_EMOTION_CLIPS[normalized] || "";
  return clipId && canTriggerXingliAction(clipId, source) ? clipId : "";
}

function normalizeSource(source) {
  const normalized = String(source || "reply").trim().toLowerCase();
  return ALL_SOURCES.includes(normalized) ? normalized : "reply";
}
