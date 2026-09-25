/**
 * Map ScenarioTurn performance hints onto scenario-owned semantic states.
 * This module must not import the desk-pet renderer or its asset catalog.
 */

const EXPRESSION_IDS = new Set(["neutral", "soft_smile", "shy", "comfort_look"]);

const ACTION_ALIASES = Object.freeze({
  idle: "idle",
  idle_loop: "idle",
  idle_default: "idle",
  sit_idle: "idle",
  sleep_loop: "idle",
  talk: "talk",
  talk_loop: "talk",
  talking_default: "talk",
  listen: "listen",
  greet: "greet",
  welcome_home: "greet",
  comfort: "comfort",
  lean_close: "lean_close",
  shy: "shy",
  shy_look_away: "shy",
  react: "react",
  react_tap: "react",
});

const ACTION_LABELS = Object.freeze({
  idle: "安静在场",
  talk: "正在回应",
  listen: "专心聆听",
  greet: "打招呼",
  comfort: "安慰",
  lean_close: "靠近",
  shy: "害羞",
  react: "即时反应",
});

/**
 * @param {{
 *   actionId?: string,
 *   expressionId?: string,
 *   emotion?: string,
 *   characterId?: string,
 * }} [opts]
 */
export function mapStageAction({
  actionId = "",
  expressionId = "",
  emotion = "",
  characterId = "",
} = {}) {
  let expression = String(expressionId || "").trim();
  if (expression && !EXPRESSION_IDS.has(expression)) {
    expression = "";
  }

  let resolved = String(actionId || "").trim();
  if (!resolved && expression) {
    resolved = expression === "shy"
      ? "shy"
      : expression === "comfort_look"
        ? "comfort"
        : expression === "soft_smile"
          ? "talk"
          : "idle";
  }
  if (!resolved && emotion) {
    const normalizedEmotion = String(emotion).trim();
    if (normalizedEmotion === "shy") resolved = "shy";
    else if (normalizedEmotion === "sad") resolved = "comfort";
    else if (normalizedEmotion === "warm" || normalizedEmotion === "happy") resolved = "talk";
  }

  const catalogId = ACTION_ALIASES[resolved] || "talk";
  const cid = String(characterId || "").trim();

  return {
    actionId: catalogId,
    expressionId: expression || fallbackExpression(emotion),
    emotion: String(emotion || "neutral").trim() || "neutral",
    characterId: cid,
    label: ACTION_LABELS[catalogId] || catalogId,
    degraded: !actionId && !expressionId,
  };
}

/**
 * Apply whitelist mapping onto a normalized ScenarioTurn (mutates copy).
 * @param {object} turn
 * @param {{ characterId?: string, speakerId?: string }} [ctx]
 */
export function applyActionWhitelist(turn, ctx = {}) {
  if (!turn || typeof turn !== "object") return turn;
  const characterId = String(
    ctx.characterId || turn.speakerId || ctx.speakerId || "",
  ).trim();
  const mapped = mapStageAction({
    actionId: turn.actionId,
    expressionId: turn.expressionId,
    emotion: turn.emotion,
    characterId,
  });
  return {
    ...turn,
    actionId: mapped.actionId,
    expressionId: mapped.expressionId,
    emotion: mapped.emotion,
    _stage: mapped,
  };
}

function fallbackExpression(emotion) {
  const e = String(emotion || "").trim();
  if (e === "shy") return "shy";
  if (e === "warm" || e === "happy") return "soft_smile";
  if (e === "sad") return "comfort_look";
  return "neutral";
}

/** Background CSS keys for built-in scripts. */
export const BACKGROUND_PRESETS = Object.freeze({
  rain_station: {
    id: "rain_station",
    label: "夜雨车站",
    layered: true,
    sceneId: "night-rain-station",
    sceneDir: "/assets/scenes/night-rain-station/",
    layers: ["far-city", "rain-mid", "platform-near", "vignette"],
    gradient:
      "radial-gradient(90% 70% at 50% 10%, rgb(120 150 180 / 22%), transparent 55%), linear-gradient(180deg, #e4ebf2 0%, #d8e2ec 55%, #eef2f6 100%)",
  },
  "night-rain-station": {
    id: "night-rain-station",
    label: "夜雨车站",
    layered: true,
    sceneId: "night-rain-station",
    sceneDir: "/assets/scenes/night-rain-station/",
    layers: ["far-city", "rain-mid", "platform-near", "vignette"],
    gradient:
      "radial-gradient(90% 70% at 50% 10%, rgb(120 150 180 / 22%), transparent 55%), linear-gradient(180deg, #e4ebf2 0%, #d8e2ec 55%, #eef2f6 100%)",
  },
  rooftop_night: {
    id: "rooftop_night",
    label: "屋顶晚风",
    gradient:
      "radial-gradient(80% 60% at 70% 0%, rgb(220 180 140 / 28%), transparent 50%), linear-gradient(180deg, #f5efe6 0%, #ebe3d6 50%, #f3eee6 100%)",
  },
  cafe_rain: {
    id: "cafe_rain",
    label: "雨天咖啡馆",
    gradient:
      "radial-gradient(70% 50% at 20% 80%, rgb(180 140 100 / 22%), transparent 55%), linear-gradient(180deg, #efe8df 0%, #e5ddd2 50%, #f4efe8 100%)",
  },
});

export function resolveBackground(backgroundId = "", mood = "") {
  const id = String(backgroundId || "").trim();
  if (BACKGROUND_PRESETS[id]) return BACKGROUND_PRESETS[id];
  if (mood === "rain") return BACKGROUND_PRESETS.rain_station;
  if (mood === "night") return BACKGROUND_PRESETS.rooftop_night;
  if (mood === "warm") return BACKGROUND_PRESETS.cafe_rain;
  return BACKGROUND_PRESETS.rain_station;
}
