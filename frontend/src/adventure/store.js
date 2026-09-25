/** Adventure V2 run store with checkpoints, branches and V1 migration. */

import {
  ADVENTURE_SCHEMA_VERSION,
  applyAdventureEffects,
  resolveAdventureChecks,
  validateDmCandidate,
} from "./schema.js";
import { getPackage } from "./presets.js";

export const ADVENTURE_STORE_KEY = "yueqi.adventure.v2";
export const LEGACY_ADVENTURE_STORE_KEY = "yueqi.adventure.v1";
const MAX_RUNS = 24;
const MAX_TURNS = 160;
const MAX_CHECKPOINTS = 80;

export const CHARACTER_ARCHETYPES = Object.freeze({
  observer: { id: "observer", label: "观察者", description: "擅长识别线索与异常。", stats: { 体魄: 1, 洞察: 4, 交涉: 2 } },
  mediator: { id: "mediator", label: "协调者", description: "擅长谈判、安抚与建立信任。", stats: { 体魄: 1, 洞察: 2, 交涉: 4 } },
  pathfinder: { id: "pathfinder", label: "行动派", description: "擅长承压、突破与现场处置。", stats: { 体魄: 4, 洞察: 2, 交涉: 1 } },
});

let memoryBag = null;

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function storage() {
  return typeof window !== "undefined" ? window.localStorage : null;
}

function emptyBag() {
  return { schemaVersion: ADVENTURE_SCHEMA_VERSION, activeRunId: "", runs: [], migratedLegacyAt: null };
}

function readRaw(key) {
  try {
    return storage()?.getItem(key) || null;
  } catch {
    return null;
  }
}

function parseRaw(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeBag(bag) {
  const next = normalizeBag(bag);
  memoryBag = clone(next);
  const target = storage();
  if (!target) return next;
  try {
    target.setItem(ADVENTURE_STORE_KEY, JSON.stringify(next));
  } catch (error) {
    const wrapped = new Error("冒险存档写入失败，请检查本机存储空间。");
    wrapped.code = "adventure_storage_write_failed";
    wrapped.cause = error;
    throw wrapped;
  }
  return next;
}

function normalizeInventory(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 60).map((item, index) => {
    if (typeof item === "string") return { id: `legacy-item-${index}`, name: item.slice(0, 80), qty: 1, description: "" };
    return {
      id: String(item?.id || item?.name || `item-${index}`).slice(0, 100),
      name: String(item?.name || item?.id || "物品").slice(0, 80),
      qty: Math.max(1, Math.min(99, Math.floor(Number(item?.qty) || 1))),
      description: String(item?.description || "").slice(0, 240),
    };
  });
}

function instantiateQuests(pkg, questIds = []) {
  const ids = new Set(questIds.map(String));
  return (pkg?.quests || []).filter((quest) => ids.has(quest.id)).map((quest) => ({
    id: quest.id,
    title: quest.title,
    description: quest.description || "",
    status: "active",
    objectives: (quest.objectives || []).map((objective) => ({ ...objective, status: "active" })),
  }));
}

function normalizeRun(raw) {
  if (!raw || typeof raw !== "object") return null;
  const pkg = getPackage(raw.packageId);
  if (!pkg?.openings?.length) return null;
  const opening = pkg.openings.find((item) => item.id === raw.openingId) || pkg.openings[0];
  if (!opening) return null;
  const archetype = CHARACTER_ARCHETYPES[raw.character?.archetypeId] || CHARACTER_ARCHETYPES.observer;
  const state = raw.state && typeof raw.state === "object" ? raw.state : {};
  const run = {
    id: String(raw.id || uid("run")),
    schemaVersion: ADVENTURE_SCHEMA_VERSION,
    packageId: pkg.id,
    packageVersion: Number(raw.packageVersion) || pkg.version || 1,
    openingId: opening.id,
    title: String(raw.title || `${pkg.title} · ${opening.title}`).slice(0, 160),
    mode: pkg.tutorial || raw.mode === "tutorial" ? "tutorial" : "model",
    status: ["active", "complete", "archived"].includes(raw.status) ? raw.status : "active",
    branchId: String(raw.branchId || uid("branch")),
    parentRunId: raw.parentRunId ? String(raw.parentRunId) : null,
    parentTurnId: raw.parentTurnId ? String(raw.parentTurnId) : null,
    character: {
      name: String(raw.character?.name || "").trim().slice(0, 40) || "未命名",
      pronouns: String(raw.character?.pronouns || "你").slice(0, 20),
      archetypeId: archetype.id,
      archetypeLabel: String(raw.character?.archetypeLabel || archetype.label).slice(0, 40),
    },
    state: {
      locationId: String(state.locationId || opening.startLocationId),
      clock: {
        day: Math.max(1, Math.floor(Number(state.clock?.day) || opening.initialClock?.day || 1)),
        hour: Math.max(0, Math.min(23, Math.floor(Number(state.clock?.hour) || opening.initialClock?.hour || 8))),
      },
      stats: { ...archetype.stats, ...(state.stats || {}) },
      conditions: Array.isArray(state.conditions) ? state.conditions.map(String).slice(0, 20) : [],
      inventory: normalizeInventory(state.inventory || opening.initialInventory),
      quests: Array.isArray(state.quests) ? clone(state.quests) : instantiateQuests(pkg, opening.initialQuestIds),
      npcs: state.npcs && typeof state.npcs === "object" ? clone(state.npcs) : {},
      flags: state.flags && typeof state.flags === "object" ? { ...state.flags } : { ...(opening.initialFlags || {}) },
      storySummary: String(state.storySummary || opening.openingText || "").slice(-1800),
      suggestions: Array.isArray(state.suggestions) ? clone(state.suggestions).slice(0, 4) : [],
    },
    turns: Array.isArray(raw.turns) ? clone(raw.turns).slice(-MAX_TURNS) : [],
    checkpoints: Array.isArray(raw.checkpoints) ? clone(raw.checkpoints).slice(-MAX_CHECKPOINTS) : [],
    pendingTurn: raw.pendingTurn && typeof raw.pendingTurn === "object" ? clone(raw.pendingTurn) : null,
    createdAt: String(raw.createdAt || nowIso()),
    updatedAt: String(raw.updatedAt || nowIso()),
  };
  return run;
}

function normalizeBag(raw) {
  const base = raw && typeof raw === "object" ? raw : emptyBag();
  const runs = (Array.isArray(base.runs) ? base.runs : []).map(normalizeRun).filter(Boolean).slice(0, MAX_RUNS);
  const activeRunId = runs.some((run) => run.id === base.activeRunId) ? String(base.activeRunId) : runs[0]?.id || "";
  return {
    schemaVersion: ADVENTURE_SCHEMA_VERSION,
    activeRunId,
    runs,
    migratedLegacyAt: base.migratedLegacyAt ? String(base.migratedLegacyAt) : null,
  };
}

function migrateLegacySave() {
  const raw = parseRaw(readRaw(LEGACY_ADVENTURE_STORE_KEY));
  if (!raw || typeof raw !== "object" || (!raw.worldId && !(raw.log || []).length)) return emptyBag();
  const pkg = getPackage(raw.worldId);
  if (!pkg?.openings?.length) return emptyBag();
  const opening = pkg.openings[0];
  const archetype = CHARACTER_ARCHETYPES.observer;
  const runId = uid("run-migrated");
  const state = {
    locationId: (pkg.locations || []).some((item) => item.id === raw.nodeId) ? raw.nodeId : opening.startLocationId,
    clock: { day: Number(raw.day) || 1, hour: Number(raw.time) || 8 },
    stats: { ...archetype.stats },
    conditions: [],
    inventory: normalizeInventory(raw.inventory),
    quests: instantiateQuests(pkg, opening.initialQuestIds),
    npcs: {},
    flags: { ...(raw.flags || {}), legacy_imported: true },
    storySummary: (raw.log || []).slice(-8).map((item) => String(item.text || "")).filter(Boolean).join(" ").slice(-1800) || opening.openingText,
    suggestions: [],
  };
  const turns = (raw.log || []).slice(-80).map((item, index) => ({
    id: uid("legacy-turn"),
    parentTurnId: index ? null : null,
    sequence: index,
    input: item.kind === "action" ? { mode: "do", text: String(item.text || "") } : null,
    candidate: { narration: String(item.text || ""), choices: [], checks: [], effects: [], source: "legacy" },
    resolution: { checks: [], appliedEffects: [] },
    status: "accepted",
    createdAt: String(item.at || nowIso()),
    acceptedAt: String(item.at || nowIso()),
  }));
  const run = normalizeRun({
    id: runId,
    packageId: pkg.id,
    packageVersion: pkg.version,
    openingId: opening.id,
    title: `${pkg.title} · 旧存档迁移`,
    mode: "model",
    branchId: uid("branch"),
    character: { name: "旅人", archetypeId: archetype.id },
    state,
    turns,
    checkpoints: [{ id: uid("checkpoint"), turnId: turns.at(-1)?.id || null, sequence: turns.length - 1, state: clone(state), createdAt: nowIso() }],
  });
  return { schemaVersion: ADVENTURE_SCHEMA_VERSION, activeRunId: run.id, runs: [run], migratedLegacyAt: nowIso() };
}

export function loadAdventureBag() {
  if (memoryBag && !storage()) return normalizeBag(memoryBag);
  const existing = parseRaw(readRaw(ADVENTURE_STORE_KEY));
  if (existing) return normalizeBag(existing);
  const migrated = migrateLegacySave();
  if (migrated.runs.length) return writeBag(migrated);
  return emptyBag();
}

export function listAdventureRuns() {
  return loadAdventureBag().runs.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getAdventureRun(runId) {
  return loadAdventureBag().runs.find((run) => run.id === String(runId || "")) || null;
}

export function getActiveAdventureRun() {
  const bag = loadAdventureBag();
  return bag.runs.find((run) => run.id === bag.activeRunId) || null;
}

export function setActiveAdventureRun(runId) {
  const bag = loadAdventureBag();
  if (!bag.runs.some((run) => run.id === runId)) return null;
  writeBag({ ...bag, activeRunId: runId });
  return getAdventureRun(runId);
}

function saveRun(nextRun, { activate = true } = {}) {
  const bag = loadAdventureBag();
  const run = normalizeRun({ ...nextRun, updatedAt: nowIso() });
  const runs = [run, ...bag.runs.filter((item) => item.id !== run.id)].slice(0, MAX_RUNS);
  writeBag({ ...bag, runs, activeRunId: activate ? run.id : bag.activeRunId });
  return getAdventureRun(run.id);
}

export function createAdventureRun({ packageId, openingId, character = {}, mode } = {}) {
  const pkg = getPackage(packageId);
  if (!pkg) throw new Error("请先创建自己的世界");
  const opening = pkg.openings.find((item) => item.id === openingId) || pkg.openings[0];
  if (!opening) throw new Error("这个世界还没有开场");
  const archetype = CHARACTER_ARCHETYPES[character.archetypeId] || CHARACTER_ARCHETYPES.observer;
  const runId = uid("run");
  const openingTurnId = uid("turn");
  const state = {
    locationId: opening.startLocationId,
    clock: clone(opening.initialClock || { day: 1, hour: 8 }),
    stats: { ...archetype.stats },
    conditions: [],
    inventory: normalizeInventory(opening.initialInventory),
    quests: instantiateQuests(pkg, opening.initialQuestIds),
    npcs: {},
    flags: { ...(opening.initialFlags || {}) },
    storySummary: opening.openingText,
    suggestions: [],
  };
  const openingTurn = {
    id: openingTurnId,
    parentTurnId: null,
    sequence: 0,
    input: null,
    candidate: { narration: opening.openingText, choices: [], checks: [], effects: [], source: "opening" },
    resolution: { checks: [], appliedEffects: [] },
    status: "accepted",
    createdAt: nowIso(),
    acceptedAt: nowIso(),
  };
  const run = normalizeRun({
    id: runId,
    packageId: pkg.id,
    packageVersion: pkg.version,
    openingId: opening.id,
    title: `${pkg.title} · ${opening.title}`,
    mode: pkg.tutorial ? "tutorial" : mode === "tutorial" ? "tutorial" : "model",
    status: "active",
    branchId: uid("branch"),
    character: { name: character.name, pronouns: character.pronouns, archetypeId: archetype.id, archetypeLabel: archetype.label },
    state,
    turns: [openingTurn],
    checkpoints: [{ id: uid("checkpoint"), turnId: openingTurnId, sequence: 0, state: clone(state), createdAt: nowIso() }],
    createdAt: nowIso(),
  });
  return saveRun(run);
}

export function stageAdventureTurn(runId, input, rawCandidate) {
  const run = getAdventureRun(runId);
  if (!run) throw new Error("adventure_run_not_found");
  if (run.pendingTurn) throw new Error("adventure_pending_turn_exists");
  const pkg = getPackage(run.packageId);
  const checked = validateDmCandidate(rawCandidate, pkg, run.state);
  if (!checked.ok) {
    const error = new Error(`DM 返回不符合冒险协议：${checked.errors.join("、")}`);
    error.code = "adventure_candidate_invalid";
    throw error;
  }
  const lastAccepted = [...run.turns].reverse().find((turn) => turn.status === "accepted");
  const pendingTurn = {
    id: uid("turn"),
    parentTurnId: lastAccepted?.id || null,
    sequence: (lastAccepted?.sequence || 0) + 1,
    input: { mode: input.mode, text: String(input.text || "").trim().slice(0, 1600) },
    candidate: checked.value,
    resolution: null,
    status: "pending",
    createdAt: nowIso(),
  };
  return saveRun({ ...run, pendingTurn });
}

export function rejectPendingAdventureTurn(runId) {
  const run = getAdventureRun(runId);
  if (!run?.pendingTurn) return run;
  return saveRun({ ...run, pendingTurn: null });
}

function appendSummary(previous, turn) {
  const checks = (turn.resolution?.checks || []).map((item) => item.text).join(" ");
  return `${previous || ""}\n${turn.input?.text ? `玩家：${turn.input.text}` : ""}\n${turn.candidate?.narration || ""}\n${checks}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(-1800);
}

export function acceptPendingAdventureTurn(runId, { rng = Math.random } = {}) {
  const run = getAdventureRun(runId);
  if (!run?.pendingTurn) throw new Error("adventure_pending_turn_missing");
  const pkg = getPackage(run.packageId);
  const checked = validateDmCandidate(run.pendingTurn.candidate, pkg, run.state);
  if (!checked.ok) throw new Error(`adventure_candidate_invalid:${checked.errors.join(",")}`);

  const unconditional = applyAdventureEffects(pkg, run.state, checked.value.effects);
  const checkResult = resolveAdventureChecks(pkg, unconditional.state, checked.value.checks, rng);
  const rejected = [...unconditional.rejected, ...checkResult.rejected];
  if (rejected.length) throw new Error(`adventure_effect_rejected:${rejected.join(",")}`);

  const acceptedTurn = {
    ...run.pendingTurn,
    candidate: checked.value,
    status: "accepted",
    acceptedAt: nowIso(),
    resolution: {
      checks: checkResult.resolutions,
      appliedEffects: [...unconditional.applied, ...checkResult.applied],
    },
  };
  const nextState = {
    ...checkResult.state,
    suggestions: checked.value.choices,
    storySummary: appendSummary(run.state.storySummary, acceptedTurn),
  };
  const turns = [...run.turns, acceptedTurn].slice(-MAX_TURNS);
  const checkpoint = {
    id: uid("checkpoint"),
    turnId: acceptedTurn.id,
    sequence: acceptedTurn.sequence,
    state: clone(nextState),
    createdAt: nowIso(),
  };
  return saveRun({
    ...run,
    state: nextState,
    turns,
    checkpoints: [...run.checkpoints, checkpoint].slice(-MAX_CHECKPOINTS),
    pendingTurn: null,
  });
}

export function forkAdventureRun(runId, turnId) {
  const source = getAdventureRun(runId);
  if (!source) throw new Error("adventure_run_not_found");
  const targetTurn = source.turns.find((turn) => turn.id === turnId && turn.status === "accepted");
  if (!targetTurn) throw new Error("adventure_turn_not_found");
  const checkpoint = [...source.checkpoints].reverse().find((item) => item.turnId === targetTurn.id || item.sequence <= targetTurn.sequence);
  if (!checkpoint) throw new Error("adventure_checkpoint_not_found");
  const branchNumber = listAdventureRuns().filter((run) => run.parentRunId === source.id).length + 1;
  const branch = normalizeRun({
    ...source,
    id: uid("run"),
    title: `${source.title} · 分支 ${branchNumber}`,
    branchId: uid("branch"),
    parentRunId: source.id,
    parentTurnId: targetTurn.id,
    state: clone(checkpoint.state),
    turns: source.turns.filter((turn) => turn.sequence <= targetTurn.sequence),
    checkpoints: source.checkpoints.filter((item) => item.sequence <= targetTurn.sequence),
    pendingTurn: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return saveRun(branch);
}

export function deleteAdventureRun(runId) {
  const bag = loadAdventureBag();
  const runs = bag.runs.filter((run) => run.id !== runId);
  writeBag({ ...bag, runs, activeRunId: bag.activeRunId === runId ? runs[0]?.id || "" : bag.activeRunId });
  return runs;
}

export function resetAdventureStore() {
  return writeBag(emptyBag());
}

export function exportAdventureBag() {
  return clone(loadAdventureBag());
}

export function importAdventureBag(payload) {
  if (!payload || typeof payload !== "object") throw new Error("adventure_import_invalid");
  return writeBag(payload);
}

export function formatAdventureClock(dayOrClock, maybeHour) {
  const clock = typeof dayOrClock === "object" ? dayOrClock : { day: dayOrClock, hour: maybeHour };
  return `第 ${Math.max(1, Number(clock?.day) || 1)} 天 · ${String(Math.max(0, Math.min(23, Number(clock?.hour) || 0))).padStart(2, "0")}:00`;
}

// V1 compatibility helpers. New code should use run APIs above.
export function loadAdventureSave() {
  const run = getActiveAdventureRun();
  if (!run) return { worldId: "", nodeId: "", log: [], flags: {}, inventory: [], day: 1, time: 8, pendingChoices: null };
  return {
    worldId: run.packageId,
    nodeId: run.state.locationId,
    log: run.turns.map((turn) => ({ at: turn.acceptedAt || turn.createdAt, kind: turn.input ? "action" : "narration", text: turn.input?.text || turn.candidate?.narration || "" })),
    flags: { ...run.state.flags },
    inventory: run.state.inventory.map((item) => item.name),
    day: run.state.clock.day,
    time: run.state.clock.hour,
    pendingChoices: run.state.suggestions,
  };
}

export function startAdventure(worldId, _startNodeId) {
  const pkg = getPackage(worldId);
  if (!pkg?.openings?.length) throw new Error("请先创建自己的世界");
  createAdventureRun({ packageId: pkg.id, openingId: pkg.openings[0].id, character: { name: "", archetypeId: "observer" } });
  return loadAdventureSave();
}

export function saveAdventureSave() {
  return loadAdventureSave();
}

export function appendLog(save) {
  return save;
}

export function advanceTime(save, hours = 1) {
  let day = Number(save?.day) || 1;
  let time = (Number(save?.time) || 8) + Math.max(1, Number(hours) || 1);
  while (time >= 24) { time -= 24; day += 1; }
  return { ...save, day, time };
}

export const resetAdventureSave = resetAdventureStore;
export const exportAdventureSave = exportAdventureBag;
export const importAdventureSave = importAdventureBag;
