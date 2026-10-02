/** Simple scene → look/action triggers (sleep, rain, proactive, morning…). */

export const DEFAULT_SCENE_TRIGGERS = [
  { id: "scene_idle", scene: "idle", actionId: "idle_default", lookId: "" },
  { id: "scene_talking", scene: "talking", actionId: "talking_default", lookId: "" },
  { id: "scene_proactive", scene: "proactive", actionId: "comfort", lookId: "" },
  { id: "scene_rain", scene: "weather_rain", actionId: "idle_default", lookId: "rainy_night" },
  { id: "scene_sleep", scene: "sleep", actionId: "sleep_pose", lookId: "sleepwear" },
  { id: "scene_morning", scene: "morning", actionId: "talking_default", lookId: "home_casual" },
];

export function normalizeSceneTrigger(raw = {}) {
  const id = String(raw.id || "").trim();
  const scene = String(raw.scene || "").trim();
  if (!id || !scene) return null;
  return {
    id,
    scene,
    actionId: String(raw.actionId || "").trim(),
    lookId: String(raw.lookId || "").trim(),
    priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : 0,
  };
}

export function resolveSceneTrigger(state, scene) {
  const list = (state?.sceneTriggers || [])
    .filter((item) => item.scene === scene)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return list[0] || null;
}

/** Infer scene key from daily status / weather / sleep. */
export function inferSceneFromStatus(status = {}) {
  if (status.asleep) return "sleep";
  const weather = String(status.weather?.label || status.weatherLabel || "");
  if (/雨|雪/.test(weather)) return "weather_rain";
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 10) return "morning";
  return "idle";
}
