/**
 * Phase 3 — Editor B, action packs, expressions/scenes, versioning.
 * Run: node scripts/verify-phase3.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { readAppBundle } from "./lib/app-sources.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

globalThis.window = {
  localStorage: { _data: {}, getItem(k) { return this._data[k] ?? null; }, setItem(k, v) { this._data[k] = String(v); } },
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};

const { migrateAvatarState, createDefaultAvatarState, normalizeAction } = await import("../src/avatar/looks-model.js");
const { timelineToPlayQueue, normalizeTimeline } = await import("../src/avatar/timeline.js");
const { resolveActionFromExpression } = await import("../src/avatar/expressions.js");
const { resolveSceneTrigger, inferSceneFromStatus } = await import("../src/runtime/scene-triggers.js");
const {
  bumpPackVersion,
  pushPackHistory,
  rollbackPack,
  deliveryChecklist,
  applyPackUpgrade,
} = await import("../src/character-pack/pack-version.js");
const { exportActionPackZip, parseActionPackZip } = await import("../src/character-pack/action-pack-io.js");
const { createActionPlayer } = await import("../src/runtime/action-player.js");

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const appJs = readAppBundle(root);
const phase3Editor = readFileSync(join(root, "src/avatar/phase3-editor.js"), "utf8");

check("Editor B UI", indexHtml.includes("data-timeline-editor"));
check("Expression UI", indexHtml.includes("data-expression-list") && indexHtml.includes("data-expression-add"));
check("Scene UI", indexHtml.includes("data-scene-list") && indexHtml.includes("data-scene-add"));
check("Action pack IO UI", indexHtml.includes("data-export-action-pack") && indexHtml.includes("data-import-action-pack"));
check("Version/rollback UI", indexHtml.includes("data-pack-rollback") && indexHtml.includes("data-delivery-checklist"));
check("Delivery checklist doc", existsSync(join(root, "docs/CHARACTER_PACK_DELIVERY_CHECKLIST.md")));
check("phase3 editor module", phase3Editor.includes("wirePhase3Editor"));
check("App wires proactive scene", appJs.includes("applyScene(\"proactive\"") || appJs.includes("applyScene('proactive'"));

const fresh = createDefaultAvatarState();
check("schemaVersion >= 3", fresh.schemaVersion >= 3);
check("default comfort action", fresh.actions.some((a) => a.id === "comfort"));
check("default expressions", fresh.expressions.length >= 2);
check("default proactive scene", fresh.sceneTriggers.some((s) => s.scene === "proactive"));

const migrated = migrateAvatarState({
  schemaVersion: 2,
  looks: [{ id: "a", name: "A", mediaId: "m1", fileName: "a.png" }],
  currentLookId: "a",
  actions: [{ id: "idle_default", name: "待机", triggers: ["idle"] }],
});
check("migrate adds comfort + expressions", migrated.schemaVersion >= 3 && migrated.actions.some((a) => a.id === "comfort") && migrated.expressions.length >= 1);

const action = normalizeAction({
  id: "comfort",
  name: "安慰",
  mediaId: "x",
  timeline: {
    enter: { durationMs: 200, mediaId: "enter-x" },
    loop: { durationMs: 800, mediaId: "loop-x" },
    exit: { durationMs: 200, mediaId: "exit-x" },
  },
});
const queue = timelineToPlayQueue(action);
check("timeline queue has stages", queue.queue.length >= 2 && queue.queue[0].stage === "enter");

const emptyTimelineQueue = timelineToPlayQueue(normalizeAction({
  id: "talking_default",
  mediaId: "t",
  loop: true,
  timeline: { enter: { durationMs: 280 }, loop: { durationMs: 0 }, exit: { durationMs: 220 } },
}));
check("default empty timeline skips queue", emptyTimelineQueue.queue.length === 0);

check("expression maps to action", resolveActionFromExpression(fresh, "comfort_look") === "comfort");
check("scene proactive resolves", resolveSceneTrigger(fresh, "proactive")?.actionId === "comfort");
check("infer sleep scene", inferSceneFromStatus({ asleep: true }) === "sleep");

const v2 = bumpPackVersion("1.2.3", "minor");
check("bump minor version", v2 === "1.3.0");

const withHistory = pushPackHistory(fresh, "test");
const upgraded = applyPackUpgrade(withHistory, {
  ...fresh,
  packMeta: { ...fresh.packMeta, name: "新包" },
  looks: [{ id: "n", name: "新", mediaId: "1", fileName: "n.png" }],
}, { version: "2.0.0" });
check("upgrade keeps history", upgraded.packHistory?.length >= 1 && upgraded.packMeta.version === "2.0.0");
const rolled = rollbackPack(upgraded, 0);
check("rollback restores prior", rolled.looks?.[0]?.id === fresh.looks[0].id || rolled.packMeta?.rolledBackAt);

const checklist = deliveryChecklist(fresh);
check("delivery checklist runs", Array.isArray(checklist.checks) && checklist.checks.length >= 5);

const zipBytes = await exportActionPackZip(fresh, { getMediaBlob: async () => null, packName: "测试动作包" });
const parsed = parseActionPackZip(zipBytes);
check("action pack zip roundtrip", parsed.manifest.kind === "yueqi-action-pack" && parsed.actions.length >= 3);

let stage = "";
const player = createActionPlayer({
  getAvatarState: () => fresh,
  resolveMediaUrl: async () => "",
  onChange: (snap) => { stage = snap.stage || snap.playState; },
});
await player.comfort();
check("ActionPlayer comfort/timeline", player.getState().actionId === "comfort");

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`Phase 3 verification failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`Phase 3 verification passed: ${checks.length}/${checks.length}`);
