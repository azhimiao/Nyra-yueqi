/**
 * Custom sticker store (image URLs / local data URLs).
 * Composer tray shows only user-added stickers — no builtin emoji pack.
 */

export const ASSETS_HUB_KEY = "yueqi.assets-hub.v1";

function nowIso() {
  return new Date().toISOString();
}

function readRaw() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return JSON.parse(window.localStorage.getItem(ASSETS_HUB_KEY) || "null");
  } catch {
    return null;
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(ASSETS_HUB_KEY, JSON.stringify(bag));
  } catch {
    /* ignore quota */
  }
}

function normalizeSticker(raw = {}) {
  const url = String(raw.url || raw.dataUrl || "").trim();
  const description = String(raw.description || raw.label || raw.text || "").trim() || "表情";
  if (!url) return null;
  return {
    id: String(raw.id || "").trim() || `sticker-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`,
    url,
    description,
    createdAt: raw.createdAt || nowIso(),
  };
}

export function defaultAssetsHubBag() {
  return {
    customStickers: [],
    collapsedSections: {},
    recentAssetIds: [],
  };
}

export function loadAssetsHubBag() {
  const raw = readRaw();
  if (!raw || typeof raw !== "object") {
    const bag = defaultAssetsHubBag();
    writeBag(bag);
    return bag;
  }
  const customStickers = (Array.isArray(raw.customStickers) ? raw.customStickers : [])
    .map(normalizeSticker)
    .filter(Boolean);
  return {
    customStickers,
    collapsedSections: raw.collapsedSections && typeof raw.collapsedSections === "object"
      ? raw.collapsedSections
      : {},
    recentAssetIds: Array.isArray(raw.recentAssetIds) ? raw.recentAssetIds : [],
  };
}

export function saveAssetsHubBag(partial = {}) {
  const prev = loadAssetsHubBag();
  const next = {
    ...prev,
    ...partial,
    customStickers: Array.isArray(partial.customStickers)
      ? partial.customStickers.map(normalizeSticker).filter(Boolean)
      : prev.customStickers,
  };
  writeBag(next);
  return next;
}

/** Custom image stickers only (composer + hub). */
export function listCustomStickers() {
  return loadAssetsHubBag().customStickers.slice();
}

/** @deprecated use listCustomStickers — kept for older imports */
export function listAllStickers() {
  return listCustomStickers();
}

export function upsertCustomSticker(partial = {}) {
  const sticker = normalizeSticker(partial);
  if (!sticker) throw new Error("表情需要图片链接或本地图片");
  const bag = loadAssetsHubBag();
  const idx = bag.customStickers.findIndex((s) => s.id === sticker.id);
  if (idx >= 0) bag.customStickers[idx] = { ...bag.customStickers[idx], ...sticker };
  else bag.customStickers.unshift(sticker);
  writeBag(bag);
  return sticker;
}

export function addStickersBulk(items = []) {
  const bag = loadAssetsHubBag();
  const added = [];
  for (const item of items) {
    const sticker = normalizeSticker({
      ...item,
      id: `${Date.now()}-${added.length}`,
    });
    if (!sticker) continue;
    bag.customStickers.unshift(sticker);
    added.push(sticker);
  }
  writeBag(bag);
  return added;
}

export function deleteCustomSticker(id) {
  const bag = loadAssetsHubBag();
  bag.customStickers = bag.customStickers.filter((s) => s.id !== id);
  writeBag(bag);
  return true;
}

export function deleteCustomStickers(ids = []) {
  const set = new Set((ids || []).map(String));
  const bag = loadAssetsHubBag();
  bag.customStickers = bag.customStickers.filter((s) => !set.has(s.id));
  writeBag(bag);
  return true;
}

/**
 * Parse bulk text:
 * 名称：xx 描述：xxx 直链：https://...
 */
export function parseBulkStickerText(text) {
  const entries = String(text || "").split(/\n+/).filter((line) => line.trim());
  const parsed = [];
  for (const entry of entries) {
    const nameMatch = entry.match(/(?:名称|Name)[:：]\s*([^\s描述直链DescURL]+)/i);
    const descMatch = entry.match(/(?:描述|Desc)[:：]\s*([^\s直链URL]+)/i);
    const urlMatch = entry.match(/(?:直链|URL)[:：]\s*(https?:\/\/\S+|data:image\/[^\s]+)/i);
    if (!urlMatch) continue;
    const name = nameMatch ? nameMatch[1].trim() : "";
    const desc = descMatch ? descMatch[1].trim() : "";
    parsed.push({
      url: urlMatch[1].trim(),
      description: [name, desc].filter(Boolean).join(" - ") || "表情",
    });
  }
  return parsed;
}

/**
 * Compress a local image file into a sticker-sized data URL.
 * @param {File|Blob} file
 * @param {{ maxEdge?: number, quality?: number, description?: string }} [options]
 */
export function fileToStickerDataUrl(file, options = {}) {
  const maxEdge = Number(options.maxEdge) > 0 ? Number(options.maxEdge) : 320;
  const quality = Number(options.quality) > 0 ? Number(options.quality) : 0.86;
  if (!file || !String(file.type || "").startsWith("image/")) {
    return Promise.reject(new Error("请选择图片文件"));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("无法处理图片");
          ctx.drawImage(img, 0, 0, width, height);
          const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
          resolve(canvas.toDataURL(mime, quality));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error("图片无法解码"));
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

export async function addStickerFromFile(file, description = "") {
  const url = await fileToStickerDataUrl(file);
  const name = String(description || file?.name || "表情")
    .replace(/\.[a-z0-9]+$/i, "")
    .trim() || "表情";
  return upsertCustomSticker({ url, description: name });
}

export function touchRecentAsset(kind, id) {
  const bag = loadAssetsHubBag();
  const next = [
    { kind, id: String(id), at: nowIso() },
    ...bag.recentAssetIds.filter((r) => !(r.kind === kind && r.id === String(id))),
  ].slice(0, 20);
  bag.recentAssetIds = next;
  writeBag(bag);
  return next;
}

export function exportAssetsHubBag() {
  return loadAssetsHubBag();
}

export function importAssetsHubBag(payload) {
  if (!payload || typeof payload !== "object") return loadAssetsHubBag();
  const bag = {
    customStickers: (Array.isArray(payload.customStickers) ? payload.customStickers : [])
      .map(normalizeSticker)
      .filter(Boolean),
    collapsedSections: payload.collapsedSections && typeof payload.collapsedSections === "object"
      ? payload.collapsedSections
      : {},
    recentAssetIds: Array.isArray(payload.recentAssetIds) ? payload.recentAssetIds : [],
  };
  writeBag(bag);
  return bag;
}

/** Content string sent to the model when user picks a sticker. */
export function stickerPromptText(sticker) {
  const desc = String(sticker?.description || "").trim() || "表情";
  return `[表情] ${desc}`;
}
