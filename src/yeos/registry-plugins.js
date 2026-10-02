/**
 * Installed YEOS Pop plugins — yueqi.yeos.plugins.v1
 */

import { validatePluginManifest } from "./manifest-schema.js";

export const YEOS_PLUGINS_STORE_KEY = "yueqi.yeos.plugins.v1";

/**
 * @typedef {object} InstalledPlugin
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
    if (typeof window === "undefined" || !window.localStorage) return { plugins: [] };
    const raw = JSON.parse(window.localStorage.getItem(YEOS_PLUGINS_STORE_KEY) || "{}");
    return {
      plugins: Array.isArray(raw?.plugins) ? raw.plugins : [],
    };
  } catch {
    return { plugins: [] };
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(YEOS_PLUGINS_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

export function listInstalledPlugins() {
  return readBag().plugins.map((item) => ({
    ...item,
    grantedPermissions: Array.isArray(item.grantedPermissions) ? item.grantedPermissions : [],
  }));
}

export function getInstalledPlugin(id) {
  return listInstalledPlugins().find((item) => item.id === id) || null;
}

/**
 * @param {Partial<InstalledPlugin> & { manifest: object }} record
 */
export function upsertInstalledPlugin(record) {
  const validated = validatePluginManifest(record.manifest);
  if (!validated.ok) return { ok: false, ...validated };
  const bag = readBag();
  const now = nowIso();
  const existing = bag.plugins.find((item) => item.id === validated.manifest.id);
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
  bag.plugins = [...bag.plugins.filter((item) => item.id !== next.id), next];
  writeBag(bag);
  return { ok: true, plugin: next };
}

export function uninstallPlugin(pluginId) {
  const bag = readBag();
  bag.plugins = bag.plugins.filter((item) => item.id !== pluginId);
  writeBag(bag);
  return true;
}

export function setPluginEnabled(pluginId, enabled) {
  const bag = readBag();
  bag.plugins = bag.plugins.map((item) => (
    item.id === pluginId ? { ...item, enabled: Boolean(enabled), updatedAt: nowIso() } : item
  ));
  writeBag(bag);
  return getInstalledPlugin(pluginId);
}

export function grantPluginPermission(pluginId, permissionId) {
  const bag = readBag();
  bag.plugins = bag.plugins.map((item) => {
    if (item.id !== pluginId) return item;
    const granted = new Set(item.grantedPermissions || []);
    granted.add(permissionId);
    return { ...item, grantedPermissions: [...granted], updatedAt: nowIso() };
  });
  writeBag(bag);
  return getInstalledPlugin(pluginId);
}

export function revokePluginPermission(pluginId, permissionId) {
  const bag = readBag();
  bag.plugins = bag.plugins.map((item) => {
    if (item.id !== pluginId) return item;
    return {
      ...item,
      grantedPermissions: (item.grantedPermissions || []).filter((p) => p !== permissionId),
      updatedAt: nowIso(),
    };
  });
  writeBag(bag);
  return getInstalledPlugin(pluginId);
}

export function exportPluginsBag() {
  return { plugins: listInstalledPlugins() };
}

export function importPluginsBag(payload, { mergePermissions = false } = {}) {
  const list = Array.isArray(payload?.plugins) ? payload.plugins : [];
  const bag = { plugins: [] };
  for (const item of list) {
    const validated = validatePluginManifest(item?.manifest || item);
    if (!validated.ok) continue;
    const existing = mergePermissions ? getInstalledPlugin(validated.manifest.id) : null;
    bag.plugins.push({
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
