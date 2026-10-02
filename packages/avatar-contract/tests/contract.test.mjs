import assert from "node:assert/strict";
import {
  validateCharacterSpec,
  validateAvatarManifest,
  validateEmbodimentState,
  V1_ACTIONS,
  JOB_STATES,
  EMOTIONS,
  MODES,
  RENDERER_ID,
  VISUAL_PROTOCOL,
  ACTION_META,
  KEYFRAME_RANGE,
} from "../src/index.mjs";

assert.deepEqual(JOB_STATES, [
  "created",
  "identity_generating",
  "awaiting_identity_lock",
  "canonical_generating",
  "actions_generating",
  "face_pack_generating",
  "matting",
  "registering",
  "quality_checking",
  "packaging",
  "ready",
  "failed",
  "cancelled",
]);

assert.deepEqual(V1_ACTIONS, [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "happy",
  "concerned",
  "sleeping",
  "tap_react",
  "show_artifact",
  "enter",
  "exit",
]);

assert.equal(RENDERER_ID, "sprite_motion_pack");
assert.equal(VISUAL_PROTOCOL.background, "#B8B8B8");
assert.equal(VISUAL_PROTOCOL.headRatio, "4.5-5.2");
assert.ok(VISUAL_PROTOCOL.forbidden.includes("photoreal"));
assert.ok(MODES.includes("speaking"));
assert.ok(EMOTIONS.includes("embarrassed"));

for (const id of V1_ACTIONS) {
  const meta = ACTION_META[id];
  assert.ok(meta, `ACTION_META missing ${id}`);
  assert.ok(meta.playback === "loop" || meta.playback === "once");
  assert.ok(
    meta.keyframes >= KEYFRAME_RANGE.min && meta.keyframes <= KEYFRAME_RANGE.max,
    `${id} keyframes must be 1–3`,
  );
}

const goodSpec = {
  schemaVersion: 1,
  characterId: "demo_quiet",
  displayName: "文静",
  visual: {
    artStyle: "cel",
    bodyProportion: "semi_chibi_adult",
    hair: "long black",
    eyes: "amber",
    face: "round",
    outfit: "cream dress",
    accessories: [],
    palette: ["#7eb89a", "#ffd8c8"],
  },
  personalityMotion: {
    energy: 0.3,
    shyness: 0.7,
    expressiveness: 0.4,
    blinkRate: 0.5,
    gazeAvoidance: 0.4,
    reactionSpeed: 0.4,
  },
};

assert.equal(validateCharacterSpec(goodSpec).ok, true);
assert.equal(validateCharacterSpec({ ...goodSpec, schemaVersion: 2 }).ok, false);
assert.equal(
  validateCharacterSpec({
    ...goodSpec,
    personalityMotion: { ...goodSpec.personalityMotion, energy: 1.5 },
  }).ok,
  false,
);
assert.equal(
  validateCharacterSpec({
    ...goodSpec,
    visual: { ...goodSpec.visual, bodyProportion: "chibi" },
  }).ok,
  false,
);

const frames = Object.fromEntries(
  V1_ACTIONS.map((id) => [id, { playback: "loop", frames: [`actions/${id}/frame-01.png`] }]),
);
const manifest = {
  schemaVersion: 1,
  avatarId: "demo_quiet_v1",
  characterId: "demo_quiet",
  identityVersion: 1,
  renderer: RENDERER_ID,
  qualityTier: "D",
  publishable: false,
  canvas: { width: 1024, height: 1024, baselineY: 900, centerX: 512 },
  actions: frames,
  face: { qualityTier: "D", anchors: {}, layers: {} },
  props: {},
  hitboxes: [],
  motionProfile: {
    breathAmp: 0.01,
    swayAmp: 0.01,
    blinkRate: 0.5,
    gazeAvoidance: 0.2,
    reactionSpeed: 0.4,
  },
  assetsHash: "abc",
};
assert.equal(validateAvatarManifest(manifest).ok, true);
assert.equal(validateAvatarManifest({ ...manifest, renderer: "live2d" }).ok, false);
assert.equal(validateAvatarManifest({ ...manifest, renderer: "rive" }).ok, false);
assert.equal(validateAvatarManifest({ ...manifest, actions: {} }).ok, false);

assert.equal(
  validateEmbodimentState({
    mode: "speaking",
    emotion: "happy",
    intensity: 0.5,
    gazeX: 0,
    gazeY: 0,
    mouthOpen: 0.4,
  }).ok,
  true,
);
assert.equal(
  validateEmbodimentState({
    mode: "dancing",
    emotion: "happy",
    intensity: 0.5,
    gazeX: 0,
    gazeY: 0,
    mouthOpen: 0.4,
  }).ok,
  false,
);
assert.equal(
  validateEmbodimentState({
    mode: "idle",
    emotion: "happy",
    intensity: 0.5,
    gazeX: 0,
    gazeY: 0,
    mouthOpen: 0.4,
    artifact: { artifactId: "a1", type: "diary", previewUrl: "", deepLink: "" },
  }).ok,
  false,
);

console.log(JSON.stringify({ ok: true, suite: "avatar-contract", gate: "contract_green" }));
