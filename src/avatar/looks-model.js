import { DEFAULT_EXPRESSIONS, normalizeExpression } from "./expressions.js";
import { DEFAULT_SCENE_TRIGGERS, normalizeSceneTrigger } from "../runtime/scene-triggers.js";
import { normalizeTimeline, createEmptyTimeline } from "./timeline.js";
import { normalizeLayeredModel, createEmptyLayeredModel } from "./layered-model.js";

/** Looks / display schema for Phase 0–4 (schemaVersion 4). No proprietary runtimes. */

export const DEFAULT_AVATAR_ID = "lin-xingche";

export const DEFAULT_LOOK_DEFS = [
  { id: "home_casual", name: "居家", description: "日常造型" },
  { id: "rainy_night", name: "雨夜外套", description: "雨夜造型" },
  { id: "sleepwear", name: "睡衣", description: "睡前造型" },
];

export const DEFAULT_ACTIONS = [
  {
    id: "idle_default",
    name: "待机",
    type: "image",
    mediaId: "",
    fileName: "",
    loop: true,
    durationMs: 0,
    priority: 0,
    interruptible: true,
    fallback: "",
    triggers: ["idle"],
    timeline: null,
  },
  {
    id: "talking_default",
    name: "说话",
    type: "image",
    mediaId: "",
    fileName: "",
    loop: true,
    durationMs: 0,
    priority: 10,
    interruptible: true,
    fallback: "idle_default",
    triggers: ["talking"],
    timeline: null,
  },
  {
    id: "react_tap",
    name: "点击回应",
    type: "image",
    mediaId: "",
    fileName: "",
    loop: false,
    durationMs: 1200,
    priority: 20,
    interruptible: true,
    fallback: "idle_default",
    triggers: ["reacting", "tap"],
    timeline: null,
  },
  {
    id: "comfort",
    name: "安慰",
    type: "image",
    mediaId: "",
    fileName: "",
    loop: false,
    durationMs: 1600,
    priority: 25,
    interruptible: true,
    fallback: "talking_default",
    triggers: ["proactive", "comfort"],
    timeline: null,
  },
  {
    id: "sleep_pose",
    name: "睡觉",
    type: "image",
    mediaId: "",
    fileName: "",
    loop: true,
    durationMs: 0,
    priority: 15,
    interruptible: true,
    fallback: "idle_default",
    triggers: ["sleep"],
    timeline: null,
  },
  {
    id: "greet",
    name: "打招呼",
    type: "image",
    mediaId: "",
    fileName: "",
    loop: false,
    durationMs: 1600,
    priority: 22,
    interruptible: true,
    fallback: "idle_default",
    triggers: ["greet"],
    timeline: null,
  },
  {
    id: "selfie",
    name: "自拍",
    type: "image",
    mediaId: "",
    fileName: "",
    loop: false,
    durationMs: 2000,
    priority: 22,
    interruptible: true,
    fallback: "idle_default",
    triggers: ["selfie"],
    timeline: null,
  },
];

export function createDefaultDisplay() {
  return {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    flipX: false,
    anchor: "center",
    floatSize: 64,
  };
}

function emptyLook(def) {
  return {
    id: def.id,
    name: def.name,
    description: def.description || "",
    mediaId: "",
    fileName: "",
    updatedAt: "",
  };
}

export function createDefaultAvatarState() {
  return {
    schemaVersion: 4,
    avatarId: DEFAULT_AVATAR_ID,
    currentLookId: DEFAULT_LOOK_DEFS[0].id,
    userLookLocked: false,
    renderMode: "auto",
    display: createDefaultDisplay(),
    looks: DEFAULT_LOOK_DEFS.map(emptyLook),
    actions: DEFAULT_ACTIONS.map((action) => ({
      ...action,
      timeline: createEmptyTimeline(),
    })),
    expressions: DEFAULT_EXPRESSIONS.map((item) => ({ ...item })),
    sceneTriggers: DEFAULT_SCENE_TRIGGERS.map((item) => ({ ...item })),
    layered: createEmptyLayeredModel(),
    packMeta: {
      id: `pack-${DEFAULT_AVATAR_ID}`,
      name: "默认桌宠",
      version: "1.0.0",
      installedAt: "",
    },
    packHistory: [],
  };
}

function normalizeDisplay(raw = {}) {
  const base = createDefaultDisplay();
  return {
    scale: clampNumber(raw.scale, 0.4, 2.5, base.scale),
    offsetX: clampNumber(raw.offsetX, -200, 200, base.offsetX),
    offsetY: clampNumber(raw.offsetY, -200, 200, base.offsetY),
    flipX: Boolean(raw.flipX),
    anchor: ["center", "center-bottom", "top"].includes(raw.anchor) ? raw.anchor : base.anchor,
    floatSize: clampNumber(raw.floatSize, 40, 160, base.floatSize),
  };
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeLook(raw = {}, index = 0) {
  const id = String(raw.id || `look_${index + 1}`).trim() || `look_${index + 1}`;
  return {
    id,
    name: String(raw.name || id).trim() || id,
    description: String(raw.description || "").trim(),
    mediaId: String(raw.mediaId || "").trim(),
    fileName: String(raw.fileName || "").trim(),
    updatedAt: String(raw.updatedAt || "").trim(),
  };
}

export function normalizeAction(raw = {}) {
  const id = String(raw.id || "").trim();
  if (!id) return null;
  return {
    id,
    name: String(raw.name || id).trim() || id,
    type: ["image", "webp", "frames", "video"].includes(raw.type) ? raw.type : "image",
    mediaId: String(raw.mediaId || "").trim(),
    fileName: String(raw.fileName || "").trim(),
    loop: Boolean(raw.loop),
    durationMs: Math.max(0, Number(raw.durationMs) || 0),
    priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : 0,
    interruptible: raw.interruptible !== false,
    fallback: String(raw.fallback || "").trim(),
    triggers: Array.isArray(raw.triggers)
      ? raw.triggers.map((item) => String(item)).filter(Boolean)
      : [],
    timeline: normalizeTimeline(raw.timeline),
  };
}

function ensureRequiredActions(actions) {
  const list = [...actions];
  const ids = new Set(list.map((item) => item.id));
  for (const required of DEFAULT_ACTIONS) {
    if (!ids.has(required.id)) {
      list.push({ ...required, timeline: createEmptyTimeline() });
    }
  }
  return list.map((action) => {
    if (action.id !== "comfort") return action;
    // comfort must not steal tap/reacting — keep proactive + comfort only
    const triggers = (action.triggers || []).filter((item) => item !== "reacting");
    if (!triggers.includes("proactive")) triggers.push("proactive");
    if (!triggers.includes("comfort")) triggers.push("comfort");
    return { ...action, triggers };
  });
}

/** Migrate v1–v3 → v4 looks + layered 2D + expressions + scenes + pack meta. */
export function migrateAvatarState(raw = {}) {
  if (!raw || typeof raw !== "object") return createDefaultAvatarState();

  if (Array.isArray(raw.looks) && raw.looks.length) {
    const looks = raw.looks.map(normalizeLook);
    const lookIds = new Set(looks.map((look) => look.id));
    let currentLookId = String(raw.currentLookId || looks[0].id);
    if (!lookIds.has(currentLookId)) currentLookId = looks[0].id;
    const actions = ensureRequiredActions(
      (Array.isArray(raw.actions) ? raw.actions : DEFAULT_ACTIONS)
        .map(normalizeAction)
        .filter(Boolean)
    );
    const expressions = (Array.isArray(raw.expressions) ? raw.expressions : DEFAULT_EXPRESSIONS)
      .map(normalizeExpression)
      .filter(Boolean);
    const sceneTriggers = (Array.isArray(raw.sceneTriggers) ? raw.sceneTriggers : DEFAULT_SCENE_TRIGGERS)
      .map(normalizeSceneTrigger)
      .filter(Boolean)
      .map((item) => (
        item.scene === "sleep" && (!item.actionId || item.actionId === "idle_default")
          ? { ...item, actionId: "sleep_pose" }
          : item
      ));
    const renderMode = ["auto", "sprite", "layered"].includes(raw.renderMode)
      ? raw.renderMode
      : "auto";
    return {
      schemaVersion: 4,
      avatarId: String(raw.avatarId || DEFAULT_AVATAR_ID),
      currentLookId,
      userLookLocked: Boolean(raw.userLookLocked ?? raw.userOutfitLocked),
      renderMode,
      display: normalizeDisplay(raw.display),
      looks,
      actions,
      expressions: expressions.length ? expressions : DEFAULT_EXPRESSIONS.map((item) => ({ ...item })),
      sceneTriggers: sceneTriggers.length ? sceneTriggers : DEFAULT_SCENE_TRIGGERS.map((item) => ({ ...item })),
      layered: normalizeLayeredModel(raw.layered),
      packMeta: {
        id: String(raw.packMeta?.id || `pack-${raw.avatarId || DEFAULT_AVATAR_ID}`),
        name: String(raw.packMeta?.name || "角色包"),
        version: String(raw.packMeta?.version || "1.0.0"),
        installedAt: String(raw.packMeta?.installedAt || ""),
        rolledBackAt: String(raw.packMeta?.rolledBackAt || ""),
      },
      packHistory: Array.isArray(raw.packHistory) ? raw.packHistory.slice(0, 5) : [],
    };
  }

  // Legacy v1: outfits map + characterMediaId
  const defaults = createDefaultAvatarState();
  const outfits = raw.outfits && typeof raw.outfits === "object" ? raw.outfits : {};
  const looks = DEFAULT_LOOK_DEFS.map((def) => {
    const outfit = outfits[def.id] || {};
    const look = emptyLook(def);
    look.mediaId = String(outfit.mediaId || "").trim();
    look.fileName = String(outfit.fileName || "").trim();
    look.updatedAt = String(outfit.updatedAt || "").trim();
    return look;
  });

  const characterMediaId = String(raw.characterMediaId || "").trim();
  const characterFileName = String(raw.characterFileName || "").trim();
  let currentLookId = String(raw.currentOutfitId || raw.currentLookId || looks[0].id);
  if (!looks.some((look) => look.id === currentLookId)) currentLookId = looks[0].id;
  if (characterMediaId) {
    const current = looks.find((look) => look.id === currentLookId) || looks[0];
    if (!current.mediaId) {
      current.mediaId = characterMediaId;
      current.fileName = characterFileName;
    } else {
      looks.unshift({
        id: "base_portrait",
        name: "基础立绘",
        description: "人物立绘",
        mediaId: characterMediaId,
        fileName: characterFileName,
        updatedAt: "",
      });
    }
  }

  return {
    ...defaults,
    avatarId: String(raw.avatarId || DEFAULT_AVATAR_ID),
    currentLookId,
    userLookLocked: Boolean(raw.userOutfitLocked || raw.userLookLocked),
    display: normalizeDisplay(raw.display),
    looks,
  };
}

export function getCurrentLook(state) {
  const looks = state?.looks || [];
  return looks.find((look) => look.id === state?.currentLookId) || looks[0] || null;
}

export function findAction(state, actionId) {
  return (state?.actions || []).find((action) => action.id === actionId) || null;
}

/** Media id for host pose: action main media or timeline loop/enter. */
export function resolveActionMediaId(state, actionId) {
  const action = findAction(state, actionId);
  if (!action) return "";
  return action.mediaId
    || action.timeline?.loop?.mediaId
    || action.timeline?.enter?.mediaId
    || "";
}

/**
 * Resolve pose blob: user-bound media first, else built-in chibi pose PNG.
 * @param {object} state
 * @param {string} actionId
 * @param {(id: string) => Promise<Blob|null>} getMediaBlobById
 */
export async function resolveActionPoseBlob(state, actionId, getMediaBlobById) {
  const mediaId = resolveActionMediaId(state, actionId);
  if (mediaId && typeof getMediaBlobById === "function") {
    const blob = await getMediaBlobById(mediaId);
    if (blob) return blob;
  }
  const { defaultPoseAssetUrl } = await import("./default-pose-assets.js");
  const url = defaultPoseAssetUrl(actionId);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export function resolveActionForState(state, playState = "idle") {
  const actions = state?.actions || [];
  const matched = actions
    .filter((action) => (action.triggers || []).includes(playState))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  if (matched[0]) return matched[0];
  if (playState === "talking") return findAction(state, "talking_default") || findAction(state, "idle_default");
  if (playState === "reacting") return findAction(state, "react_tap") || findAction(state, "idle_default");
  return findAction(state, "idle_default") || actions[0] || null;
}

/** @deprecated Use migrateAvatarState / createDefaultAvatarState */
export const DEFAULT_OUTFITS = DEFAULT_LOOK_DEFS.map((def) => ({
  id: def.id,
  label: def.name,
  description: def.description,
  unlock: { type: "free" },
}));

export function createDefaultAvatarStateLegacyAlias() {
  return createDefaultAvatarState();
}
