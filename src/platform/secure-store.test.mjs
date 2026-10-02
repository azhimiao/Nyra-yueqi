import assert from "node:assert/strict";
import { createSecureStore } from "./secure-store.js";

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

function memoryPrefs(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get({ key }) {
      return { value: map.has(key) ? map.get(key) : null };
    },
    async set({ key, value }) {
      map.set(key, value);
    },
    async remove({ key }) {
      map.delete(key);
    },
  };
}

function memoryVault({ available = true, failWrite = false } = {}) {
  const map = new Map();
  return {
    map,
    async isAvailable() {
      return { available, backend: available ? "keystore" : "unavailable" };
    },
    async get({ key }) {
      if (!available) throw new Error("vault down");
      return { value: map.has(key) ? map.get(key) : null };
    },
    async set({ key, value }) {
      if (!available || failWrite) throw new Error("vault write failed");
      map.set(key, value);
    },
    async remove({ key }) {
      if (!available) throw new Error("vault down");
      map.delete(key);
    },
  };
}

function memoryWeb() {
  const map = new Map();
  return {
    map,
    setWebSecret(key, value) {
      if (!value) map.delete(key);
      else map.set(key, value);
    },
    getWebSecret(key) {
      return map.get(key) || "";
    },
    removeWebSecret(key) {
      map.delete(key);
    },
  };
}

await test("web still uses the session store, not Preferences", async () => {
  const prefs = memoryPrefs();
  const web = memoryWeb();
  const store = createSecureStore({
    isNative: () => false,
    pluginAvailable: () => true,
    vault: memoryVault(),
    prefs,
    web,
  });
  await store.setSecret("provider.apiKey", "sk-web");
  assert.equal(await store.getSecret("provider.apiKey"), "sk-web");
  assert.equal(prefs.map.size, 0);
  await store.removeSecret("provider.apiKey");
  assert.equal(await store.getSecret("provider.apiKey"), null);
});

await test("native writes Keystore and strips Preferences", async () => {
  const prefs = memoryPrefs();
  const vault = memoryVault();
  const store = createSecureStore({
    isNative: () => true,
    pluginAvailable: () => true,
    vault,
    prefs,
    web: memoryWeb(),
  });
  await store.setSecret("provider.apiKey", "sk-native");
  assert.equal(vault.map.get("yueqi.secret.provider.apiKey"), "sk-native");
  assert.equal(prefs.map.size, 0);
  assert.equal(await store.getSecret("provider.apiKey"), "sk-native");
});

await test("legacy Preferences secrets migrate once into the vault", async () => {
  const prefs = memoryPrefs({ "yueqi.secret.voice.ttsApiKey": "tts-legacy" });
  const vault = memoryVault();
  const store = createSecureStore({
    isNative: () => true,
    pluginAvailable: () => true,
    vault,
    prefs,
    web: memoryWeb(),
  });
  assert.equal(await store.getSecret("voice.ttsApiKey"), "tts-legacy");
  assert.equal(vault.map.get("yueqi.secret.voice.ttsApiKey"), "tts-legacy");
  assert.equal(prefs.map.has("yueqi.secret.voice.ttsApiKey"), false);
  assert.equal(await store.getSecret("voice.ttsApiKey"), "tts-legacy");
});

await test("vault failure keeps BYOK working through Preferences", async () => {
  const prefs = memoryPrefs();
  const store = createSecureStore({
    isNative: () => true,
    pluginAvailable: () => true,
    vault: memoryVault({ available: false }),
    prefs,
    web: memoryWeb(),
  });
  await store.setSecret("provider.apiKey", "sk-fallback");
  assert.equal(prefs.map.get("yueqi.secret.provider.apiKey"), "sk-fallback");
  assert.equal(await store.getSecret("provider.apiKey"), "sk-fallback");
});

await test("vault hit cleans a leftover Preferences copy", async () => {
  const prefs = memoryPrefs({ "yueqi.secret.provider.apiKey": "sk-stale" });
  const vault = memoryVault();
  vault.map.set("yueqi.secret.provider.apiKey", "sk-vault");
  const store = createSecureStore({
    isNative: () => true,
    pluginAvailable: () => true,
    vault,
    prefs,
    web: memoryWeb(),
  });
  assert.equal(await store.getSecret("provider.apiKey"), "sk-vault");
  assert.equal(prefs.map.has("yueqi.secret.provider.apiKey"), false);
});

await test("empty secret removes both vault and Preferences", async () => {
  const prefs = memoryPrefs({ "yueqi.secret.viber.apiKey": "viber_sk_old" });
  const vault = memoryVault();
  vault.map.set("yueqi.secret.viber.apiKey", "viber_sk_old");
  const store = createSecureStore({
    isNative: () => true,
    pluginAvailable: () => true,
    vault,
    prefs,
    web: memoryWeb(),
  });
  await store.setSecret("viber.apiKey", "");
  assert.equal(vault.map.has("yueqi.secret.viber.apiKey"), false);
  assert.equal(prefs.map.has("yueqi.secret.viber.apiKey"), false);
  assert.equal(await store.getSecret("viber.apiKey"), null);
});

console.log(`\n${passed} PASS`);
