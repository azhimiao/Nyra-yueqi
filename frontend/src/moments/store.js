export const MOMENTS_STORAGE_KEY = "yueqi.phone.moments.v1";

/** 空起点：不注入林星梨示范动态 */
const DEFAULT_MOMENTS = [];

function cloneDefaults() {
  return DEFAULT_MOMENTS.map((item) => ({
    ...item,
    likes: [...(item.likes || [])],
    comments: (item.comments || []).map((comment) => ({ ...comment })),
  }));
}

export function normalizeMoment(item = {}) {
  const authorType = item.authorType === "character" ? "character" : "user";
  const sourceType = item.sourceType === "imported" || item.sourceType === "external" ? item.sourceType : "local";
  const legacyImage = String(item.image || "").slice(0, 2_000_000);
  const images = Array.isArray(item.images)
    ? item.images.map((url) => String(url || "").slice(0, 2_000_000)).filter(Boolean).slice(0, 9)
    : legacyImage ? [legacyImage] : [];
  return {
    id: String(item.id || `moment-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    author: String(item.author || "你").slice(0, 40),
    authorId: String(item.authorId || item.characterId || (authorType === "user" ? "user" : "")).slice(0, 64),
    authorAvatar: String(item.authorAvatar || "").slice(0, 2_000_000),
    authorType,
    time: String(item.time || "刚刚").slice(0, 30),
    createdAt: String(item.createdAt || new Date().toISOString()),
    content: String(item.content || "").slice(0, 280),
    image: images[0] || "",
    images,
    likes: Array.isArray(item.likes) ? item.likes.map((name) => String(name).slice(0, 40)).slice(0, 100) : [],
    comments: Array.isArray(item.comments)
      ? item.comments.map((comment) => ({
          author: String(comment?.author || "用户").slice(0, 40),
          authorId: comment?.authorId ? String(comment.authorId).slice(0, 64) : "",
          text: String(comment?.text || "").slice(0, 120),
        })).filter((comment) => comment.text).slice(0, 100)
      : [],
    characterGenerated: Boolean(item.characterGenerated),
    sourceType,
    shareWithCompanion: typeof item.shareWithCompanion === "boolean"
      ? item.shareWithCompanion
      : item.privacy === "companion_shared",
    visibleToCharacterIds: Array.isArray(item.visibleToCharacterIds)
      ? [...new Set(item.visibleToCharacterIds.map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 32)
      : [],
    privacy: (typeof item.shareWithCompanion === "boolean"
      ? item.shareWithCompanion
      : item.privacy === "companion_shared")
      ? "companion_shared"
      : "private",
  };
}

export function loadMoments() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MOMENTS_STORAGE_KEY) || "null");
    if (!Array.isArray(parsed) || !parsed.length) return cloneDefaults();
    return parsed.map(normalizeMoment).filter((item) => item.content || item.images.length).slice(0, 200);
  } catch {
    return cloneDefaults();
  }
}

export function saveMoments(moments = [], reason = "update") {
  const normalized = moments.map(normalizeMoment).filter((item) => item.content || item.images.length).slice(0, 200);
  window.localStorage.setItem(MOMENTS_STORAGE_KEY, JSON.stringify(normalized));
  if (globalThis.document?.dispatchEvent && typeof globalThis.CustomEvent === "function") {
    globalThis.document.dispatchEvent(new CustomEvent("yueqi:moments-changed", {
      detail: { moments: normalized, reason },
    }));
  }
  return normalized;
}

export function exportMomentsBag() {
  return { schemaVersion: 1, moments: loadMoments() };
}

export function importMomentsBag(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.moments;
  return saveMoments(Array.isArray(rows) ? rows : [], "backup_restore");
}
