/**
 * Installed YEOS games — yueqi.yeos.games.v1
 */

import { validateGameManifest } from "./manifest-schema.js";
import { toGameDesktopId, parseGameDesktopId } from "./kinds.js";

export const YEOS_GAMES_STORE_KEY = "yueqi.yeos.games.v1";

/**
 * @typedef {object} InstalledGame
 * @property {string} id
 * @property {object} manifest
 * @property {string} installedAt
 * @property {string} updatedAt
 * @property {boolean} enabled
 * @property {string[]} grantedPermissions
 * @property {string} [iconDataUrl]
 * @property {"sideload"|"cloud"} source
 * @property {string} [packageSha256]
 * @property {Record<string, string>} [files]
 */

function nowIso() {
  return new Date().toISOString();
}

function readBag() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return { games: [] };
    const raw = JSON.parse(window.localStorage.getItem(YEOS_GAMES_STORE_KEY) || "{}");
    return {
      games: Array.isArray(raw?.games) ? raw.games : [],
    };
  } catch {
    return { games: [] };
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(YEOS_GAMES_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

/**
 * @param {(string|null)[]} iconOrder
 * @param {string} gameId
 */
export function insertGameIntoIconOrder(iconOrder = [], gameId) {
  const desktopId = toGameDesktopId(gameId);
  const next = Array.isArray(iconOrder) ? iconOrder.slice() : [];
  if (next.includes(desktopId)) return next;
  const free = next.findIndex((id) => id == null || id === "");
  if (free >= 0) {
    next[free] = desktopId;
    return next;
  }
  next.push(desktopId);
  return next;
}

/**
 * @param {(string|null)[]} iconOrder
 * @param {string} gameId
 */
export function removeGameFromIconOrder(iconOrder = [], gameId) {
  const desktopId = toGameDesktopId(gameId);
  return (Array.isArray(iconOrder) ? iconOrder : []).map((id) => (
    id === desktopId ? null : id
  ));
}

/**
 * @param {(string|null)[]} iconOrder
 * @param {string[]} installedIds
 */
export function pruneGameIcons(iconOrder = [], installedIds = []) {
  const allow = new Set(installedIds.map((id) => toGameDesktopId(id)));
  return (Array.isArray(iconOrder) ? iconOrder : []).map((id) => {
    const parsed = parseGameDesktopId(id);
    if (!parsed) return id;
    return allow.has(id) ? id : null;
  });
}

export function listInstalledGames() {
  return readBag().games.map((item) => ({
    ...item,
    grantedPermissions: Array.isArray(item.grantedPermissions) ? item.grantedPermissions : [],
  }));
}

export function getInstalledGame(id) {
  return listInstalledGames().find((item) => item.id === id) || null;
}

/**
 * @param {Partial<InstalledGame> & { manifest: object }} record
 */
export function upsertInstalledGame(record) {
  const validated = validateGameManifest(record.manifest);
  if (!validated.ok) return { ok: false, ...validated };
  const bag = readBag();
  const now = nowIso();
  const existing = bag.games.find((item) => item.id === validated.manifest.id);
  const next = {
    id: validated.manifest.id,
    manifest: validated.manifest,
    installedAt: existing?.installedAt || record.installedAt || now,
    updatedAt: now,
    enabled: record.enabled !== false && existing?.enabled !== false,
    grantedPermissions: Array.isArray(record.grantedPermissions)
      ? record.grantedPermissions
      : (existing?.grantedPermissions || []),
    iconDataUrl: record.iconDataUrl ?? existing?.iconDataUrl,
    source: record.source === "cloud" ? "cloud" : "sideload",
    packageSha256: record.packageSha256 || existing?.packageSha256,
    files: record.files || existing?.files || {},
  };
  bag.games = [...bag.games.filter((item) => item.id !== next.id), next];
  writeBag(bag);
  return { ok: true, game: next };
}

export function uninstallGame(gameId) {
  const bag = readBag();
  bag.games = bag.games.filter((item) => item.id !== gameId);
  writeBag(bag);
  return true;
}

export function setGameEnabled(gameId, enabled) {
  const bag = readBag();
  bag.games = bag.games.map((item) => (
    item.id === gameId ? { ...item, enabled: Boolean(enabled), updatedAt: nowIso() } : item
  ));
  writeBag(bag);
  return getInstalledGame(gameId);
}

export function grantGamePermission(gameId, permissionId) {
  const bag = readBag();
  bag.games = bag.games.map((item) => {
    if (item.id !== gameId) return item;
    const granted = new Set(item.grantedPermissions || []);
    granted.add(permissionId);
    return { ...item, grantedPermissions: [...granted], updatedAt: nowIso() };
  });
  writeBag(bag);
  return getInstalledGame(gameId);
}

export function revokeGamePermission(gameId, permissionId) {
  const bag = readBag();
  bag.games = bag.games.map((item) => {
    if (item.id !== gameId) return item;
    return {
      ...item,
      grantedPermissions: (item.grantedPermissions || []).filter((p) => p !== permissionId),
      updatedAt: nowIso(),
    };
  });
  writeBag(bag);
  return getInstalledGame(gameId);
}

export function exportGamesBag() {
  return { games: listInstalledGames() };
}

export function importGamesBag(payload, { mergePermissions = false } = {}) {
  const list = Array.isArray(payload?.games) ? payload.games : [];
  const bag = { games: [] };
  for (const item of list) {
    const validated = validateGameManifest(item?.manifest || item);
    if (!validated.ok) continue;
    const existing = mergePermissions ? getInstalledGame(validated.manifest.id) : null;
    bag.games.push({
      id: validated.manifest.id,
      manifest: validated.manifest,
      installedAt: item.installedAt || nowIso(),
      updatedAt: item.updatedAt || nowIso(),
      enabled: item.enabled !== false,
      grantedPermissions: mergePermissions
        ? (existing?.grantedPermissions || [])
        : [],
      iconDataUrl: item.iconDataUrl,
      source: item.source === "cloud" ? "cloud" : "sideload",
      packageSha256: item.packageSha256,
      files: item.files || {},
    });
  }
  writeBag(bag);
  return bag;
}
