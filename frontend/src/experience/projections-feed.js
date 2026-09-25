/**
 * Cross-app experience memory projections (lightweight feed).
 * Used by 漫卷 / 剧情 / 冒险 / 共创 so Pop / 记忆 can surface one shared trail.
 */

export const EXPERIENCE_PROJECTIONS_KEY = "yueqi.experience.projections.v1";
export const EXPERIENCE_BINDINGS_KEY = "yueqi.experience.bindings.v1";

const MAX_ITEMS = 80;

function nowIso() {
  return new Date().toISOString();
}

function readBag() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(EXPERIENCE_PROJECTIONS_KEY) || "{}");
    return { items: Array.isArray(raw?.items) ? raw.items : [] };
  } catch {
    return { items: [] };
  }
}

function writeBag(bag) {
  try {
    window.localStorage.setItem(EXPERIENCE_PROJECTIONS_KEY, JSON.stringify(bag));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   kind: "scroll"|"story"|"adventure"|"cocreate"|"game",
 *   characterId?: string,
 *   summary: string,
 *   meta?: object,
 * }} input
 */
export function pushExperienceProjection(input = {}) {
  const summary = String(input.summary || "").trim();
  if (!summary) return { ok: false };
  const kind = String(input.kind || "story");
  const meta = input.meta && typeof input.meta === "object" ? { ...input.meta } : {};
  const KIND_APP_IDS = {
    scroll: "scroll",
    story: "story",
    adventure: "adventure",
    cocreate: "cocreate",
    game: "game",
  };
  if (!meta.appId) meta.appId = KIND_APP_IDS[kind] || kind;
  const entityId = String(input.entityId || meta.entityId || meta.runId || meta.sessionId || "").trim();
  if (entityId && !meta.entityId) meta.entityId = entityId;
  const bag = readBag();
  const item = {
    id: `proj-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`,
    kind,
    characterId: String(input.characterId || ""),
    summary: summary.slice(0, 240),
    meta,
    at: nowIso(),
  };
  meta.artifactId = `exp:${item.id}`;
  bag.items = [item, ...bag.items].slice(0, MAX_ITEMS);
  return { ok: writeBag(bag), item };
}

/**
 * Push projection + optional today-inbox delivery (DEL-05).
 * @param {Parameters<typeof pushExperienceProjection>[0]} input
 */
export async function pushExperienceProjectionWithDelivery(input = {}) {
  const pushed = pushExperienceProjection(input);
  if (!pushed.ok || !pushed.item) return pushed;
  try {
    const { deliverExperienceProjection } = await import("./projection-archive.js");
    await deliverExperienceProjection(pushed.item);
  } catch {
    /* delivery is best-effort */
  }
  return pushed;
}

/**
 * @param {{ characterId?: string, kind?: string, limit?: number }} [opts]
 */
export function listExperienceProjections(opts = {}) {
  const limit = Math.max(1, Math.min(40, Number(opts.limit) || 12));
  const characterId = String(opts.characterId || "").trim();
  const kind = String(opts.kind || "").trim();
  return readBag().items
    .filter((item) => !characterId || item.characterId === characterId)
    .filter((item) => !kind || item.kind === kind)
    .slice(0, limit);
}

const KIND_LABELS = Object.freeze({
  scroll: "漫卷",
  story: "剧情",
  adventure: "冒险",
  cocreate: "共创",
  game: "游戏",
});

export function projectionKindLabel(kind) {
  return KIND_LABELS[kind] || "体验";
}

/** Per-app model/preset binding slots (inherit global when empty). */
export function readExperienceBindings() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(EXPERIENCE_BINDINGS_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} appId
 * @param {object} patch
 */
export function writeExperienceBinding(appId, patch = {}) {
  const id = String(appId || "").trim();
  if (!id) return { ok: false };
  const bag = readExperienceBindings();
  bag[id] = { ...(bag[id] || {}), ...patch, updatedAt: nowIso() };
  try {
    window.localStorage.setItem(EXPERIENCE_BINDINGS_KEY, JSON.stringify(bag));
    return { ok: true, value: bag[id] };
  } catch {
    return { ok: false };
  }
}

export function getExperienceBinding(appId) {
  return readExperienceBindings()[String(appId || "").trim()] || null;
}
