/** Sidewrite / TA's phone — CEV2 C3 constants. */

/** Product six apps (CEV2 §5.2). Legacy c2/c5/c4/c8 remain in fixtures for F2a compat. */
export const TA_APP_KEYS = Object.freeze([
  "messages",
  "album",
  "calendar",
  "memo",
  "browser",
  "orders",
]);

/** Grid apps — must not duplicate Dock set. */
export const TA_GRID_ORDER = Object.freeze(["memo", "orders"]);

/** Dock — four primary slots like a real phone. Disjoint from grid. */
export const TA_DOCK_ORDER = Object.freeze(["messages", "album", "calendar", "browser"]);

export const TA_APP_META = Object.freeze({
  messages: { label: "讯息", icon: "message-circle", tone: "mint" },
  album: { label: "相册", icon: "images", tone: "coral" },
  calendar: { label: "日历", icon: "calendar", tone: "blue" },
  memo: { label: "备忘", icon: "sticky-note", tone: "yellow" },
  browser: { label: "浏览", icon: "globe", tone: "ink" },
  orders: { label: "订单", icon: "package", tone: "coral" },
});

/** @deprecated F2a keys — kept for migration / legacy verify */
export const APP_KEYS = Object.freeze(["c5", "c4", "c8", "c2"]);
export const F2A_ICON_ORDER = Object.freeze(["c5", "c4", "c8", "c2"]);
export const F2A_DOCK_ORDER = Object.freeze(["c5", "c4", "c8", "c2"]);

export const APP_META = Object.freeze({
  c5: { label: "讯息", icon: "message-circle", tone: "mint" },
  c4: { label: "相册", icon: "images", tone: "coral" },
  c8: { label: "备忘", icon: "sticky-note", tone: "yellow" },
  c2: { label: "短信", icon: "mail", tone: "blue" },
  ...TA_APP_META,
});

export const SCENE_TAGS = Object.freeze({
  view: "sidewrite.view",
  c5: "sidewrite.im",
  c4: "sidewrite.album",
  c8: "sidewrite.memo",
  c2: "sidewrite.sms",
  messages: "sidewrite.im",
  album: "sidewrite.album",
  calendar: "sidewrite.calendar",
  memo: "sidewrite.memo",
  browser: "sidewrite.browser",
  orders: "sidewrite.orders",
});

export const LS_KEYS = Object.freeze({
  lastCharacterId: "yueqi.sidewrite.lastCharacterId.v1",
  prefs: "yueqi.sidewrite.prefs.v1",
  events: "yueqi.sidewrite.events.v1",
  boundaryAck: "yueqi.sidewrite.boundary.v1",
  readState: "yueqi.sidewrite.read.v1",
  lockUnlock: "yueqi.sidewrite.lock.v1",
});

export const IDB_STORE = "sidewrite_payloads";
export const SOURCE_APP = "sidewrite";
export const SCHEMA_VERSION = 1;

export const DEFAULT_PREFS = Object.freeze({
  projectionEnabled: true,
  dwellThresholdMs: 3000,
});

/**
 * @param {string} characterId
 */
export function defaultManifest(characterId) {
  const cid = String(characterId || "").trim();
  const now = new Date().toISOString();
  const apps = {};
  for (const key of [...APP_KEYS, ...TA_APP_KEYS]) {
    apps[key] = {
      status: "empty",
      generatedAt: null,
      checksum: null,
      error: null,
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    characterId: cid,
    createdAt: now,
    updatedAt: now,
    generationStatus: "idle",
    generationError: null,
    desktop: {
      wallpaperId: cid ? `char-${cid}` : "dusk",
      wallpaperTone: "river",
      iconOrder: [...TA_GRID_ORDER],
      dockOrder: [...TA_DOCK_ORDER],
      carrierLabel: "栖网",
    },
    apps,
    pool: {
      seed: hashSeed(cid),
      enabledApps: [...TA_APP_KEYS],
    },
  };
}

/**
 * @param {string} text
 */
export function hashSeed(text = "") {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) || 1;
}

/**
 * @param {string} characterId
 * @param {string} appKey
 */
export function payloadRecordId(characterId, appKey) {
  return `${String(characterId || "").trim()}:${String(appKey || "").trim()}`;
}

/**
 * @param {string} characterId
 */
export function manifestRecordId(characterId) {
  return `${String(characterId || "").trim()}:manifest`;
}
