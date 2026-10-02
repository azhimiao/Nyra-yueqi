/**
 * C4 — Scenario player contract + journey (automatable).
 * Journey: pick script → ≥4 turns → pause → refresh → resume → finale (idempotent).
 * Does not self-sign L3 product acceptance.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const memory = {
  _data: {},
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null;
  },
  setItem(key, value) {
    this._data[key] = String(value);
  },
  removeItem(key) {
    delete this._data[key];
  },
  clear() {
    this._data = {};
  },
};

globalThis.window = {
  localStorage: memory,
};

const requiredFiles = [
  "src/scenario/runtime/schema.js",
  "src/scenario/runtime/state-machine.js",
  "src/scenario/runtime/director-adapter.js",
  "src/scenario/runtime/action-mapper.js",
  "src/scenario/runtime/persistence.js",
  "src/scenario/player/player-ui.js",
  "src/scenario/player/stage-renderer.js",
  "src/scenario/player/dialogue-layer.js",
  "src/scenario/player/choice-layer.js",
  "src/scenario/player/controls.js",
  "src/scenario/library/index.js",
  "src/scenario/presets.js",
  "src/scenario/theater-ui.js",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const theater = readFileSync(join(root, "src/scenario/theater-ui.js"), "utf8");
check(
  "theater-ui re-exports single player",
  theater.includes('from "./player/player-ui.js"') && !theater.includes("let lastChoices"),
);

const playerUi = readFileSync(join(root, "src/scenario/player/player-ui.js"), "utf8");
check("player has stage figure path", playerUi.includes("createStageRenderer"));
check("player no alert/confirm main UI", !/\balert\s*\(/.test(playerUi) && !/\bconfirm\s*\(/.test(playerUi));
check("player commits via persistence", playerUi.includes("commitFinaleMemory"));
check("player pause/resume", playerUi.includes("pauseScenarioRun") && playerUi.includes("resumeScenarioRun"));

const {
  normalizeScenarioTurn,
  safeOfflineTurn,
  SCENARIO_TURN_SCHEMA_VERSION,
} = await import("../src/scenario/runtime/schema.js");
const {
  canTransition,
  transitionPhase,
  phaseAfterTurn,
  phaseFromRun,
  normalizePhase,
} = await import("../src/scenario/runtime/state-machine.js");
const { mapStageAction, applyActionWhitelist, resolveBackground } = await import(
  "../src/scenario/runtime/action-mapper.js"
);
const {
  offlineDirectorTurn,
  parseDirectorOutput,
  beatsFromScenarioTurn,
} = await import("../src/scenario/runtime/director-adapter.js");
const {
  applyTurnToRunState,
  pauseScenarioRun,
  resumeScenarioRun,
  commitFinaleMemory,
} = await import("../src/scenario/runtime/persistence.js");
const {
  startRun,
  getRun,
  getActiveRun,
  appendBeats,
  saveRun,
  SCENARIO_STORE_KEY,
  listScripts,
} = await import("../src/scenario/store.js");
const { SCENARIO_PRESETS, getPresetBeats } = await import("../src/scenario/presets.js");
const { listLibraryItems } = await import("../src/scenario/library/index.js");
const { listCohabitEvents } = await import("../src/memory/cohabit-timeline.js");

check("schema version is 1", SCENARIO_TURN_SCHEMA_VERSION === 1);

const bad = normalizeScenarioTurn(null);
check("normalize rejects null", bad.ok === false && bad.value === null);

const safe = safeOfflineTurn({ speakerId: "char-xingli", sceneId: "script-rain-station" });
check("safe offline turn has dialogue", Boolean(safe?.dialogue));
check("safe offline turn has ≥2 choices", (safe?.choices || []).length >= 2);

const mappedUnknown = mapStageAction({ actionId: "not_a_real_action_zzz", emotion: "warm" });
check(
  "unknown action maps to scenario semantic fallback",
  mappedUnknown.actionId === "talk" && !("poseUrl" in mappedUnknown),
);

const unknownTurn = applyActionWhitelist({
  dialogue: "hi",
  actionId: "totally_fake",
  expressionId: "nope",
  emotion: "warm",
});
check("whitelist attaches asset-free stage semantics", Boolean(unknownTurn._stage?.actionId) && !("poseUrl" in unknownTurn._stage));

check("background rain_station", resolveBackground("rain_station").id === "rain_station");
check("background mood night → rooftop", resolveBackground("", "night").id === "rooftop_night");

check("phase library→setup ok", canTransition("library", "setup"));
check("phase playing→paused ok", canTransition("playing", "paused"));
check("phase library→finale illegal", !canTransition("library", "finale"));
check(
  "transition rejects illegal",
  transitionPhase("library", "finale").ok === false,
);

const broken = parseDirectorOutput("{not json", { tension: 1, sceneId: "script-rain-station" });
check("bad JSON fails honestly without offline dialogue", broken?.ok === false && !broken?.dialogue);

const flagship = ["script-rain-station", "script-rooftop", "script-cafe"];
for (const id of flagship) {
  const beats = getPresetBeats(id);
  const script = SCENARIO_PRESETS.find((s) => s.id === id);
  check(`${id} has ≥5 beats`, beats.length >= 5, String(beats.length));
  check(`${id} has ≥2 endings`, (script?.endings || []).length >= 2);
  const actions = new Set(beats.map((b) => b.actionId).filter(Boolean));
  const exprs = new Set(beats.map((b) => b.expressionId).filter(Boolean));
  check(`${id} ≥3 actions`, actions.size >= 3, [...actions].join(","));
  check(`${id} ≥3 expressions`, exprs.size >= 3, [...exprs].join(","));
}

check("library lists presets", listLibraryItems().length >= 3);
check("listScripts includes rain station", listScripts().some((s) => s.id === "script-rain-station"));

// —— Journey: deterministic director ——
memory.clear();
const cast = { leadId: "char-xingli", memberIds: ["char-xingli"] };
let run = startRun({ scriptId: "script-rain-station", cast });
check("startRun active opening", run.status === "active" && (run.phase === "opening" || run.directorState?.phase === "opening"));

const actionTrail = [];
function advanceOffline(userText) {
  const current = getRun(run.id);
  if (userText) {
    appendBeats(run.id, [{
      id: `u-${Date.now()}-${Math.random().toString(16).slice(2, 5)}`,
      at: Date.now(),
      kind: "choice",
      text: userText,
    }]);
  }
  const turn = offlineDirectorTurn(getRun(run.id), userText);
  actionTrail.push(turn.actionId || turn._stage?.actionId);
  appendBeats(run.id, beatsFromScenarioTurn(turn));
  const latest = getRun(run.id);
  const directorState = applyTurnToRunState(latest, turn);
  const nextPhase = phaseAfterTurn(turn, { beatCount: (latest.beats || []).length });
  run = saveRun({
    ...latest,
    phase: nextPhase,
    directorState: { ...directorState, phase: nextPhase },
  });
  return turn;
}

const t1 = advanceOffline("");
const t2 = advanceOffline(t1.choices?.[0]?.text || "靠近一点");
const t3 = advanceOffline(t2.choices?.[1]?.text || "轻轻问一句");
const t4 = advanceOffline("今晚雨好大"); // free say
check("≥4 director turns", Boolean(t1 && t2 && t3 && t4));
check(
  "scripted beat cursor advanced",
  Number(getRun(run.id).directorState?.beatCursor) >= 4,
  String(getRun(run.id).directorState?.beatCursor),
);
const uniqueActions = new Set(actionTrail.filter(Boolean));
check("≥3 action changes across turns", uniqueActions.size >= 3, [...uniqueActions].join(","));

const beatsBeforePause = (getRun(run.id).beats || []).length;
pauseScenarioRun(run.id);
check("paused status", getRun(run.id).status === "paused");
check("paused phase", normalizePhase(phaseFromRun(getRun(run.id))) === "paused");

// Simulate refresh: re-hydrate from localStorage snapshot
const snapshot = memory.getItem(SCENARIO_STORE_KEY);
check("persisted bag after pause", Boolean(snapshot));
memory.clear();
memory.setItem(SCENARIO_STORE_KEY, snapshot);
const active = getActiveRun();
check("refresh finds active/paused run", active?.id === run.id && active.status === "paused");
check("refresh restores beats", (active.beats || []).length === beatsBeforePause);

const resumed = resumeScenarioRun(active.id);
check("resume active", resumed.status === "active");
check("resume leaves paused", phaseFromRun(resumed) !== "paused");

// One more turn then finale
advanceOffline("再站一会儿");
run = getRun(run.id);
run = saveRun({
  ...run,
  status: "ended",
  phase: "finale",
  summary: "夜雨车站，伞下并肩等车。",
  directorState: { ...run.directorState, phase: "finale", memoryCandidate: "夜雨车站，伞下并肩等车。" },
});

const commit1 = await commitFinaleMemory(run.id, "夜雨车站，伞下并肩等车。");
check("finale commit ok", commit1.ok === true, commit1.error || "");
check("finale not already committed first time", commit1.alreadyCommitted !== true);
const after1 = getRun(run.id);
check("memoryCommitted flag", after1?.memoryCommitted === true);
check("phase memory_commit", phaseFromRun(after1) === "memory_commit");

const events = listCohabitEvents({ characterId: "char-xingli", limit: 20 });
const finales = events.filter((e) => e.kind === "finale" && e.meta?.runId === run.id);
check("cohabit finale written", finales.length >= 1, String(finales.length));

const commit2 = await commitFinaleMemory(run.id, "夜雨车站，伞下并肩等车。");
check("finale idempotent", commit2.ok === true && commit2.alreadyCommitted === true);
const finales2 = listCohabitEvents({ characterId: "char-xingli", limit: 40 })
  .filter((e) => e.kind === "finale" && e.meta?.runId === run.id);
check("finale not duplicated on re-commit", finales2.length === finales.length, `${finales2.length} vs ${finales.length}`);

// Pop-facing summary exists on event
check(
  "finale summary usable for Pop",
  Boolean(finales[0]?.summary) && finales[0].summary.includes("谢幕"),
);

const failed = checks.filter((c) => !c.pass);
console.log(`\nverify:core-c4 ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.error("Failed:", failed.map((f) => f.name).join("; "));
  process.exit(1);
}
