/**
 * NyraPop host bridge — permission-gated API for sideloaded chat plugins
 */

import {
  PermissionDeniedError,
  checkPermission,
} from "./kinds.js";
import {
  getInstalledPlugin,
  grantPluginPermission,
} from "./registry-plugins.js";

const PLUGIN_STORAGE_KEY = "yueqi.yeos.plugin.storage.v1";

function readPluginStorageBag() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return {};
    return JSON.parse(window.localStorage.getItem(PLUGIN_STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writePluginStorageBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(PLUGIN_STORAGE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   pkgId: string,
 *   permissions?: string[],
 *   grantedPermissions?: string[],
 *   getSession?: () => Promise<object>|object,
 *   inject?: (input: { kind?: string, text?: string, meta?: object }) => Promise<void>|void,
 *   openPanel?: (opts?: { height?: string }) => Promise<void>|void,
 *   closePanel?: () => Promise<void>|void,
 *   setToolbarBadge?: (text: string|null) => Promise<void>|void,
 *   getPanelRoot?: () => HTMLElement|null,
 *   requestPermissionUi?: (permissionId: string, meta?: object) => Promise<boolean>,
 * }} deps
 */
export function createNyraPopBridge(deps) {
  const pkgId = String(deps.pkgId || "").trim();
  const declared = Array.isArray(deps.permissions) ? deps.permissions : [];

  function currentGranted() {
    if (Array.isArray(deps.grantedPermissions)) return deps.grantedPermissions;
    return getInstalledPlugin(pkgId)?.grantedPermissions || [];
  }

  async function ensure(permissionId) {
    if (!declared.includes(permissionId)) {
      throw new PermissionDeniedError(permissionId, "此插件未声明该权限");
    }
    if (checkPermission(currentGranted(), permissionId)) return;
    const allowed = deps.requestPermissionUi
      ? await deps.requestPermissionUi(permissionId, { pkgId, plugin: getInstalledPlugin(pkgId) })
      : false;
    if (allowed) {
      grantPluginPermission(pkgId, permissionId);
      return;
    }
    throw new PermissionDeniedError(permissionId);
  }

  const storage = {
    async get(key) {
      await ensure("storage.read");
      const bag = readPluginStorageBag();
      return bag?.[pkgId]?.[String(key || "")] ?? null;
    },
    async set(key, value) {
      await ensure("storage.write");
      const bag = readPluginStorageBag();
      if (!bag[pkgId] || typeof bag[pkgId] !== "object") bag[pkgId] = {};
      bag[pkgId][String(key || "")] = value;
      writePluginStorageBag(bag);
    },
  };

  return {
    async getSession() {
      await ensure("pop.session");
      return Promise.resolve(deps.getSession?.() || { sessionId: "", kind: "dm", title: "聊天" });
    },
    async setToolbarBadge(text) {
      await ensure("pop.plugin");
      await Promise.resolve(deps.setToolbarBadge?.(text == null ? null : String(text)));
    },
    async openPanel(opts = {}) {
      await ensure("pop.plugin");
      await Promise.resolve(deps.openPanel?.(opts));
    },
    async closePanel() {
      await ensure("pop.plugin");
      await Promise.resolve(deps.closePanel?.());
    },
    async inject(input = {}) {
      await ensure("pop.inject");
      await Promise.resolve(deps.inject?.(input));
    },
    storage,
  };
}

/**
 * @param {InstalledPlugin} plugin
 */
export async function loadPopPluginModule(plugin) {
  const entry = String(plugin?.manifest?.entry || "plugin.js").trim();
  const code = plugin?.files?.[entry];
  if (!code) throw new Error("插件入口缺失");
  const blob = new Blob([code], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(/* @vite-ignore */ url);
    return mod.default || mod;
  } finally {
    URL.revokeObjectURL(url);
  }
}
