import { Preferences } from "@capacitor/preferences";
import { isNativePlatform } from "./runtime.js";

/** App 端设置走 Capacitor Preferences；Web 仍用 localStorage。 */
const cache = new Map();
let ready = false;

export function isNativeKvReady() {
  return isNativePlatform() && ready;
}

export async function initNativeKv(keys = []) {
  if (!isNativePlatform()) {
    ready = false;
    return;
  }
  await Promise.all(
    keys.map(async (key) => {
      const result = await Preferences.get({ key });
      if (result.value != null) cache.set(key, result.value);
    })
  );
  ready = true;
}

export function readNativeKvRaw(key) {
  if (!isNativePlatform()) return null;
  if (cache.has(key)) return cache.get(key);
  return null;
}

export function writeNativeKvRaw(key, value) {
  if (!isNativePlatform()) return;
  cache.set(key, value);
  Preferences.set({ key, value }).catch((error) => {
    console.warn("Preferences 写入失败", key, error);
  });
}

export function removeNativeKvRaw(key) {
  if (!isNativePlatform()) return;
  cache.delete(key);
  Preferences.remove({ key }).catch((error) => {
    console.warn("Preferences 删除失败", key, error);
  });
}
