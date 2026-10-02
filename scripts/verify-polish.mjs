/**
 * Polish pass checks — ActionPlayer generation, empty timeline, runtime warm, comfort media.
 * Run: node scripts/verify-polish.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
globalThis.document = {
  dispatchEvent() {},
};

const { createDefaultAvatarState, migrateAvatarState, resolveActionForState, findAction } = await import("../src/avatar/looks-model.js");
const { timelineToPlayQueue, createEmptyTimeline } = await import("../src/avatar/timeline.js");
const { createActionPlayer } = await import("../src/runtime/action-player.js");
const { deliveryChecklist } = await import("../src/character-pack/pack-version.js");

const loaders = readFileSync(join(root, "src/lazy/loaders.js"), "utf8");
const characterPage = readFileSync(join(root, "src/avatar/character-page.js"), "utf8");
const phase3 = readFileSync(join(root, "src/avatar/phase3-editor.js"), "utf8");
const overlayApp = readFileSync(join(root, "src/overlay/overlay-app.js"), "utf8");
const overlayWire = readFileSync(join(root, "src/ui/overlay-presence-wire.js"), "utf8");
const companionOverlay = readFileSync(join(root, "src/platform/companion-overlay.js"), "utf8");
const electronMain = readFileSync(join(root, "electron/main.mjs"), "utf8");
const androidPlugin = readFileSync(join(root, "android/app/src/main/java/app/yueqi/companion/overlay/CompanionOverlayPlugin.java"), "utf8");
const androidService = readFileSync(join(root, "android/app/src/main/java/app/yueqi/companion/overlay/OverlayService.java"), "utf8");

check("ensureAvatarRuntime exported", loaders.includes("ensureAvatarRuntime") && characterPage.includes("export function ensureAvatarRuntime"));
check("required actions protected", characterPage.includes("react_tap") && characterPage.includes("REQUIRED_ACTION_IDS"));
check("Editor softTimeline", phase3.includes("softTimeline"));
check("overlay actionDataUrl", overlayApp.includes("actionDataUrl") && overlayWire.includes("actionDataUrl"));
check("no megabyte FileReader fallback", companionOverlay.includes("400 * 1024") && !/readAsDataURL/.test(companionOverlay));
check("electron onboarded first-run", electronMain.includes("onboarded") && electronMain.includes("tray-icon.png"));
check("android isRunning trust service", androidPlugin.includes("OverlayService.isRunning()") && !androidPlugin.includes("prefsRunning"));
check("android JSONObject.quote", androidService.includes("JSONObject.quote"));

const comfort = findAction(createDefaultAvatarState(), "comfort");
check("comfort does not steal reacting", !(comfort?.triggers || []).includes("reacting"));
check("react_tap wins reacting", resolveActionForState(createDefaultAvatarState(), "reacting")?.id === "react_tap");

const withEmptyTl = {
  id: "talking_default",
  mediaId: "m1",
  loop: true,
  durationMs: 0,
  timeline: createEmptyTimeline(),
};
const emptyQ = timelineToPlayQueue(withEmptyTl);
check("empty timeline skips queue", emptyQ.queue.length === 0);

const withSeg = {
  id: "comfort",
  mediaId: "m1",
  loop: false,
  durationMs: 800,
  timeline: {
    enter: { durationMs: 200, mediaId: "e1", fileName: "e.png", expressionId: "" },
    loop: { durationMs: 400, mediaId: "", fileName: "", expressionId: "" },
    exit: { durationMs: 200, mediaId: "", fileName: "", expressionId: "" },
    keyframes: [{ atMs: 100, expressionId: "soft" }],
    soundMediaId: "",
  },
};
check("custom timeline still queues", timelineToPlayQueue(withSeg).queue.length >= 2);

let stages = [];
const player = createActionPlayer({
  getAvatarState: () => ({
    actions: [
      { id: "idle_default", triggers: ["idle"], mediaId: "idle", loop: true, priority: 0, interruptible: true },
      { id: "comfort", triggers: ["comfort"], mediaId: "c", loop: false, durationMs: 50, priority: 25, interruptible: true },
      { id: "react_tap", triggers: ["reacting", "tap"], mediaId: "r", loop: false, durationMs: 50, priority: 20, interruptible: true },
    ],
  }),
  resolveMediaUrl: async (id) => `url:${id}`,
  onChange: (snap) => stages.push(snap.actionId),
});
await player.comfort();
await player.react("react_tap");
await new Promise((r) => setTimeout(r, 30));
check("generation allows interrupt to react_tap", stages.includes("react_tap"));

const bare = createDefaultAvatarState();
const checklist = deliveryChecklist(bare);
const mediaCheck = checklist.checks.find((c) => c.id === "action_media");
check("checklist requires comfort media", mediaCheck && mediaCheck.ok === false);

const withMedia = migrateAvatarState({
  ...bare,
  actions: bare.actions.map((a) => (
    ["idle_default", "talking_default", "comfort"].includes(a.id)
      ? { ...a, mediaId: `m-${a.id}` }
      : a
  )),
});
check("checklist passes with media", deliveryChecklist(withMedia).checks.find((c) => c.id === "action_media")?.ok === true);

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error("Failed:", failed.map((c) => c.name).join(", "));
  process.exit(1);
}
