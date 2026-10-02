/**
 * CP-15 — Backup export → mutate → import round-trip + secret exclusion.
 */

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, v);
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

const storage = makeMemoryStorage();
globalThis.window = {
  localStorage: storage,
  dispatchEvent() {},
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
globalThis.document = {
  documentElement: { lang: "zh-CN", dataset: {} },
  querySelectorAll() {
    return [];
  },
  dispatchEvent() {},
};

const { buildExportPayload, restoreImportPayload } = await import("../../src/memory/backup.js");
const { assertNoSecretsInExport } = await import("../../src/memory/privacy.js");
const { SYNC_PAYLOAD_VERSION } = await import("../../src/constants.js");
const {
  getLifeState,
  saveLifeState,
  __setLifeStateStorageForTests,
  LIFE_STATE_KEY,
} = await import("../../src/companion/life-state.js");
const {
  emitAppEvent,
  listRecentAppEvents,
  __setAppEventStorageForTests,
  APP_EVENTS_STORAGE_KEY,
} = await import("../../src/world/app-events.js");
const yeosRegistry = await import("../../src/yeos/registry-games.js");
const exportYeosGamesBag = yeosRegistry.exportGamesBag;
const { YEOS_GAMES_STORE_KEY } = yeosRegistry;
const {
  saveGameSave,
  loadGameSave,
  YEOS_SAVES_STORE_KEY,
} = await import("../../src/yeos/saves.js");
const { saveGatePrefs } = await import("../../src/gate/gate-prefs.js");
const { __setSkillPlatformStorageForTests } = await import("../../src/skill-platform/store.js");

const failures = [];
function assert(c, m) {
  if (!c) failures.push(m);
}

__setLifeStateStorageForTests(storage);
__setAppEventStorageForTests(storage);
__setSkillPlatformStorageForTests(storage);

const idb = {
  memories: [],
  messages: [],
  media: [{ id: "m1", kind: "file", name: "photo.png", type: "image/png", size: 3, createdAt: "2026-01-01T00:00:00.000Z" }],
};

async function getAllRecords(store) {
  return idb[store] ? [...idb[store]] : [];
}

const baseDeps = {
  collectProfileState: () => ({ name: "测试", provider: { apiKey: "sk-live-should-not-export" } }),
  collectLibraryState: () => ({}),
  getEcosystemState: () => ({ loggedIn: true, token: "secret-ecosystem-token-xyz" }),
  getAllRecords,
  normalizeMemory: (r) => r,
  collectWorldbookEntries: () => [],
  currentDailyStatus: null,
  collectSettings: () => ({
    diary: { style: "literary", scheduleEnabled: false, scheduleTime: "23:00", scheduleOverwrite: true },
    rag: { topK: 4, scope: "all" },
    sync: { strategy: "local_wins" },
    voice: { ttsProvider: "OpenAI", ttsApiKey: "sk-voice-key-never-export", sttApiKey: "sk-stt-never" },
  }),
  getAvatarState: () => null,
  listCharactersForBackup: async () => [{ id: "char-demo", name: "Demo" }],
};

const restoreDeps = {
  writeLocalObject: () => {},
  localFallback: { profileKey: "p", libraryKey: "l", statusKey: "s" },
  clearStore: async () => {},
  storeRecord: async () => {},
  normalizeMemory: (r) => r,
  saveEcosystemState: () => {},
  getEcosystemState: () => ({ token: "kept-live-token" }),
  applyProfileState: () => {},
  renderLibraryState: async () => {},
  renderWorldbookEntries: () => {},
  renderMemoryState: async () => {},
  loadChatHistory: async () => {},
};

console.log("=== CP-15 Seed CP-9…14 modules ===");
{
  saveLifeState("char-demo", {
    characterId: "char-demo",
    currentMood: "warm",
    currentGoals: ["say hi"],
  });
  emitAppEvent("diary.created", { characterId: "char-demo", summary: "今日日记" });
  storage.setItem(
    YEOS_GAMES_STORE_KEY,
    JSON.stringify({
      games: [{
        id: "sample-first-scene",
        manifest: {
          schemaVersion: 1,
          kind: "yueqi-game",
          id: "sample-first-scene",
          name: "Sample",
          entry: "game.html",
          version: "1.0.0",
          permissions: ["game.save"],
        },
        installedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        enabled: true,
        grantedPermissions: ["game.save"],
        source: "sideload",
        files: { "game.html": "<html></html>" },
      }],
    }),
  );
  saveGameSave("sample-first-scene", { level: 3, note: "cp15-save" });
  saveGatePrefs({ gateSessionToken: "live-gate-session-token-abc", localMode: false, cloudGateEnabled: true });
}

console.log("=== CP-15 Export completeness ===");
let payload;
{
  payload = await buildExportPayload(baseDeps);
  assert(payload.version === SYNC_PAYLOAD_VERSION, "payload version bumped");
  assert(payload.companionLife?.byCharacter?.["char-demo"]?.currentMood === "warm", "companionLife exported");
  assert(Array.isArray(payload.appEvents?.events) && payload.appEvents.events.length >= 1, "appEvents exported");
  assert(payload.yeosGames?.games?.some((g) => g.id === "sample-first-scene"), "yeosGames exported");
  assert(payload.yeosSaves?.saves?.["sample-first-scene"]?.level === 3, "yeosSaves exported");
  assert(payload.dataModules?.includes("companionLife"), "dataModules lists companionLife");
  assert(payload.dataModules?.includes("yeosSaves"), "dataModules lists yeosSaves");
  assert(payload.ecosystem?.token === "", "ecosystem token stripped");
  assert(!payload.profile?.provider, "profile provider stripped");
  assert(!payload.settings?.voice?.ttsApiKey, "voice ttsApiKey stripped");
  assert(payload.gatePrefs?.gateSessionToken === "[redacted]", "gate token redacted");

  try {
    assertNoSecretsInExport(payload);
    assert(true, "assertNoSecretsInExport pass");
  } catch (error) {
    assert(false, `secrets in export: ${error.message}`);
  }
}

console.log("=== CP-15 Mutate then import restore ===");
{
  storage.removeItem(LIFE_STATE_KEY);
  storage.removeItem(APP_EVENTS_STORAGE_KEY);
  storage.removeItem(YEOS_SAVES_STORE_KEY);

  const { locale: _dropLocale, ...restorePayload } = payload;
  await restoreImportPayload(restorePayload, restoreDeps);

  const life = getLifeState("char-demo");
  assert(life.currentMood === "warm", "companionLife restored");
  assert(listRecentAppEvents(8).some((e) => e.type === "diary.created"), "appEvents restored");
  assert(loadGameSave("sample-first-scene")?.level === 3, "yeosSaves restored");
  assert(exportYeosGamesBag().games.some((g) => g.id === "sample-first-scene"), "yeosGames restored");
}

console.log("=== CP-15 v1 payload still imports ===");
{
  const v1Payload = { ...payload, version: 1, locale: undefined };
  delete v1Payload.companionLife;
  storage.removeItem(LIFE_STATE_KEY);
  await restoreImportPayload(v1Payload, restoreDeps);
  assert(true, "v1 payload import did not throw");
}

console.log("=== CP-15 omitMedia option ===");
{
  const lite = await buildExportPayload(baseDeps, { omitMedia: true });
  assert(Array.isArray(lite.mediaManifest) && lite.mediaManifest.length === 0, "omitMedia clears manifest");
}

if (failures.length) {
  console.error("\nCP-15 backup integration FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("\nCP-15 backup integration PASSED");
