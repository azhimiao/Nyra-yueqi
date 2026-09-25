import { SCENARIO_PRESETS } from "./presets.js";
import { normalizeCast } from "./cast.js";

// Only production Experience Runtime presets are consumer entries. Strip the
// legacy beat graph so the library cannot route users into the offline plot.
const PRODUCT_EXPERIENCE_SCRIPTS = Object.freeze(
  SCENARIO_PRESETS
    .filter((script) => script.productionRuntime === "experience")
    .map(({ beats: _legacyBeats, ...script }) => Object.freeze({ ...script })),
);

export const SCENARIO_STORE_KEY = "yueqi.scenario.v1";

function nowIso() {
  return new Date().toISOString();
}

function readBag() {
  try {
    return JSON.parse(window.localStorage.getItem(SCENARIO_STORE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeBag(bag) {
  try {
    window.localStorage.setItem(SCENARIO_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

function ensureBag() {
  const bag = readBag();
  if (!Array.isArray(bag.scripts)) bag.scripts = [];
  if (!Array.isArray(bag.runs)) bag.runs = [];
  return bag;
}

export function listScripts() {
  const bag = ensureBag();
  const userScripts = (bag.scripts || []).filter((script) => (
    !PRODUCT_EXPERIENCE_SCRIPTS.some((builtin) => builtin.id === script?.id)
  ));
  return [...PRODUCT_EXPERIENCE_SCRIPTS, ...userScripts];
}

export function getScript(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  return listScripts().find((item) => item.id === key)
    || SCENARIO_PRESETS.find((item) => item.id === key)
    || null;
}

export function listRuns() {
  return ensureBag().runs.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getRun(id) {
  return listRuns().find((item) => item.id === id) || null;
}

export function getActiveRun() {
  return listRuns().find((item) => item.status === "active" || item.status === "paused") || null;
}

/**
 * @param {{
 *   scriptId: string,
 *   cast?: { leadId?: string, memberIds?: string[] },
 *   backgroundId?: string,
 *   loreEntryIds?: string[],
 * }} input
 */
export function startRun({ scriptId, cast, backgroundId, loreEntryIds } = {}) {
  const script = getScript(scriptId);
  if (!script) throw new Error("unknown_script");
  const bag = ensureBag();
  bag.runs = bag.runs.map((run) => (
    run.status === "active" || run.status === "paused"
      ? { ...run, status: "paused", phase: "paused", updatedAt: nowIso() }
      : run
  ));
  const id = `run-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
  const normalizedCast = normalizeCast(cast);
  const bg = String(backgroundId || script.backgroundId || "").trim();
  const loreIds = Array.isArray(loreEntryIds)
    ? loreEntryIds.map(String).filter(Boolean)
    : (Array.isArray(script.loreEntryIds) ? script.loreEntryIds.map(String).filter(Boolean) : []);
  const run = {
    id,
    scriptId: script.id,
    status: "active",
    phase: "opening",
    cast: normalizedCast,
    memoryCommitted: false,
    loreEntryIds: loreIds,
    beats: [
      {
        id: `beat-${Date.now()}`,
        at: Date.now(),
        kind: "narration",
        text: script.openingBeat || script.premise,
      },
    ],
    directorState: {
      tension: 1,
      intimacy: 0,
      trust: 0,
      lastBeatType: "narration",
      beatCursor: 0,
      beatNodeId: "",
      backgroundId: bg,
      phase: "opening",
      flags: {},
    },
    startedAt: nowIso(),
    updatedAt: nowIso(),
  };
  bag.runs.unshift(run);
  writeBag(bag);
  return run;
}

export function saveRun(run) {
  const bag = ensureBag();
  const index = bag.runs.findIndex((item) => item.id === run.id);
  const next = { ...run, updatedAt: nowIso() };
  if (index >= 0) bag.runs[index] = next;
  else bag.runs.unshift(next);
  writeBag(bag);
  return next;
}

export function appendBeats(runId, beats = []) {
  const run = getRun(runId);
  if (!run) throw new Error("unknown_run");
  const next = {
    ...run,
    beats: [...(run.beats || []), ...beats],
    updatedAt: nowIso(),
  };
  return saveRun(next);
}

export function endRun(runId, summary = "") {
  const run = getRun(runId);
  if (!run) throw new Error("unknown_run");
  return saveRun({
    ...run,
    status: "ended",
    phase: run.memoryCommitted ? "memory_commit" : "finale",
    summary: String(summary || run.summary || "").trim(),
    endedAt: nowIso(),
    directorState: {
      ...(run.directorState || {}),
      phase: run.memoryCommitted ? "memory_commit" : "finale",
    },
  });
}

export function pauseRun(runId) {
  const run = getRun(runId);
  if (!run) return null;
  const priorPhase = run.phase || run.directorState?.phase || "waiting_choice";
  const resumePhase = priorPhase === "paused"
    ? (run.directorState?.resumePhase || "waiting_choice")
    : priorPhase;
  return saveRun({
    ...run,
    status: "paused",
    phase: "paused",
    directorState: {
      ...(run.directorState || {}),
      phase: "paused",
      resumePhase,
    },
  });
}

/**
 * Save / upsert a user or cocreate script into bag.scripts.
 * @param {{
 *   id?: string,
 *   title?: string,
 *   premise?: string,
 *   openingBeat?: string,
 *   mood?: string,
 *   source?: "user"|"cocreate",
 *   loreEntryIds?: string[],
 *   tags?: string[],
 *   castHint?: string,
 * }} input
 */
export function upsertUserScript(input = {}) {
  const bag = ensureBag();
  const id = String(input.id || `script-user-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`);
  const existing = (bag.scripts || []).find((item) => item.id === id);
  const script = {
    id,
    title: String(input.title || existing?.title || "未命名剧本").trim() || "未命名剧本",
    premise: String(input.premise || existing?.premise || "").trim() || "一次未命名的共演。",
    openingBeat: String(input.openingBeat || existing?.openingBeat || input.premise || "").trim()
      || "灯光亮起，故事开始。",
    mood: String(input.mood || existing?.mood || "warm").trim() || "warm",
    castHint: String(input.castHint || existing?.castHint || "").trim(),
    tags: Array.isArray(input.tags) ? input.tags.map(String) : (existing?.tags || ["自写"]),
    loreEntryIds: Array.isArray(input.loreEntryIds)
      ? input.loreEntryIds.map(String).filter(Boolean)
      : (existing?.loreEntryIds || []),
    source: input.source === "cocreate" ? "cocreate" : "user",
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  const idx = bag.scripts.findIndex((item) => item.id === id);
  if (idx >= 0) bag.scripts[idx] = script;
  else bag.scripts.unshift(script);
  writeBag(bag);
  return script;
}

/** @deprecated alias — F4 §6 saveScript */
export function saveScript(input) {
  return upsertUserScript(input);
}

export function deleteUserScript(id) {
  const bag = ensureBag();
  const sid = String(id || "").trim();
  bag.scripts = (bag.scripts || []).filter((item) => item.id !== sid);
  writeBag(bag);
}

/** Backup helper */
export function exportScenarioBag() {
  const bag = ensureBag();
  return { scripts: bag.scripts || [], runs: bag.runs || [] };
}

export function importScenarioBag(payload) {
  if (!payload || typeof payload !== "object") return;
  writeBag({
    scripts: Array.isArray(payload.scripts) ? payload.scripts : [],
    runs: Array.isArray(payload.runs) ? payload.runs : [],
  });
}
