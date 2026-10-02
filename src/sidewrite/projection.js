import { SCENE_TAGS, SOURCE_APP } from "./constants.js";
import { loadPrefs } from "./manifest-store.js";
import { appendLivingTimelineEvent, listRecentEvents } from "./timeline-bridge.js";

/** @type {Map<string, number>} */
const dwellDedup = new Map();

function sceneForSubApp(subApp) {
  return SCENE_TAGS[subApp] || SCENE_TAGS.view;
}

/**
 * @param {{
 *   characterId: string,
 *   action: string,
 *   subApp?: string|null,
 *   targetId?: string|null,
 *   targetTitle?: string|null,
 *   excerpt?: string|null,
 *   dwellMs?: number|null,
 *   summary: string,
 * }} input
 */
export function recordSidewriteEvent(input = {}) {
  const prefs = loadPrefs();
  if (!prefs.projectionEnabled) return null;

  const characterId = String(input.characterId || "").trim();
  const action = String(input.action || "open_app");
  const subApp = input.subApp ? String(input.subApp) : null;
  const targetId = input.targetId == null ? null : String(input.targetId);
  const summary = String(input.summary || "").trim().slice(0, 120);
  if (!summary || !characterId) return null;

  if (action === "dwell") {
    const dedupKey = `${characterId}:${subApp || ""}:${targetId || ""}`;
    const last = dwellDedup.get(dedupKey) || 0;
    if (Date.now() - last < 30_000) return null;
    dwellDedup.set(dedupKey, Date.now());
  }

  const sceneTag = subApp ? sceneForSubApp(subApp) : SCENE_TAGS.view;

  return appendLivingTimelineEvent({
    characterId,
    sourceApp: SOURCE_APP,
    appId: SOURCE_APP,
    sceneTag,
    action,
    summary,
    payload: {
      subApp,
      targetId,
      targetTitle: input.targetTitle == null ? null : String(input.targetTitle).slice(0, 40),
      excerpt: input.excerpt == null ? null : String(input.excerpt).slice(0, 80),
      dwellMs: input.dwellMs == null ? null : Number(input.dwellMs),
    },
    ttlHours: 48,
  });
}

/**
 * Start a dwell timer; fires once after threshold.
 * @returns {() => void} cancel
 */
export function startDwellTimer({
  characterId,
  subApp,
  targetId,
  targetTitle,
  excerpt,
  summary,
  thresholdMs,
} = {}) {
  const prefs = loadPrefs();
  const ms = Math.max(1000, Number(thresholdMs) || prefs.dwellThresholdMs || 3000);
  const timer = window.setTimeout(() => {
    recordSidewriteEvent({
      characterId,
      action: "dwell",
      subApp,
      targetId,
      targetTitle,
      excerpt,
      dwellMs: ms,
      summary: summary || `用户在侧写中停留查看了${targetTitle || "一条痕迹"}`,
    });
  }, ms);
  return () => window.clearTimeout(timer);
}

export function listSidewriteEvents(opts) {
  return listRecentEvents(opts);
}
