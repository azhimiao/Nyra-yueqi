/** Scenario library helpers — bookshelf view model */

import { listScripts, getActiveRun, getScript, listRuns } from "../store.js";
import { getPresetScriptMeta, SCENARIO_PRESETS } from "../presets.js";
import { localizeScenarioPreset } from "../localize.js";

const SCENE_COVERS = Object.freeze({
  "script-rain-station": "/assets/scenes/night-rain-station/layers/far-city.svg",
});

function asLibraryItem(script, active) {
  const localized = localizeScenarioPreset(script);
  const meta = getPresetScriptMeta(script.id) || {};
  const runs = listRuns().filter((r) => r.scriptId === script.id);
  const latest = runs[0] || null;
  const inProgress = active?.scriptId === script.id ? active : null;
  return {
    id: script.id,
    title: localized.title,
    premise: localized.premise || script.premise || "",
    mood: script.mood || "warm",
    backgroundId: script.backgroundId || meta.backgroundId || "",
    durationHint: localized.durationHint || script.durationHint || meta.durationHint || "",
    emotionTag: localized.emotionTag || script.emotionTag || meta.emotionTag || "",
    tags: script.tags || [],
    source: script.source || "preset",
    contentLanguage: localized.contentLanguage,
    localizationMissing: localized.localizationMissing,
    cover: workCoverSrc(script),
    coverLabel: localized.title,
    progress: inProgress
      ? {
          runId: inProgress.id,
          status: inProgress.status,
          beatCount: (inProgress.beats || []).length,
          phase: inProgress.phase || inProgress.directorState?.phase || "",
        }
      : latest?.status === "ended"
        ? { runId: latest.id, status: "ended", beatCount: (latest.beats || []).length }
        : null,
  };
}

export function workCoverSrc(script = {}) {
  const id = String(script.id || "").trim();
  return SCENE_COVERS[id] || String(script.cover || "").trim();
}

/** First-mes style line for a tavern-like opening card. */
export function openingGreeting(opening = {}) {
  const turns = Array.isArray(opening.openingTurns) ? opening.openingTurns : [];
  const turn = turns.find((item) => item?.role === "assistant") || turns[0] || null;
  const dialogue = String(turn?.dialogue || "").trim();
  const narration = String(turn?.narration || "").trim();
  if (dialogue && narration) return `${narration}\n「${dialogue}」`;
  if (dialogue) return `「${dialogue}」`;
  return narration
    || String(opening.teaser || "").trim()
    || String(opening.relationshipPremise || "").trim();
}

/**
 * Bookshelf rows: cover meta + progress for lobby.
 * Includes built-in presets (bridged into Experience Runtime on enter).
 */
export function listLibraryItems() {
  const active = getActiveRun();
  const live = listScripts();
  const seen = new Set(live.map((script) => script.id));
  const extras = SCENARIO_PRESETS.filter((script) => script?.id && !seen.has(script.id));
  return [...live, ...extras].map((script) => asLibraryItem(script, active));
}

export function getLibraryItem(id) {
  return listLibraryItems().find((item) => item.id === id) || null;
}

export function continueLabel() {
  const active = getActiveRun();
  if (!active) return "";
  const script = getScript(active.scriptId);
  return `继续《${script?.title || "未完"}》`;
}
