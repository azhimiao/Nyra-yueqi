/** Catalog of Qiji (栖机) apps — labels via phone.apps.* / phone.jobs.* */

import {
  activeWidgetAppIds,
  C1_DOCK_ORDER,
  C1_GRID_ORDER,
  CREATOR_FOLDER_KEY,
  FROZEN_HOME_APP_IDS,
  HOME_PAGE_COUNT_C1,
  MIN_ICON_PAGES,
  MAX_ICON_PAGES,
} from "./home-layout.js";
import { parseGameDesktopId, isGameDesktopId } from "../yeos/kinds.js";
import { phoneAppJob, phoneAppLabel, pt } from "./i18n.js";

export { MIN_ICON_PAGES, MAX_ICON_PAGES };

export const PHONE_APPS = [
  /* Dock — four clearly different hues */
  { id: "pop", labelKey: "phone.apps.pop", jobKey: "phone.jobs.pop", icon: "message-circle", tone: "sea", page: 1, defaultDock: true },
  { id: "moments", labelKey: "phone.apps.moments", jobKey: "phone.jobs.moments", icon: "camera", tone: "blush", page: 1, defaultDock: true },
  { id: "listen", labelKey: "phone.apps.listen", jobKey: "phone.jobs.listen", icon: "headphones", tone: "dusk", page: 1, defaultDock: true },
  { id: "qishi", labelKey: "phone.apps.qishi", jobKey: "phone.jobs.qishi", icon: "store", tone: "coral", page: 1, defaultDock: true },
  /* Home grid — one tone family each; avoid repeating sea/mint/moss on the same screen */
  { id: "shop", labelKey: "phone.apps.shop", jobKey: "phone.jobs.shop", icon: "shopping-bag", tone: "peach", page: 1 },
  { id: "explore", labelKey: "phone.apps.explore", jobKey: "phone.jobs.explore", icon: "compass", tone: "blue", page: 1 },
  { id: "assist", labelKey: "phone.apps.assist", jobKey: "phone.jobs.assist", icon: "sparkles", tone: "mint", page: 1 },
  { id: "diary", labelKey: "phone.apps.diary", jobKey: "phone.jobs.diary", icon: "book-heart", tone: "amber", page: 1 },
  { id: "scenario", labelKey: "phone.apps.scenario", jobKey: "phone.jobs.scenario", icon: "clapperboard", tone: "ember", page: 1 },
  { id: "gallery", labelKey: "phone.apps.gallery", jobKey: "phone.jobs.gallery", icon: "images", tone: "lilac", page: 1 },
  { id: "calendar", labelKey: "phone.apps.calendar", jobKey: "phone.jobs.calendar", icon: "calendar-days", tone: "moss", page: 1 },
  { id: "read", labelKey: "phone.apps.read", jobKey: "phone.jobs.read", icon: "book-open", tone: "sage", page: 1 },
  { id: "games", labelKey: "phone.apps.games", jobKey: "phone.jobs.games", icon: "gamepad-2", tone: "ember", page: 1 },
  { id: "memory", labelKey: "phone.apps.memory", jobKey: "phone.jobs.memory", icon: "brain", tone: "sky", page: 1 },
  { id: "beautify", labelKey: "phone.apps.beautify", jobKey: "phone.jobs.beautify", icon: "palette", tone: "rose", page: 1 },
  { id: "pet", labelKey: "phone.apps.pet", jobKey: "phone.jobs.pet", icon: "picture-in-picture-2", tone: "lemon", page: 1 },
  { id: "profile", labelKey: "phone.apps.profile", jobKey: "phone.jobs.profile", icon: "user-round", tone: "white", page: 1 },
  { id: "settings", labelKey: "phone.apps.settings", jobKey: "phone.jobs.settings", icon: "settings-2", tone: "ink", page: 1 },
  /* Advanced / via 栖市 — still unique, not colliding with home dock */
  { id: "scroll", labelKey: "phone.apps.scroll", jobKey: "phone.jobs.scroll", icon: "book-image", tone: "sky", page: 2, advanced: true, via: "qishi" },
  { id: "cocreate", labelKey: "phone.apps.cocreate", jobKey: "phone.jobs.cocreate", icon: "pen-line", tone: "sage", page: 2, advanced: true, via: "qishi" },
  { id: "adventure", labelKey: "phone.apps.adventure", jobKey: "phone.jobs.adventure", icon: "map", tone: "yellow", page: 2, advanced: true, via: "qishi" },
  { id: "lab", labelKey: "phone.apps.lab", jobKey: "phone.jobs.lab", icon: "plug-zap", tone: "slate", page: 2, advanced: true },
  { id: "assets", labelKey: "phone.apps.assets", jobKey: "phone.jobs.assets", icon: "archive", tone: "white", page: 2, advanced: true },
  { id: "activity", labelKey: "phone.apps.activity", jobKey: "phone.jobs.activity", icon: "activity", tone: "foam", page: 1, advanced: true },
  { id: "autonomy", labelKey: "phone.apps.autonomy", jobKey: "phone.jobs.autonomy", icon: "heart-handshake", tone: "yellow", page: 1, advanced: true },
  { id: "agent-perms", labelKey: "phone.apps.agentPerms", jobKey: "phone.jobs.agentPerms", icon: "shield", tone: "slate", page: 1, advanced: true },
  { id: "tasks", labelKey: "phone.apps.tasks", jobKey: "phone.jobs.tasks", icon: "list-checks", tone: "lemon", page: 1, advanced: true },
  { id: "devtools", labelKey: "phone.apps.devtools", jobKey: "phone.jobs.devtools", icon: "bug", tone: "ink", page: 2, advanced: true },
];

export const PHONE_APP_MAP = Object.fromEntries(PHONE_APPS.map((app) => [app.id, app]));

export function localizeApp(app) {
  if (!app) return null;
  return {
    ...app,
    label: phoneAppLabel(app),
    job: phoneAppJob(app),
  };
}

export { FROZEN_HOME_APP_IDS };

/** Fixed home grid: 4 columns × 6 rows per icon page. */
export const GRID_COLS = 4;
export const GRID_ROWS = 6;
export const ICONS_PER_PAGE = GRID_COLS * GRID_ROWS;
export const DOCK_SLOT_COUNT = 4;

export const DEFAULT_DOCK_ORDER = [
  ...C1_DOCK_ORDER,
  ...Array.from({ length: DOCK_SLOT_COUNT }, () => null),
].slice(0, DOCK_SLOT_COUNT);

/** No default folders — creator hub removed. */
export const DEFAULT_FOLDERS = {};

/** Consumer grid dense order (no dock apps). */
export const DEFAULT_ICON_ORDER = C1_GRID_ORDER.slice();

/** @deprecated use DEFAULT_DOCK_ORDER */
export const DOCK_APPS = DEFAULT_DOCK_ORDER.filter(Boolean);

export const HOME_PAGE_COUNT = HOME_PAGE_COUNT_C1;
/** Icon grids (page 0 is widgets). */
export const ICON_PAGE_MIN = 1;
/** Capacity ceiling for icon pages (not the live page count). */
export const ICON_PAGE_MAX = MAX_ICON_PAGES;
export const ICON_SLOT_COUNT = MAX_ICON_PAGES * ICONS_PER_PAGE;

export function clampIconPageCount(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return MIN_ICON_PAGES;
  return Math.max(MIN_ICON_PAGES, Math.min(MAX_ICON_PAGES, v));
}

export function totalHomePages(iconPageCount = MIN_ICON_PAGES) {
  return 1 + clampIconPageCount(iconPageCount);
}

export function iconSlotsForPages(iconPageCount = MIN_ICON_PAGES) {
  return clampIconPageCount(iconPageCount) * ICONS_PER_PAGE;
}

/** Infer icon-page count from a slot array length (at least one page). */
export function iconPageCountFromOrder(order = []) {
  const len = Array.isArray(order) ? order.length : 0;
  if (len <= 0) return MIN_ICON_PAGES;
  return clampIconPageCount(Math.ceil(len / ICONS_PER_PAGE));
}

export function isFolderEntry(id) {
  return String(id || "").startsWith("folder:");
}

export function folderKeyFromEntry(id) {
  return isFolderEntry(id) ? String(id).slice(7) : "";
}

export function isEmptySlot(id) {
  return id == null || id === "" || id === false;
}

/** @returns {{ extId: string } | null} */
export function parseExtDesktopId(id) {
  const match = String(id || "").trim().match(/^ext:([a-z][a-z0-9-]{2,48})$/);
  return match ? { extId: match[1] } : null;
}

export function isExtDesktopId(id) {
  return Boolean(parseExtDesktopId(id));
}

export { parseGameDesktopId, isGameDesktopId };

/**
 * @param {string} id
 * @param {object} folders
 * @param {(extId: string) => ({ label?: string, icon?: string, tone?: string, iconDataUrl?: string } | null)} [resolveExt]
 * @param {(gameId: string) => ({ label?: string, icon?: string, tone?: string, iconDataUrl?: string } | null)} [resolveGame]
 */
export function resolveHomeEntry(id, folders = {}, resolveExt = null, resolveGame = null) {
  if (isEmptySlot(id)) return null;
  if (isFolderEntry(id)) {
    const key = folderKeyFromEntry(id);
    const folder = folders?.[key];
    if (!folder) return null;
    const apps = (folder.apps || [])
      .map((appId) => PHONE_APP_MAP[appId])
      .filter(Boolean);
    const isCreator = key === CREATOR_FOLDER_KEY;
    return {
      id,
      type: "folder",
      folderId: key,
      label: folder.name || pt("screens.settingsTitle"),
      icon: "folder",
      tone: isCreator ? "ink" : "white",
      apps: apps.map(localizeApp),
      job: `${apps.length}`,
    };
  }
  const ext = parseExtDesktopId(id);
  if (ext) {
    const meta = typeof resolveExt === "function" ? resolveExt(ext.extId) : null;
    return {
      id,
      type: "app",
      extId: ext.extId,
      label: meta?.label || meta?.name || ext.extId,
      icon: meta?.icon || "calendar-heart",
      tone: meta?.tone || "yellow",
      iconDataUrl: meta?.iconDataUrl || "",
      job: pt("brand.qiji"),
    };
  }
  const game = parseGameDesktopId(id);
  if (game) {
    const meta = typeof resolveGame === "function" ? resolveGame(game.gameId) : null;
    return {
      id,
      type: "app",
      gameId: game.gameId,
      label: meta?.label || meta?.name || game.gameId,
      icon: meta?.icon || "gamepad-2",
      tone: meta?.tone || "ember",
      iconDataUrl: meta?.iconDataUrl || "",
      job: pt("apps.games"),
    };
  }
  const app = PHONE_APP_MAP[id];
  if (!app) return null;
  return { ...localizeApp(app), type: "app" };
}

/** Dock entry — apps only, no folders. Extensions / games allowed. */
export function resolveDockEntry(id, resolveExt = null, resolveGame = null) {
  if (isEmptySlot(id) || isFolderEntry(id)) return null;
  if (isExtDesktopId(id) || isGameDesktopId(id)) return resolveHomeEntry(id, {}, resolveExt, resolveGame);
  const app = PHONE_APP_MAP[id];
  if (!app) return null;
  return { ...localizeApp(app), type: "app" };
}

/**
 * Fixed-length dock slots (null = empty). Max DOCK_SLOT_COUNT.
 * Packs occupied icons to the front (iOS-style elastic dock).
 * Drops duplicates and ids already on the home grid when provided.
 */
export function normalizeDockOrder(dock = DEFAULT_DOCK_ORDER, iconOrder = []) {
  const onHome = new Set(
    (Array.isArray(iconOrder) ? iconOrder : [])
      .filter((id) => !isEmptySlot(id) && !isFolderEntry(id)),
  );
  const filled = [];
  const seen = new Set();
  for (const id of Array.isArray(dock) ? dock : DEFAULT_DOCK_ORDER) {
    if (filled.length >= DOCK_SLOT_COUNT) break;
    if (isEmptySlot(id) || isFolderEntry(id) || seen.has(id)) continue;
    if (FROZEN_HOME_APP_IDS.includes(id)) continue;
    if (!PHONE_APP_MAP[id] && !isExtDesktopId(id) && !isGameDesktopId(id)) continue;
    if (onHome.has(id)) continue;
    seen.add(id);
    filled.push(id);
  }
  return Array.from({ length: DOCK_SLOT_COUNT }, (_, i) => filled[i] ?? null);
}

/** Dense list of dock app ids (no holes), max DOCK_SLOT_COUNT. */
export function compactDockIds(dock = []) {
  return normalizeDockOrder(dock, []).filter((id) => !isEmptySlot(id));
}

/** Remove dock occupants from home slots so an app is only in one place. */
export function stripDockFromIconOrder(iconOrder = [], dockOrder = []) {
  const dockIds = new Set(
    (Array.isArray(dockOrder) ? dockOrder : []).filter((id) => !isEmptySlot(id)),
  );
  return (Array.isArray(iconOrder) ? iconOrder : []).map((id) => (
    !isEmptySlot(id) && !isFolderEntry(id) && dockIds.has(id) ? null : id
  ));
}

/** Pack a dense id list into the requested number of icon pages. */
export function packIconSlots(denseIds = DEFAULT_ICON_ORDER, iconPageCount = MIN_ICON_PAGES) {
  const slots = Array.from({ length: iconSlotsForPages(iconPageCount) }, () => null);
  let cursor = 0;
  for (const id of denseIds) {
    if (isEmptySlot(id)) continue;
    if (cursor >= slots.length) break;
    slots[cursor] = id;
    cursor += 1;
  }
  return slots;
}

/**
 * Full fixed grid for a home page (4×6), including empty placeable slots.
 * @param {(extId: string) => object|null} [resolveExt]
 * @param {(gameId: string) => object|null} [resolveGame]
 */
export function appsForHomePage(pageIndex, order = packIconSlots(), folders = {}, resolveExt = null, resolveGame = null) {
  const page = Math.max(ICON_PAGE_MIN, Number(pageIndex) || ICON_PAGE_MIN);
  const start = (page - 1) * ICONS_PER_PAGE;
  const slice = (order || []).slice(start, start + ICONS_PER_PAGE);
  while (slice.length < ICONS_PER_PAGE) slice.push(null);

  return slice.map((id, localSlot) => {
    const col = (localSlot % GRID_COLS) + 1;
    const row = Math.floor(localSlot / GRID_COLS) + 1;
    const entry = resolveHomeEntry(id, folders, resolveExt, resolveGame);
    if (!entry) {
      return { type: "empty", id: "", slot: localSlot, col, row };
    }
    return {
      ...entry,
      slot: localSlot,
      col,
      row,
    };
  });
}

/** Root-level visible app/folder ids on default consumer home (for verify). */
export function listDefaultVisibleHomeIds() {
  return [
    ...activeWidgetAppIds(),
    ...DEFAULT_DOCK_ORDER.filter(Boolean),
    ...DEFAULT_ICON_ORDER.filter((id) => !isEmptySlot(id)),
  ];
}
