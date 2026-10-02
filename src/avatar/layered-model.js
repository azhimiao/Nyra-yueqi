/**
 * Open layered 2D character format (Phase 4).
 * PNG/WebP parts + parent/child nodes + JSON motions. No Live2D/Spine.
 */

export const LAYERED_FORMAT = "yueqi-layered-2d";
export const LAYERED_FORMAT_VERSION = 1;

export function createEmptyLayeredModel() {
  return {
    format: LAYERED_FORMAT,
    version: LAYERED_FORMAT_VERSION,
    canvas: { width: 512, height: 512 },
    parts: [],
    expressions: {},
    motions: {
      breathe: { enabled: true, target: "body", type: "breathe", amplitude: 0.018, periodMs: 3200 },
      blink: { enabled: true, target: "eyes", type: "blink", closedScaleY: 0.12, intervalMs: [2600, 5400], durationMs: 120 },
      sway: { enabled: true, target: "body", type: "sway", amplitudeDeg: 1.4, periodMs: 4200 },
    },
    lipSync: {
      enabled: true,
      mouthPartId: "mouth",
      mode: "volume",
      minOpen: 0.04,
      maxOpen: 0.42,
      visemeMap: {
        closed: { scaleY: 0.35 },
        A: { scaleY: 1 },
        E: { scaleY: 0.72 },
        O: { scaleY: 0.88 },
      },
    },
    actionBindings: {
      idle_default: { expression: "idle", motions: ["breathe", "blink", "sway"], lipSync: false, particles: [] },
      talking_default: { expression: "talk", motions: ["breathe", "blink"], lipSync: true, particles: [] },
      react_tap: { expression: "react", motions: ["breathe"], lipSync: false, particles: ["sparkle"] },
      comfort: { expression: "soft", motions: ["breathe", "blink"], lipSync: false, particles: [] },
    },
    particles: {
      sparkle: { type: "dots", count: 10, durationMs: 900, color: "#f6e7c8" },
    },
  };
}

export function createStarterLayeredModel() {
  const model = createEmptyLayeredModel();
  model.parts = [
    {
      id: "body",
      name: "身体",
      parentId: "",
      mediaId: "",
      fileName: "",
      z: 10,
      x: 0,
      y: 40,
      scale: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 1,
      visible: true,
    },
    {
      id: "face",
      name: "脸",
      parentId: "body",
      mediaId: "",
      fileName: "",
      z: 20,
      x: 0,
      y: -180,
      scale: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
      visible: true,
    },
    {
      id: "eyes",
      name: "眼睛",
      parentId: "face",
      mediaId: "",
      fileName: "",
      z: 30,
      x: 0,
      y: -12,
      scale: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
      visible: true,
    },
    {
      id: "mouth",
      name: "嘴巴",
      parentId: "face",
      mediaId: "",
      fileName: "",
      z: 30,
      x: 0,
      y: 28,
      scale: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.2,
      visible: true,
    },
  ];
  model.expressions = {
    idle: { opacity: {}, scale: {}, hidden: [] },
    talk: { opacity: {}, scale: { mouth: 1 }, hidden: [] },
    react: { opacity: {}, scale: {}, hidden: [] },
    soft: { opacity: {}, scale: {}, hidden: [] },
  };
  return model;
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function normalizePart(raw = {}, index = 0) {
  const id = String(raw.id || `part_${index + 1}`).trim() || `part_${index + 1}`;
  return {
    id,
    name: String(raw.name || id).trim() || id,
    parentId: String(raw.parentId || "").trim(),
    mediaId: String(raw.mediaId || "").trim(),
    fileName: String(raw.fileName || "").trim(),
    z: clampNumber(raw.z, -1000, 1000, index * 10),
    x: clampNumber(raw.x, -2000, 2000, 0),
    y: clampNumber(raw.y, -2000, 2000, 0),
    scale: clampNumber(raw.scale, 0.05, 4, 1),
    rotation: clampNumber(raw.rotation, -180, 180, 0),
    anchorX: clampNumber(raw.anchorX, 0, 1, 0.5),
    anchorY: clampNumber(raw.anchorY, 0, 1, 0.5),
    visible: raw.visible !== false,
    opacity: clampNumber(raw.opacity, 0, 1, 1),
  };
}

export function normalizeLayeredModel(raw = null) {
  if (!raw || typeof raw !== "object") return createEmptyLayeredModel();
  const base = createEmptyLayeredModel();
  const parts = Array.isArray(raw.parts) ? raw.parts.map(normalizePart).filter(Boolean) : [];
  return {
    format: LAYERED_FORMAT,
    version: LAYERED_FORMAT_VERSION,
    canvas: {
      width: clampNumber(raw.canvas?.width, 64, 2048, base.canvas.width),
      height: clampNumber(raw.canvas?.height, 64, 2048, base.canvas.height),
    },
    parts,
    expressions: raw.expressions && typeof raw.expressions === "object" ? raw.expressions : base.expressions,
    motions: {
      ...base.motions,
      ...(raw.motions && typeof raw.motions === "object" ? raw.motions : {}),
    },
    lipSync: {
      ...base.lipSync,
      ...(raw.lipSync && typeof raw.lipSync === "object" ? raw.lipSync : {}),
    },
    actionBindings: {
      ...base.actionBindings,
      ...(raw.actionBindings && typeof raw.actionBindings === "object" ? raw.actionBindings : {}),
    },
    particles: {
      ...base.particles,
      ...(raw.particles && typeof raw.particles === "object" ? raw.particles : {}),
    },
  };
}

export function layeredHasRenderableParts(model) {
  const layered = normalizeLayeredModel(model);
  return layered.parts.some((part) => Boolean(part.mediaId));
}

export function shouldUseLayeredRender(avatarState, { forceSprite = false, lowEnd = false } = {}) {
  if (forceSprite || lowEnd) return false;
  const mode = String(avatarState?.renderMode || "auto");
  if (mode === "sprite") return false;
  if (mode === "layered") return layeredHasRenderableParts(avatarState?.layered);
  return layeredHasRenderableParts(avatarState?.layered);
}

export function resolveActionBinding(model, actionId = "idle_default") {
  const layered = normalizeLayeredModel(model);
  return layered.actionBindings[actionId]
    || layered.actionBindings.idle_default
    || { expression: "idle", motions: ["breathe", "blink"], lipSync: false, particles: [] };
}

/** Export open JSON (no proprietary blobs). Media referenced by id/path only. */
export function exportLayeredOpenJson(model, { includeMediaIds = true } = {}) {
  const layered = normalizeLayeredModel(model);
  return {
    format: LAYERED_FORMAT,
    version: LAYERED_FORMAT_VERSION,
    canvas: layered.canvas,
    parts: layered.parts.map((part) => ({
      id: part.id,
      name: part.name,
      parentId: part.parentId,
      asset: part.fileName ? `assets/layers/${part.id}${extFromName(part.fileName)}` : "",
      mediaId: includeMediaIds ? part.mediaId : undefined,
      fileName: part.fileName,
      z: part.z,
      x: part.x,
      y: part.y,
      scale: part.scale,
      rotation: part.rotation,
      anchorX: part.anchorX,
      anchorY: part.anchorY,
      visible: part.visible,
      opacity: part.opacity,
    })),
    expressions: layered.expressions,
    motions: layered.motions,
    lipSync: layered.lipSync,
    actionBindings: layered.actionBindings,
    particles: layered.particles,
  };
}

function extFromName(name = "") {
  const match = String(name).match(/\.[a-z0-9]+$/i);
  return match ? match[0].toLowerCase() : ".png";
}
