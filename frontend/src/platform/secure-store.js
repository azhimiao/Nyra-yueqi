import { Preferences } from "@capacitor/preferences";
import { registerPlugin } from "@capacitor/core";
import { isNativePlatform, isPluginAvailable } from "./runtime.js";
import { getWebSecret, removeWebSecret, setWebSecret } from "./web-secrets.js";

/**
 * Secret storage.
 * - Web: sessionStorage via web-secrets (cleared when the browser session ends).
 * - Native: Android Keystore / iOS Keychain via NativeSecureStore, with a
 *   one-time migrate-and-delete from Capacitor Preferences.
 *
 */
const SECRET_PREFIX = "yueqi.secret.";
const NativeSecureStore = registerPlugin("NativeSecureStore");

function prefixed(key) {
  return `${SECRET_PREFIX}${key}`;
}

function nativeValue(result) {
  if (result == null || result.value == null) return null;
  return String(result.value);
}

export function createSecureStore({
  isNative = isNativePlatform,
  pluginAvailable = (name) => isPluginAvailable(name),
  vault = NativeSecureStore,
  prefs = Preferences,
  web = { getWebSecret, setWebSecret, removeWebSecret },
} = {}) {
  async function vaultReady() {
    if (!isNative() || !pluginAvailable("NativeSecureStore") || !vault) return false;
    if (typeof vault.isAvailable !== "function") return true;
    try {
      const status = await vault.isAvailable();
      return status?.available !== false;
    } catch {
      return false;
    }
  }

  async function readVault(fullKey) {
    if (!(await vaultReady())) return null;
    try {
      return nativeValue(await vault.get({ key: fullKey }));
    } catch {
      return null;
    }
  }

  async function writeVault(fullKey, value) {
    if (!(await vaultReady())) return false;
    try {
      if (!value) await vault.remove({ key: fullKey });
      else await vault.set({ key: fullKey, value });
      return true;
    } catch {
      return false;
    }
  }

  async function readPrefs(fullKey) {
    try {
      const result = await prefs.get({ key: fullKey });
      return result?.value ?? null;
    } catch {
      return null;
    }
  }

  async function writePrefs(fullKey, value) {
    if (!value) {
      await prefs.remove({ key: fullKey });
      return;
    }
    await prefs.set({ key: fullKey, value });
  }

  async function migratePrefsIntoVault(fullKey, value) {
    if (!value) return;
    const stored = await writeVault(fullKey, value);
    if (stored) {
      try {
        await prefs.remove({ key: fullKey });
      } catch {
        // Vault already has the secret; leftover Preferences is best-effort cleanup.
      }
    }
  }

  return {
    async setSecret(key, value) {
      if (!isNative()) {
        web.setWebSecret(key, value || "");
        return true;
      }
      const fullKey = prefixed(key);
      const next = value || "";
      if (await writeVault(fullKey, next)) {
        try {
          await prefs.remove({ key: fullKey });
        } catch {
          /* ignore */
        }
        return true;
      }
      await writePrefs(fullKey, next);
      return true;
    },

    async getSecret(key) {
      if (!isNative()) {
        return web.getWebSecret(key) || null;
      }
      const fullKey = prefixed(key);
      const vaultValue = await readVault(fullKey);
      if (vaultValue) {
        try {
          await prefs.remove({ key: fullKey });
        } catch {
          /* leftover Preferences copy is best-effort cleanup */
        }
        return vaultValue;
      }
      const prefsValue = await readPrefs(fullKey);
      if (prefsValue) await migratePrefsIntoVault(fullKey, prefsValue);
      return prefsValue;
    },

    async removeSecret(key) {
      if (!isNative()) {
        web.removeWebSecret(key);
        return true;
      }
      const fullKey = prefixed(key);
      await writeVault(fullKey, "");
      try {
        await prefs.remove({ key: fullKey });
      } catch {
        /* ignore */
      }
      return true;
    },
  };
}

const defaultStore = createSecureStore();

export async function setSecret(key, value) {
  return defaultStore.setSecret(key, value);
}

export async function getSecret(key) {
  return defaultStore.getSecret(key);
}

export async function removeSecret(key) {
  return defaultStore.removeSecret(key);
}
