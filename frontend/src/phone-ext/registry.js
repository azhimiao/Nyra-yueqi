/**
 * 已装扩展 registry（F7 H1/H2）
 */

import { validateManifest, toExtDesktopId, parseExtDesktopId } from "./manifest-schema.js";

export const EXTENSIONS_STORE_KEY = "yueqi.phone.extensions.v1";

/**
 * @typedef {object} InstalledExtension
 * @property {string} id
 * @property {object} manifest
 * @property {string} installedAt
 * @property {string} updatedAt
 * @property {boolean} enabled
 * @property {string[]} grantedPermissions
 * @property {string} [iconDataUrl]
 * @property {"sideload"|"cloud"} source
 * @property {string} [packageSha256]
 * @property {Record<string, string>} [files] entry path → text/data url
 */

function nowIso() {
  return new Date().toISOString();
}

function readBag() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return { extensions: [] };
    const raw = JSON.parse(window.localStorage.getItem(EXTENSIONS_STORE_KEY) || "{}");
    return {
      extensions: Array.isArray(raw?.extensions) ? raw.extensions : [],
    };
  } catch {
    return { extensions: [] };
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(EXTENSIONS_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

/**
 * Pure: insert ext desktop id into first empty icon slot.
 * @param {(string|null)[]} iconOrder
 * @param {string} extId
 */
export function insertExtIntoIconOrder(iconOrder = [], extId) {
  const desktopId = toExtDesktopId(extId);
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
 * Pure: remove all ext:<id> slots.
 * @param {(string|null)[]} iconOrder
 * @param {string} extId
 */
export function removeExtFromIconOrder(iconOrder = [], extId) {
  const desktopId = toExtDesktopId(extId);
  return (Array.isArray(iconOrder) ? iconOrder : []).map((id) => (
    id === desktopId ? null : id
  ));
}

/**
 * Pure: strip any ext:* that is not in installed ids.
 * @param {(string|null)[]} iconOrder
 * @param {string[]} installedIds
 */
export function pruneExtIcons(iconOrder = [], installedIds = []) {
  const allow = new Set(installedIds.map((id) => toExtDesktopId(id)));
  return (Array.isArray(iconOrder) ? iconOrder : []).map((id) => {
    const parsed = parseExtDesktopId(id);
    if (!parsed) return id;
    return allow.has(id) ? id : null;
  });
}

/**
 * In-memory registry for verify / unit tests.
 */
export function createMemoryRegistry(seed = []) {
  /** @type {InstalledExtension[]} */
  let extensions = seed.map((item) => ({ ...item }));

  return {
    list() {
      return extensions.map((item) => ({ ...item, grantedPermissions: [...(item.grantedPermissions || [])] }));
    },
    get(id) {
      const hit = extensions.find((item) => item.id === id);
      return hit ? { ...hit, grantedPermissions: [...(hit.grantedPermissions || [])] } : null;
    },
    /**
     * @param {{ manifest: object, files?: Record<string,string>, iconDataUrl?: string, source?: string, packageSha256?: string, iconOrder?: (string|null)[] }} input
     */
    install(input = {}) {
      const validated = validateManifest(input.manifest);
      if (!validated.ok) return { ok: false, code: validated.code, message: validated.message, iconOrder: input.iconOrder || [] };
      const now = nowIso();
      const existing = extensions.find((item) => item.id === validated.manifest.id);
      const record = {
        id: validated.manifest.id,
        manifest: validated.manifest,
        installedAt: existing?.installedAt || now,
        updatedAt: now,
        enabled: existing?.enabled !== false,
        grantedPermissions: existing?.grantedPermissions || [],
        iconDataUrl: input.iconDataUrl || existing?.iconDataUrl,
        source: input.source === "cloud" ? "cloud" : "sideload",
        packageSha256: input.packageSha256 || existing?.packageSha256,
        files: input.files || existing?.files || {},
      };
      extensions = [...extensions.filter((item) => item.id !== record.id), record];
      const iconOrder = insertExtIntoIconOrder(input.iconOrder || [], record.id);
      return { ok: true, extension: record, iconOrder };
    },
    uninstall(extId, iconOrder = []) {
      extensions = extensions.filter((item) => item.id !== extId);
      return {
        ok: true,
        iconOrder: removeExtFromIconOrder(iconOrder, extId),
      };
    },
    setGranted(extId, permissions) {
      const idx = extensions.findIndex((item) => item.id === extId);
      if (idx < 0) return null;
      const next = {
        ...extensions[idx],
        grantedPermissions: [...new Set(permissions || [])],
        updatedAt: nowIso(),
      };
      extensions = extensions.slice();
      extensions[idx] = next;
      return next;
    },
    grant(extId, permissionId) {
      const cur = this.get(extId);
      if (!cur) return null;
      if (cur.grantedPermissions.includes(permissionId)) return cur;
      return this.setGranted(extId, [...cur.grantedPermissions, permissionId]);
    },
    revoke(extId, permissionId) {
      const cur = this.get(extId);
      if (!cur) return null;
      return this.setGranted(extId, cur.grantedPermissions.filter((p) => p !== permissionId));
    },
  };
}

export function listInstalledExtensions() {
  return readBag().extensions.map((item) => ({
    ...item,
    grantedPermissions: Array.isArray(item.grantedPermissions) ? item.grantedPermissions : [],
  }));
}

export function getInstalledExtension(id) {
  return listInstalledExtensions().find((item) => item.id === id) || null;
}

/**
 * @param {Partial<InstalledExtension> & { manifest: object }} record
 */
export function upsertInstalledExtension(record) {
  const validated = validateManifest(record.manifest);
  if (!validated.ok) return { ok: false, ...validated };
  const bag = readBag();
  const now = nowIso();
  const existing = bag.extensions.find((item) => item.id === validated.manifest.id);
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
  bag.extensions = [...bag.extensions.filter((item) => item.id !== next.id), next];
  writeBag(bag);
  return { ok: true, extension: next };
}

export function uninstallExtension(extId) {
  const bag = readBag();
  bag.extensions = bag.extensions.filter((item) => item.id !== extId);
  writeBag(bag);
  return true;
}

export function setExtensionEnabled(extId, enabled) {
  const bag = readBag();
  bag.extensions = bag.extensions.map((item) => (
    item.id === extId ? { ...item, enabled: Boolean(enabled), updatedAt: nowIso() } : item
  ));
  writeBag(bag);
  return getInstalledExtension(extId);
}

export function grantExtensionPermission(extId, permissionId) {
  const bag = readBag();
  bag.extensions = bag.extensions.map((item) => {
    if (item.id !== extId) return item;
    const granted = new Set(item.grantedPermissions || []);
    granted.add(permissionId);
    return { ...item, grantedPermissions: [...granted], updatedAt: nowIso() };
  });
  writeBag(bag);
  return getInstalledExtension(extId);
}

export function revokeExtensionPermission(extId, permissionId) {
  const bag = readBag();
  bag.extensions = bag.extensions.map((item) => {
    if (item.id !== extId) return item;
    return {
      ...item,
      grantedPermissions: (item.grantedPermissions || []).filter((p) => p !== permissionId),
      updatedAt: nowIso(),
    };
  });
  writeBag(bag);
  return getInstalledExtension(extId);
}

export function exportExtensionsBag() {
  return { extensions: listInstalledExtensions() };
}

export function importExtensionsBag(payload, { mergePermissions = false } = {}) {
  const list = Array.isArray(payload?.extensions) ? payload.extensions : [];
  const bag = { extensions: [] };
  for (const item of list) {
    const validated = validateManifest(item?.manifest || item);
    if (!validated.ok) continue;
    const existing = mergePermissions ? getInstalledExtension(validated.manifest.id) : null;
    bag.extensions.push({
      id: validated.manifest.id,
      manifest: validated.manifest,
      installedAt: item.installedAt || nowIso(),
      updatedAt: item.updatedAt || nowIso(),
      enabled: item.enabled !== false,
      // Restore does not silently expand grants — keep empty unless merge
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
