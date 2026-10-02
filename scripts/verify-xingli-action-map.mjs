import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(
  path.join(root, "public", "assets", "characters", "xingli", "manifest.json"),
  "utf8",
));
const {
  XINGLI_ACTION_ALIASES,
  XINGLI_ACTIONS,
  XINGLI_ACTION_CATALOG,
  XINGLI_ACTION_IDS,
  XINGLI_ACTION_GROUPS,
  XINGLI_ACTION_LABELS,
  XINGLI_MANIFEST_URL,
  XINGLI_REPLY_ACTION_IDS,
  canTriggerXingliAction,
  getXingliAction,
  listXingliActions,
  normalizeXingliActionId,
  resolveXingliAction,
  resolveXingliClip,
  resolveXingliClipId,
} = await import("../src/avatar/xingli-action-map.js");

const clip = (state) => resolveXingliClip(state).clipId;

const checks = [];
function check(name, operation) {
  try {
    operation();
    checks.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    checks.push({ name, pass: false });
    console.error(`FAIL  ${name} - ${error.message}`);
  }
}

check("catalog exactly covers runtime manifest clips", () => {
  assert.deepEqual(
    XINGLI_ACTION_CATALOG.map((item) => item.id).sort(),
    Object.keys(manifest.clips).sort(),
  );
  assert.equal(XINGLI_ACTIONS, XINGLI_ACTION_CATALOG);
  assert.deepEqual([...XINGLI_ACTION_IDS].sort(), Object.keys(manifest.clips).sort());
  assert.equal(XINGLI_MANIFEST_URL, "/assets/characters/xingli/manifest.json");
});

check("every action has group, label, playback and scene metadata", () => {
  for (const item of XINGLI_ACTION_CATALOG) {
    assert.ok(XINGLI_ACTION_GROUPS[item.group]);
    assert.equal(XINGLI_ACTION_LABELS[item.id], item.label);
    assert.ok(item.label.length >= 2);
    assert.equal(item.playback, item.loop ? "loop" : "once");
    assert.ok(Array.isArray(item.scenes));
  }
});

check("catalog loop flags match generated manifest", () => {
  for (const item of XINGLI_ACTION_CATALOG) {
    assert.equal(item.loop, manifest.clips[item.id].playback === "loop", item.id);
  }
});

check("legacy action ids normalize to Xingli clips", () => {
  assert.equal(normalizeXingliActionId("idle_default"), "idle_loop");
  assert.equal(normalizeXingliActionId("talking_default"), "talk_loop");
  assert.equal(normalizeXingliActionId("sleep_pose"), "sleep_loop");
  assert.equal(XINGLI_ACTION_ALIASES.comfort_look, "comfort");
  assert.equal(normalizeXingliActionId("../drag"), "");
});

check("play states resolve deterministically", () => {
  assert.equal(clip({ playState: "idle" }), "idle_loop");
  assert.equal(clip({ playState: "talking", actionId: "talking_default" }), "talk_loop");
  assert.equal(clip({ playState: "listening" }), "listen");
  assert.equal(clip({ playState: "thinking" }), "thinking");
  assert.equal(clip({ playState: "capturing" }), "thinking");
  assert.equal(clip({ playState: "sleep" }), "sleep_loop");
  assert.equal(resolveXingliClipId({ playState: "listening" }), "listen");
});

check("asleep only overrides passive states", () => {
  assert.equal(clip({ playState: "idle", asleep: true }), "sleep_loop");
  assert.equal(clip({ playState: "talking", asleep: true }), "talk_loop");
});

check("explicit reply actions beat generic talking state", () => {
  assert.equal(clip({ playState: "talking", actionId: "comfort" }), "comfort");
  assert.equal(clip({ playState: "talking", actionId: "selfie" }), "selfie");
});

check("reply emotion is used only as a reacting fallback", () => {
  assert.equal(clip({ playState: "reacting", emotion: "shy" }), "shy_look_away");
  assert.equal(clip({ playState: "reacting", emotion: "sad" }), "comfort");
  assert.equal(clip({ playState: "reacting", emotion: "unknown" }), "react_tap");
  assert.equal(clip({ playState: "idle", emotion: "shy" }), "idle_loop");
});

check("restricted movement clips cannot be selected by ordinary replies", () => {
  for (const id of ["drag", "stand_to_sit", "sit_to_sleep"]) {
    assert.equal(canTriggerXingliAction(id, "reply"), false, id);
    assert.equal(XINGLI_REPLY_ACTION_IDS.includes(id), false, id);
    assert.notEqual(clip({ playState: "reacting", actionId: id }), id, id);
  }
});

check("restricted movement clips require their trusted source", () => {
  assert.equal(clip({ actionId: "drag", source: "gesture" }), "drag");
  assert.equal(clip({ actionId: "stand_to_sit", source: "manual" }), "stand_to_sit");
  assert.equal(clip({ actionId: "sit_to_sleep", source: "scene" }), "sit_to_sleep");
  assert.equal(clip({ playState: "dragging", source: "reply" }), "idle_loop");
});

check("welcome-home remains a scene action", () => {
  assert.equal(clip({ actionId: "welcome_home", source: "reply" }), "idle_loop");
  assert.equal(clip({ actionId: "welcome_home", source: "scene" }), "welcome_home");
  assert.deepEqual(getXingliAction("welcome_home").scenes, ["welcome_home"]);
});

check("list helper filters safe user-selectable actions", () => {
  const replyActions = listXingliActions({ source: "reply" });
  assert.ok(replyActions.some((item) => item.id === "comfort"));
  assert.ok(replyActions.every((item) => item.replyEligible));
  assert.ok(listXingliActions({ group: "posture" }).every((item) => item.group === "posture"));
});

check("descriptor resolver returns immutable catalog entry", () => {
  const descriptor = resolveXingliAction({ playState: "talking" });
  assert.equal(descriptor.id, "talk_loop");
  assert.equal(Object.isFrozen(descriptor), true);
  assert.deepEqual(resolveXingliClip({ actionId: "stand_to_sit", source: "manual" }), {
    clipId: "stand_to_sit",
    playback: "once",
    returnClip: "sit_idle",
    action: getXingliAction("stand_to_sit"),
  });
});

const failed = checks.filter((item) => !item.pass);
console.log(`\nXingli action map verification: ${checks.length - failed.length}/${checks.length} passed.`);
if (failed.length) process.exitCode = 1;
