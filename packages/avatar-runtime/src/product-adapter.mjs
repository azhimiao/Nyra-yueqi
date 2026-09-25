/**
 * Maps Yueqi product events → EmbodimentState for pet-v2.
 * Pet must NOT own personality/memory/DB.
 */
import { validateEmbodimentState, modeToDefaultAction } from "../../avatar-contract/src/index.mjs";

const ARTIFACT_PROP = {
  photo: "photo",
  diary: "diary",
  book: "book",
  gift: "gift",
  message: "diary",
};

/**
 * @returns {import('../../avatar-contract/src/types.d.ts').EmbodimentState}
 */
export function createIdleEmbodiment(overrides = {}) {
  return {
    mode: "idle",
    emotion: "neutral",
    intensity: 0.3,
    gazeX: 0,
    gazeY: 0,
    mouthOpen: 0,
    ...overrides,
  };
}

/** RMS 0..1 → mouthOpen with hysteresis helper */
export function mouthFromAmplitude(rms, prev = 0) {
  const x = Math.max(0, Math.min(1, Number(rms) || 0));
  let target = 0;
  if (x < 0.12) target = 0;
  else if (x < 0.3) target = 0.25;
  else if (x < 0.6) target = 0.55;
  else target = 0.85;
  // hysteresis: avoid flicker
  if (Math.abs(target - prev) < 0.08) return prev;
  return target;
}

/**
 * @param {{ type: string, payload?: any }} event
 * @param {object} prev previous EmbodimentState
 */
export function reduceProductEvent(event, prev = createIdleEmbodiment()) {
  const type = event?.type || "";
  const p = event?.payload || {};
  let next = { ...prev };

  switch (type) {
    case "pop.generating":
    case "pop.start":
      next = { ...next, mode: "thinking", emotion: "neutral", intensity: 0.5, mouthOpen: 0 };
      break;
    case "pop.tts_start":
    case "speech.start":
      next = {
        ...next,
        mode: "speaking",
        emotion: p.emotion || next.emotion || "neutral",
        intensity: Math.max(0.4, next.intensity || 0.4),
        mouthOpen: mouthFromAmplitude(p.amplitude ?? 0.4, prev.mouthOpen),
      };
      break;
    case "speech.amplitude":
      next = {
        ...next,
        mode: "speaking",
        mouthOpen: mouthFromAmplitude(p.amplitude, prev.mouthOpen),
      };
      break;
    case "pop.tts_end":
    case "speech.end":
    case "pop.done":
      next = { ...next, mode: "idle", mouthOpen: 0, intensity: 0.3 };
      delete next.artifact;
      break;
    case "artifact.ready": {
      const kind = p.type || "diary";
      if (!p.artifactId || !p.deepLink) {
        throw new Error("artifact.ready requires artifactId + deepLink to concrete entity");
      }
      if (p.deepLink === "/" || p.deepLink === "/phone" || p.deepLink === "#phone") {
        throw new Error("deepLink must open concrete artifact, not phone home");
      }
      next = {
        ...next,
        mode: "idle",
        emotion: kind === "gift" ? "happy" : "neutral",
        intensity: 0.55,
        mouthOpen: 0,
        artifact: {
          artifactId: p.artifactId,
          type: kind,
          previewUrl: p.previewUrl || "",
          deepLink: p.deepLink,
          prop: ARTIFACT_PROP[kind] || "diary",
        },
      };
      break;
    }
    case "pet.tap_react":
      next = { ...next, mode: "idle", emotion: "surprised", intensity: 0.7 };
      break;
    case "pet.sleep":
      next = { ...next, mode: "sleeping", emotion: "neutral", intensity: 0.2, mouthOpen: 0 };
      break;
    default:
      break;
  }

  const v = validateEmbodimentState({
    mode: next.mode,
    emotion: next.emotion,
    intensity: next.intensity,
    gazeX: next.gazeX ?? 0,
    gazeY: next.gazeY ?? 0,
    mouthOpen: next.mouthOpen ?? 0,
    artifact: next.artifact
      ? {
          artifactId: next.artifact.artifactId,
          type: next.artifact.type,
          previewUrl: next.artifact.previewUrl || "",
          deepLink: next.artifact.deepLink,
        }
      : undefined,
  });
  if (!v.ok) throw new Error(v.errors.join("; "));

  return {
    state: next,
    actionId: next.artifact ? "show_artifact" : modeToDefaultAction(next.mode),
  };
}

export function buildOpenedReceipt({ artifactId, deepLink, at = new Date().toISOString() }) {
  return {
    type: "artifact.opened",
    artifactId,
    deepLink,
    at,
  };
}
