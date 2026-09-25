/** @typedef {import('./types.d.ts').CharacterSpec} CharacterSpec */
/** @typedef {import('./types.d.ts').AvatarManifest} AvatarManifest */
/** @typedef {import('./types.d.ts').EmbodimentState} EmbodimentState */

export const SCHEMA_VERSION = 1;
export const RENDERER_ID = "sprite_motion_pack";

/** V1 actions may only ship 1–3 real keyframes (no duplicated fake frames). */
export const KEYFRAME_RANGE = Object.freeze({ min: 1, max: 3 });

export const JOB_STATES = [
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
];

export const V1_ACTIONS = [
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
];

/** Default action catalog: playback + suggested real keyframe count (1–3). */
export const ACTION_META = {
  idle: { playback: "loop", keyframes: 2 },
  listening: { playback: "loop", keyframes: 2 },
  thinking: { playback: "loop", keyframes: 2 },
  speaking: { playback: "loop", keyframes: 2 },
  happy: { playback: "once", returnAction: "idle", keyframes: 2 },
  concerned: { playback: "once", returnAction: "idle", keyframes: 2 },
  sleeping: { playback: "loop", keyframes: 2 },
  tap_react: { playback: "once", returnAction: "idle", keyframes: 2 },
  show_artifact: { playback: "once", returnAction: "idle", keyframes: 2 },
  enter: { playback: "once", returnAction: "idle", keyframes: 1 },
  exit: { playback: "once", returnAction: "idle", keyframes: 1 },
};

for (const [id, meta] of Object.entries(ACTION_META)) {
  if (meta.keyframes < KEYFRAME_RANGE.min || meta.keyframes > KEYFRAME_RANGE.max) {
    throw new Error(`ACTION_META.${id}.keyframes out of ${KEYFRAME_RANGE.min}-${KEYFRAME_RANGE.max}`);
  }
}

export const MODES = ["idle", "listening", "thinking", "speaking", "sleeping"];
export const EMOTIONS = [
  "neutral",
  "happy",
  "concerned",
  "sad",
  "annoyed",
  "embarrassed",
  "surprised",
];

export const VISUAL_PROTOCOL = {
  background: "#B8B8B8",
  bodyProportion: "semi_chibi_adult",
  headRatio: "4.5-5.2",
  view: "front_or_slight_three_quarter",
  displayHeightPx: [280, 520],
  canvas: 1024,
  forbidden: [
    "quadruped",
    "extreme_perspective",
    "complex_wings",
    "multi_tails",
    "skirt_hiding_legs",
    "hands_blocking_face",
    "photoreal",
    "multi_character",
    "transparent_or_checker_bg",
    "watermark_text",
  ],
};

function unit01(n, path, errors) {
  if (typeof n !== "number" || Number.isNaN(n) || n < 0 || n > 1) {
    errors.push(`${path} must be number 0..1`);
  }
}

export function validateCharacterSpec(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object") return { ok: false, errors: ["not an object"] };
  if (obj.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!obj.characterId || typeof obj.characterId !== "string") errors.push("characterId required");
  if (!obj.displayName) errors.push("displayName required");
  if (!obj.visual) errors.push("visual required");
  else {
    if (obj.visual.bodyProportion !== "semi_chibi_adult") {
      errors.push('visual.bodyProportion must be "semi_chibi_adult"');
    }
    for (const k of ["artStyle", "hair", "eyes", "face", "outfit"]) {
      if (!obj.visual[k]) errors.push(`visual.${k} required`);
    }
    if (!Array.isArray(obj.visual.accessories)) errors.push("visual.accessories array required");
    if (!Array.isArray(obj.visual.palette)) errors.push("visual.palette array required");
  }
  if (!obj.personalityMotion) errors.push("personalityMotion required");
  else {
    for (const k of [
      "energy",
      "shyness",
      "expressiveness",
      "blinkRate",
      "gazeAvoidance",
      "reactionSpeed",
    ]) {
      unit01(obj.personalityMotion[k], `personalityMotion.${k}`, errors);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateAvatarManifest(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object") return { ok: false, errors: ["not an object"] };
  if (obj.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!obj.avatarId) errors.push("avatarId required");
  if (!obj.characterId) errors.push("characterId required");
  if (obj.renderer !== RENDERER_ID) errors.push(`renderer must be ${RENDERER_ID}`);
  if (!["A", "B", "C", "D"].includes(obj.qualityTier)) errors.push("qualityTier invalid");
  if (typeof obj.publishable !== "boolean") errors.push("publishable boolean required");
  if (!obj.canvas?.width || !obj.canvas?.height) errors.push("canvas size required");
  if (!obj.actions || typeof obj.actions !== "object") errors.push("actions required");
  else {
    for (const id of V1_ACTIONS) {
      if (!obj.actions[id]?.frames?.length) errors.push(`actions.${id}.frames required`);
    }
  }
  if (!obj.face) errors.push("face required");
  if (!obj.motionProfile) errors.push("motionProfile required");
  if (!obj.assetsHash) errors.push("assetsHash required");
  return { ok: errors.length === 0, errors };
}

export function validateEmbodimentState(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object") return { ok: false, errors: ["not an object"] };
  if (!MODES.includes(obj.mode)) errors.push("mode invalid");
  if (!EMOTIONS.includes(obj.emotion)) errors.push("emotion invalid");
  unit01(obj.intensity, "intensity", errors);
  unit01(obj.mouthOpen, "mouthOpen", errors);
  if (typeof obj.gazeX !== "number" || typeof obj.gazeY !== "number") {
    errors.push("gazeX/gazeY numbers required");
  }
  if (obj.artifact) {
    if (!obj.artifact.artifactId) errors.push("artifact.artifactId required");
    if (!obj.artifact.deepLink) errors.push("artifact.deepLink required");
  }
  return { ok: errors.length === 0, errors };
}

export function modeToDefaultAction(mode) {
  const map = {
    idle: "idle",
    listening: "listening",
    thinking: "thinking",
    speaking: "speaking",
    sleeping: "sleeping",
  };
  return map[mode] || "idle";
}
