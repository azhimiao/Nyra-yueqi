import {
  DEFAULT_ICON_ORDER,
  DEFAULT_DOCK_ORDER,
  DEFAULT_FOLDERS,
  DOCK_SLOT_COUNT,
  HOME_PAGE_COUNT,
  ICON_PAGE_MAX,
  ICON_SLOT_COUNT,
  ICONS_PER_PAGE,
  MIN_ICON_PAGES,
  PHONE_APP_MAP,
  clampIconPageCount,
  iconPageCountFromOrder,
  iconSlotsForPages,
  totalHomePages,
  isEmptySlot,
  isFolderEntry,
  folderKeyFromEntry,
  normalizeDockOrder,
  packIconSlots,
  stripDockFromIconOrder,
  isExtDesktopId,
  isGameDesktopId,
  FROZEN_HOME_APP_IDS,
  MAX_ICON_PAGES,
} from "./apps-catalog.js";
import {
  activeWidgetAppIds,
  CREATOR_FOLDER_ENTRY,
  CREATOR_FOLDER_KEY,
  isWidgetBackedAppActive,
  LAYOUT_VERSION_C1,
  WIDGET_APP_LINKS,
} from "./home-layout.js";
import { normalizeIconOverrides } from "./icon-face.js";

const PREFS_KEY = "yueqi.phone.os.v1";

export const WALLPAPERS = [
  { id: "dawn", label: "晨雾", tone: "light" },
  { id: "rose", label: "暮蔷", tone: "light" },
  { id: "mist", label: "青岚", tone: "light" },
  { id: "ink", label: "夜墨", tone: "dark" },
  { id: "sand", label: "暖沙", tone: "light" },
];

export const WALLPAPER_PRESET_IDS = new Set(WALLPAPERS.map((item) => item.id));

/** @returns {{ lockScreen: string, homeScreen: string }} */
export function defaultWallpaperPair() {
  return { lockScreen: "dawn", homeScreen: "dawn" };
}

/**
 * Normalize legacy `wallpaper: "dawn"` or object pair into lock/home values.
 * Values are preset ids or image URLs / data URLs.
 */
export function normalizeWallpaperPair(raw) {
  const fallback = defaultWallpaperPair();
  if (!raw) return fallback;
  if (typeof raw === "string") {
    const id = WALLPAPER_PRESET_IDS.has(raw) ? raw : "dawn";
    return { lockScreen: id, homeScreen: id };
  }
  if (typeof raw === "object") {
    const lockScreen = sanitizeWallpaperValue(raw.lockScreen, fallback.lockScreen);
    const homeScreen = sanitizeWallpaperValue(raw.homeScreen, fallback.homeScreen);
    return { lockScreen, homeScreen };
  }
  return fallback;
}

function sanitizeWallpaperValue(value, fallback) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (WALLPAPER_PRESET_IDS.has(text)) return text;
  if (text.startsWith("data:image/") || /^https?:\/\//i.test(text)) return text;
  return fallback;
}

export function wallpaperMeta(id = "dawn") {
  return WALLPAPERS.find((item) => item.id === id) || WALLPAPERS[0];
}

/** Tone for status-bar contrast: prefer home screen. */
export function wallpaperToneForPair(pair, sampleTone = "light") {
  const home = pair?.homeScreen;
  if (WALLPAPER_PRESET_IDS.has(home)) return wallpaperMeta(home).tone;
  return sampleTone === "dark" ? "dark" : "light";
}

export { DEFAULT_ICON_ORDER, HOME_PAGE_COUNT };

export const DEFAULT_WIDGETS = {
  clock: true,
  today: true,
  calendar: true,
  listen: true,
  scenario: false,
  // Legacy keys kept for prefs merge / old saves
  agenda: false,
  presence: false,
  relation: false,
  status: false,
  bubble: false,
  music: false,
};

export const DEFAULT_WIDGET_ORDER = ["clock", "today", "listen", "calendar"];

const WIDGET_DOCK_RESTORE_IDS = new Set(["pop", "listen"]);

/**
 * @param {unknown} raw
 * @param {Record<string, boolean>} enabled
 */
export function normalizeWidgetOrder(raw, enabled = DEFAULT_WIDGETS) {
  const bag = { ...DEFAULT_WIDGETS, ...(enabled || {}) };
  bag.presence = false;
  bag.relation = false;
  bag.status = false;
  bag.bubble = false;
  bag.music = false;
  bag.agenda = false;
  if (bag.calendar == null) bag.calendar = true;
  const allowed = DEFAULT_WIDGET_ORDER.filter((id) => bag[id] !== false);
  const seen = new Set();
  const next = [];
  const source = Array.isArray(raw) ? raw.map((id) => (id === "agenda" ? "calendar" : id)) : DEFAULT_WIDGET_ORDER;
  for (const id of source) {
    if (id === "presence" || id === "relation" || id === "status" || id === "bubble" || id === "music" || id === "agenda" || id === "scenario") continue;
    if (!allowed.includes(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  for (const id of allowed) {
    if (seen.has(id)) continue;
    next.push(id);
  }
  return next;
}

function normalizeWidgets(raw = {}) {
  const widgets = { ...DEFAULT_WIDGETS, ...(raw || {}) };
  widgets.presence = false;
  widgets.relation = false;
  widgets.status = false;
  widgets.bubble = false;
  widgets.music = false;
  widgets.agenda = false;
  if (widgets.clock == null) widgets.clock = true;
  if (widgets.today == null) widgets.today = true;
  if (widgets.calendar == null) widgets.calendar = true;
  if (widgets.listen == null) widgets.listen = true;
  widgets.scenario = false;
  return widgets;
}

/**
 * Keep one launch surface per app. Enabled page-one widgets win over dock,
 * icon pages, and folders; disabled widgets restore their app entry.
 */
export function reconcileWidgetAppPlacement({
  iconOrder = [],
  dockOrder = [],
  folders = {},
  widgets = DEFAULT_WIDGETS,
  iconPageCount = MIN_ICON_PAGES,
} = {}) {
  let pages = clampIconPageCount(iconPageCount);
  let order = Array.isArray(iconOrder) ? iconOrder.slice() : [];
  while (order.length < iconSlotsForPages(pages)) order.push(null);
  let dock = normalizeDockOrder(dockOrder, []);
  const nextFolders = {};
  for (const [key, folder] of Object.entries(folders || {})) {
    if (!folder || !Array.isArray(folder.apps)) continue;
    nextFolders[key] = {
      ...folder,
      apps: folder.apps.slice(),
    };
  }

  const activeApps = new Set(activeWidgetAppIds(widgets));
  order = order.map((id) => (activeApps.has(id) ? null : id));
  dock = dock.map((id) => (activeApps.has(id) ? null : id));

  for (const [key, folder] of Object.entries(nextFolders)) {
    folder.apps = folder.apps.filter((id) => !activeApps.has(id));
    if (!folder.apps.length) {
      delete nextFolders[key];
      order = order.map((id) => (id === `folder:${key}` ? null : id));
    }
  }

  // Dock is the second-highest-priority surface. A docked app cannot also sit
  // on an icon page or inside a folder.
  dock = normalizeDockOrder(dock, []);
  const dockApps = new Set(dock.filter(Boolean));
  order = order.map((id) => (dockApps.has(id) ? null : id));
  for (const [key, folder] of Object.entries(nextFolders)) {
    folder.apps = folder.apps.filter((id) => !dockApps.has(id));
    if (!folder.apps.length) {
      delete nextFolders[key];
      order = order.map((id) => (id === `folder:${key}` ? null : id));
    }
  }

  const hasApp = (appId) => (
    order.includes(appId)
    || dock.includes(appId)
    || Object.values(nextFolders).some((folder) => folder.apps.includes(appId))
  );

  const putOnGrid = (appId) => {
    let free = order.findIndex(isEmptySlot);
    if (free < 0 && pages < MAX_ICON_PAGES) {
      pages += 1;
      while (order.length < iconSlotsForPages(pages)) order.push(null);
      free = order.findIndex(isEmptySlot);
    }
    if (free >= 0) order[free] = appId;
  };

  for (const [widgetId, appId] of Object.entries(WIDGET_APP_LINKS)) {
    if (widgets?.[widgetId] !== false || hasApp(appId)) continue;
    if (WIDGET_DOCK_RESTORE_IDS.has(appId)) {
      const freeDock = dock.findIndex(isEmptySlot);
      if (freeDock >= 0) {
        dock[freeDock] = appId;
        continue;
      }
    }
    putOnGrid(appId);
  }

  return {
    iconOrder: order,
    dockOrder: normalizeDockOrder(dock, order),
    folders: nextFolders,
    iconPageCount: pages,
  };
}

function trimTrailingEmptyIconPages(placement) {
  const order = Array.isArray(placement?.iconOrder) ? placement.iconOrder : [];
  let lastUsed = -1;
  for (let index = order.length - 1; index >= 0; index -= 1) {
    if (!isEmptySlot(order[index])) {
      lastUsed = index;
      break;
    }
  }
  const pages = clampIconPageCount(Math.max(1, Math.ceil((lastUsed + 1) / ICONS_PER_PAGE)));
  return {
    ...placement,
    iconOrder: order.slice(0, iconSlotsForPages(pages)),
    iconPageCount: pages,
  };
}

const DEFAULT_PREFS = {
  layoutVersion: LAYOUT_VERSION_C1,
  wallpaper: defaultWallpaperPair(),
  wallpaperTone: "light",
  passcode: "0000",
  passcodeEnabled: false,
  iconOrder: packIconSlots(DEFAULT_ICON_ORDER),
  dockOrder: [...DEFAULT_DOCK_ORDER],
  folders: JSON.parse(JSON.stringify(DEFAULT_FOLDERS)),
  iconOverrides: {},
  widgets: { ...DEFAULT_WIDGETS },
  widgetOrder: [...DEFAULT_WIDGET_ORDER],
  pageCount: HOME_PAGE_COUNT,
  iconPageCount: MIN_ICON_PAGES,
  homePageIndex: 0,
};

function normalizeFolders(rawFolders = {}, order = []) {
  const next = {};
  const usedApps = new Set();
  const folderEntries = (order || []).filter(isFolderEntry).map(folderKeyFromEntry);

  for (const key of folderEntries) {
    const folder = rawFolders?.[key];
    if (!folder || typeof folder !== "object") continue;
    const apps = [];
    for (const appId of Array.isArray(folder.apps) ? folder.apps : []) {
      if (!PHONE_APP_MAP[appId]) continue;
      if (usedApps.has(appId)) continue;
      usedApps.add(appId);
      apps.push(appId);
    }
    if (!apps.length) continue;
    next[key] = {
      name: String(folder.name || "文件夹").slice(0, 12),
      apps,
    };
  }
  return next;
}

function isValidHomeId(id, folders, folderApps, seen) {
  if (isEmptySlot(id) || seen.has(id)) return false;
  if (isFolderEntry(id)) return Boolean(folders[folderKeyFromEntry(id)]);
  if (isExtDesktopId(id) || isGameDesktopId(id)) return true;
  return Boolean(PHONE_APP_MAP[id]) && !folderApps.has(id);
}

/**
 * Fixed-length slot array (null = empty). Migrates legacy dense / 4×4 lists.
 * @param {unknown} order
 * @param {object} folders
 * @param {number} [iconPageCount]
 */
export function normalizeIconOrder(order = [], folders = {}, iconPageCount = MIN_ICON_PAGES) {
  let pages = clampIconPageCount(iconPageCount);
  let source = Array.isArray(order) ? order : DEFAULT_ICON_ORDER;
  // Migrate legacy 4×4 pages (16 slots/page) → 4×6 (24 slots/page).
  const legacyPerPage = 16;
  const legacyPages = Math.max(1, Math.round(source.length / legacyPerPage));
  if (source.length === legacyPerPage * legacyPages && ICONS_PER_PAGE !== legacyPerPage && legacyPages <= ICON_PAGE_MAX) {
    const migrated = Array.from({ length: legacyPages * ICONS_PER_PAGE }, () => null);
    for (let page = 0; page < legacyPages; page += 1) {
      for (let i = 0; i < legacyPerPage; i += 1) {
        migrated[page * ICONS_PER_PAGE + i] = source[page * legacyPerPage + i] ?? null;
      }
    }
    source = migrated;
    pages = clampIconPageCount(legacyPages);
  }
  // Grow page count if saved order is longer than requested pages.
  pages = clampIconPageCount(Math.max(pages, iconPageCountFromOrder(source)));
  const slotCount = iconSlotsForPages(pages);
  if (source.length > ICON_SLOT_COUNT) {
    source = source.slice(0, ICON_SLOT_COUNT);
  }

  const probe = source.filter((id) => !isEmptySlot(id));
  const normalizedFolders = normalizeFolders(folders, probe);
  const folderApps = new Set();
  Object.values(normalizedFolders).forEach((folder) => {
    folder.apps.forEach((id) => folderApps.add(id));
  });

  const seen = new Set();
  const slots = Array.from({ length: slotCount }, () => null);
  const sparse = source.length >= ICONS_HINT_SPARSE() || source.some(isEmptySlot);

  if (sparse) {
    const len = Math.min(slotCount, source.length);
    for (let i = 0; i < len; i += 1) {
      const id = source[i];
      if (!isValidHomeId(id, normalizedFolders, folderApps, seen)) continue;
      slots[i] = id;
      seen.add(id);
    }
  } else {
    let cursor = 0;
    for (const id of source) {
      if (!isValidHomeId(id, normalizedFolders, folderApps, seen)) continue;
      if (cursor >= slotCount) break;
      slots[cursor] = id;
      seen.add(id);
      cursor += 1;
    }
  }

  for (const id of DEFAULT_ICON_ORDER) {
    if (seen.has(id) || folderApps.has(id)) continue;
    if (isFolderEntry(id) && !normalizedFolders[folderKeyFromEntry(id)]) continue;
    const free = slots.indexOf(null);
    if (free < 0) break;
    slots[free] = id;
    seen.add(id);
  }

  for (const id of probe) {
    if (!isFolderEntry(id) || seen.has(id)) continue;
    if (!normalizedFolders[folderKeyFromEntry(id)]) continue;
    const free = slots.indexOf(null);
    if (free < 0) break;
    slots[free] = id;
    seen.add(id);
  }

  return { iconOrder: slots, folders: normalizedFolders, iconPageCount: pages };
}

function ICONS_HINT_SPARSE() {
  return Math.floor(ICON_SLOT_COUNT * 0.75);
}

/**
 * One-shot layout: consumer grid only; strip creator folder + frozen root icons.
 */
export function buildC1HomePrefs(base = {}) {
  const folders = {};
  // Preserve any user folders that are not the deleted creator hub
  if (base.folders && typeof base.folders === "object") {
    for (const [key, folder] of Object.entries(base.folders)) {
      if (key === CREATOR_FOLDER_KEY) continue;
      if (!folder || !Array.isArray(folder.apps) || !folder.apps.length) continue;
      const apps = folder.apps.filter((id) => PHONE_APP_MAP[id] && !FROZEN_HOME_APP_IDS.includes(id));
      if (!apps.length) continue;
      folders[key] = {
        name: String(folder.name || "文件夹").slice(0, 12),
        apps,
      };
    }
  }

  const dense = [...DEFAULT_ICON_ORDER].filter((id) => id !== CREATOR_FOLDER_ENTRY);

  const dockOrder = normalizeDockOrder(DEFAULT_DOCK_ORDER, []);
  const iconPageCount = clampIconPageCount(base.iconPageCount || MIN_ICON_PAGES);
  const normalized = normalizeIconOrder(
    stripDockFromIconOrder(packIconSlots(dense, iconPageCount), dockOrder),
    folders,
    iconPageCount,
  );
  const widgets = normalizeWidgets(base.widgets);
  const placement = reconcileWidgetAppPlacement({
    iconOrder: stripDockFromIconOrder(normalized.iconOrder, dockOrder),
    dockOrder,
    folders: normalized.folders,
    widgets,
    iconPageCount: normalized.iconPageCount,
  });

  return {
    layoutVersion: LAYOUT_VERSION_C1,
    wallpaper: normalizeWallpaperPair(base.wallpaper),
    wallpaperTone: base.wallpaperTone === "dark" ? "dark" : "light",
    passcode: /^\d{4}$/.test(String(base.passcode || "")) ? String(base.passcode) : "0000",
    passcodeEnabled: base.passcodeEnabled === true,
    iconOrder: placement.iconOrder,
    dockOrder: placement.dockOrder,
    folders: placement.folders,
    iconOverrides: normalizeIconOverrides(base.iconOverrides),
    widgets,
    widgetOrder: normalizeWidgetOrder(base.widgetOrder, widgets),
    pageCount: totalHomePages(placement.iconPageCount),
    iconPageCount: placement.iconPageCount,
    homePageIndex: clampHomePageIndex(base.homePageIndex, placement.iconPageCount),
  };
}

function clampHomePageIndex(value, iconPageCount = MIN_ICON_PAGES) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(totalHomePages(iconPageCount) - 1, Math.floor(n)));
}

function needsC1Migration(raw) {
  if (!raw || typeof raw !== "object") return true;
  if (raw.layoutVersion !== LAYOUT_VERSION_C1) return true;
  // Strip legacy 创作者 hub
  const order = Array.isArray(raw.iconOrder) ? raw.iconOrder : [];
  if (order.includes(CREATOR_FOLDER_ENTRY) || raw.folders?.[CREATOR_FOLDER_KEY]) return true;
  return false;
}

export function loadPhoneOsPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (!raw || typeof raw !== "object" || needsC1Migration(raw)) {
      const migrated = buildC1HomePrefs(raw && typeof raw === "object" ? raw : {});
      localStorage.setItem(PREFS_KEY, JSON.stringify(migrated));
      return migrated;
    }
    const wallpaper = normalizeWallpaperPair(raw.wallpaper);
    const wallpaperTone = raw.wallpaperTone === "dark" ? "dark" : "light";
    const passcode = /^\d{4}$/.test(String(raw.passcode || "")) ? String(raw.passcode) : "0000";
    const dockOrder = normalizeDockOrder(
      Array.isArray(raw.dockOrder) ? raw.dockOrder : DEFAULT_DOCK_ORDER,
      [],
    );
    const foldersIn = {
      ...(raw.folders || {}),
    };
    delete foldersIn[CREATOR_FOLDER_KEY];
    const normalized = normalizeIconOrder(
      stripDockFromIconOrder(
        (Array.isArray(raw.iconOrder) ? raw.iconOrder : DEFAULT_ICON_ORDER)
          .map((id) => (id === CREATOR_FOLDER_ENTRY ? null : id)),
        dockOrder,
      ),
      foldersIn,
      raw.iconPageCount,
    );
    // Keep 栖市钉到桌面的体验 App；只清掉已删除的产品壳 id
    const REMOVED_SHELL_IDS = new Set(["sidewrite", "story", "studio", "experience-studio"]);
    const cleanedOrder = stripDockFromIconOrder(
      normalized.iconOrder.map((id) => (REMOVED_SHELL_IDS.has(id) ? null : id)),
      dockOrder,
    );
    const widgets = normalizeWidgets(raw.widgets);
    const placement = trimTrailingEmptyIconPages(reconcileWidgetAppPlacement({
      iconOrder: cleanedOrder,
      dockOrder,
      folders: normalized.folders,
      widgets,
      iconPageCount: normalized.iconPageCount,
    }));
    const next = {
      layoutVersion: LAYOUT_VERSION_C1,
      wallpaper,
      wallpaperTone,
      passcode,
      passcodeEnabled: raw.passcodeEnabled === true,
      iconOrder: placement.iconOrder,
      dockOrder: placement.dockOrder,
      folders: placement.folders,
      iconOverrides: normalizeIconOverrides(raw.iconOverrides),
      widgets,
      widgetOrder: normalizeWidgetOrder(raw.widgetOrder, widgets),
      pageCount: totalHomePages(placement.iconPageCount),
      iconPageCount: placement.iconPageCount,
      homePageIndex: clampHomePageIndex(raw.homePageIndex, placement.iconPageCount),
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_PREFS));
  }
}

export function savePhoneOsPrefs(prefs) {
  const dockOrder = normalizeDockOrder(
    prefs?.dockOrder || DEFAULT_DOCK_ORDER,
    [],
  );
  const foldersIn = {
    ...DEFAULT_FOLDERS,
    ...(prefs?.folders || {}),
  };
  delete foldersIn[CREATOR_FOLDER_KEY];
  const normalized = normalizeIconOrder(
    stripDockFromIconOrder(
      (prefs?.iconOrder || packIconSlots(DEFAULT_ICON_ORDER))
        .map((id) => (id === CREATOR_FOLDER_ENTRY ? null : id)),
      dockOrder,
    ),
    foldersIn,
    prefs?.iconPageCount,
  );
  const REMOVED_SHELL_IDS = new Set(["sidewrite", "story", "studio", "experience-studio"]);
  const cleanedOrder = stripDockFromIconOrder(
    normalized.iconOrder.map((id) => (REMOVED_SHELL_IDS.has(id) ? null : id)),
    dockOrder,
  );
  const widgets = normalizeWidgets(prefs?.widgets);
  const placement = reconcileWidgetAppPlacement({
    iconOrder: cleanedOrder,
    dockOrder,
    folders: normalized.folders,
    widgets,
    iconPageCount: normalized.iconPageCount,
  });
  const next = {
    ...DEFAULT_PREFS,
    ...prefs,
    layoutVersion: LAYOUT_VERSION_C1,
    wallpaper: normalizeWallpaperPair(prefs?.wallpaper),
    wallpaperTone: prefs?.wallpaperTone === "dark" ? "dark" : "light",
    iconOrder: placement.iconOrder,
    dockOrder: placement.dockOrder,
    folders: placement.folders,
    iconOverrides: normalizeIconOverrides(prefs?.iconOverrides),
    widgets,
    widgetOrder: normalizeWidgetOrder(
      prefs?.widgetOrder,
      widgets,
    ),
    pageCount: totalHomePages(placement.iconPageCount),
    iconPageCount: placement.iconPageCount,
    homePageIndex: clampHomePageIndex(prefs?.homePageIndex, placement.iconPageCount),
  };
  delete next.iconLayout;
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

/** Insert builtin app id into first empty home slot and persist. */
export function addAppIconToHome(appId) {
  const id = String(appId || "").trim();
  if (!id || !PHONE_APP_MAP[id]) return loadPhoneOsPrefs();
  const prefs = loadPhoneOsPrefs();
  if (isWidgetBackedAppActive(id, prefs.widgets)) return prefs;
  if (prefs.iconOrder.includes(id) || (prefs.dockOrder || []).includes(id)) return prefs;
  let nextOrder = prefs.iconOrder.slice();
  let iconPageCount = clampIconPageCount(prefs.iconPageCount || MIN_ICON_PAGES);
  let free = nextOrder.findIndex((slot) => isEmptySlot(slot));
  if (free < 0) {
    if (iconPageCount >= MAX_ICON_PAGES) return prefs;
    iconPageCount += 1;
    const slots = iconSlotsForPages(iconPageCount);
    while (nextOrder.length < slots) nextOrder.push(null);
    free = nextOrder.findIndex((slot) => isEmptySlot(slot));
  }
  if (free < 0) return prefs;
  nextOrder[free] = id;
  return savePhoneOsPrefs({ ...prefs, iconOrder: nextOrder, iconPageCount });
}

/** Remove builtin app id from home / dock. */
export function removeAppIconFromHome(appId) {
  const id = String(appId || "").trim();
  const prefs = loadPhoneOsPrefs();
  return savePhoneOsPrefs({
    ...prefs,
    iconOrder: prefs.iconOrder.map((slot) => (slot === id ? null : slot)),
    dockOrder: (prefs.dockOrder || []).map((slot) => (slot === id ? null : slot)),
  });
}

/** Whether a builtin / dock / grid id is currently on the home surface. */
export function isAppOnHome(appId) {
  const id = String(appId || "").trim();
  if (!id) return false;
  const prefs = loadPhoneOsPrefs();
  return isWidgetBackedAppActive(id, prefs.widgets)
    || prefs.iconOrder.includes(id)
    || (prefs.dockOrder || []).includes(id)
    || Object.values(prefs.folders || {}).some((folder) => folder?.apps?.includes(id));
}

/** Insert ext:<id> into first empty home slot and persist. */
export function addExtIconToHome(extId) {
  const prefs = loadPhoneOsPrefs();
  const desktopId = `ext:${String(extId || "").trim()}`;
  if (prefs.iconOrder.includes(desktopId)) return prefs;
  const nextOrder = prefs.iconOrder.slice();
  const free = nextOrder.findIndex((id) => isEmptySlot(id));
  if (free >= 0) nextOrder[free] = desktopId;
  else nextOrder.push(desktopId);
  return savePhoneOsPrefs({ ...prefs, iconOrder: nextOrder });
}

/** Remove ext:<id> from home / dock. */
export function removeExtIconFromHome(extId) {
  const prefs = loadPhoneOsPrefs();
  const desktopId = `ext:${String(extId || "").trim()}`;
  return savePhoneOsPrefs({
    ...prefs,
    iconOrder: prefs.iconOrder.map((id) => (id === desktopId ? null : id)),
    dockOrder: (prefs.dockOrder || []).map((id) => (id === desktopId ? null : id)),
  });
}

/** Insert game:<id> into first empty home slot and persist. */
export function addGameIconToHome(gameId) {
  const prefs = loadPhoneOsPrefs();
  const desktopId = `game:${String(gameId || "").trim()}`;
  if (prefs.iconOrder.includes(desktopId)) return prefs;
  const nextOrder = prefs.iconOrder.slice();
  const free = nextOrder.findIndex((id) => isEmptySlot(id));
  if (free >= 0) nextOrder[free] = desktopId;
  else nextOrder.push(desktopId);
  return savePhoneOsPrefs({ ...prefs, iconOrder: nextOrder });
}

/** Remove game:<id> from home / dock. */
export function removeGameIconFromHome(gameId) {
  const prefs = loadPhoneOsPrefs();
  const desktopId = `game:${String(gameId || "").trim()}`;
  return savePhoneOsPrefs({
    ...prefs,
    iconOrder: prefs.iconOrder.map((id) => (id === desktopId ? null : id)),
    dockOrder: (prefs.dockOrder || []).map((id) => (id === desktopId ? null : id)),
  });
}
