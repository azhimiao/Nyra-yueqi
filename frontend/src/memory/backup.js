import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { APP_VERSION, SYNC_PAYLOAD_VERSION } from "../constants.js";
import { getBrandName, getLocale, setLocale, t } from "../i18n/index.js";
import {
  getDiarySettings,
  getPalaceSettings,
  getPromptSettings,
  getRagSettings,
  getSyncPreferences,
  saveDiarySettings,
  savePalaceSettings,
  savePromptSettings,
  saveRagSettings,
  saveSyncPreferences,
} from "../settings/preferences.js";
import { exportVoiceSettingsForBackup, saveVoiceSettings } from "../settings/voice-preferences.js";
import { persistMediaBytes, readMediaBytes } from "../platform/media-files.js";
import { exportCohabitTimeline, importCohabitTimeline } from "./cohabit-timeline.js";
import { exportLifeBag, importLifeBag } from "../life/store.js";
import { exportWallet, importWallet } from "../wallet/ledger.js";
import { exportShopOrders, importShopOrders } from "../shop/orders.js";
import { exportShopInventory, importShopInventory } from "../shop/inventory.js";
import { exportShopWishlist, importShopWishlist } from "../shop/wishlist.js";
import { exportSidewrite, importSidewrite } from "../sidewrite/manifest-store.js";
import { listDataModuleIds } from "./data-modules.js";
import { SCENARIO_STORE_KEY } from "../scenario/store.js";
import { exportStoryBag, importStoryBag } from "../story/store.js";
import { exportCocreateBag, importCocreateBag } from "../cocreate/store.js";
import { exportGamesBag, importGamesBag } from "../games/store.js";
import { exportMultiplayerBag, importMultiplayerBag } from "../multiplayer/prefs.js";
import { exportPresetsBag, importPresetsBag } from "../presets/store.js";
import { exportRegexBag, importRegexBag } from "../regex/store.js";
import { exportAssetsHubBag, importAssetsHubBag } from "../assets-hub/stickers.js";
import { exportExtensionsBag, importExtensionsBag } from "../phone-ext/registry.js";
import { exportGatePrefsBag, importGatePrefsBag } from "../gate/gate-prefs.js";
import { exportReportsBag, importReportsBag } from "../gate/report-store.js";
import { exportConversationBag, importConversationBag } from "../conversation/index.js";
import { exportContextBag, importContextBag } from "../context/store.js";
import { exportSessionMapBag, importSessionMapBag } from "../context/session-map.js";
import { exportBranchSummaryBag, importBranchSummaryBag } from "../context/branch-summary.js";
import { exportMomentsBag, importMomentsBag } from "../moments/store.js";
import { exportSessionBag, importSessionBag } from "../cocreate/session-store.js";
import { exportSkillPlatformBag, importSkillPlatformBag } from "../skill-platform/backup.js";
import { exportCompanionLifeBag, importCompanionLifeBag } from "../companion/life-state.js";
import { exportAppEventsBag, importAppEventsBag } from "../world/app-events.js";
import {
  exportGamesBag as exportYeosGamesBag,
  importGamesBag as importYeosGamesBag,
} from "../yeos/registry-games.js";
import { exportYeosSavesBag, importYeosSavesBag } from "../yeos/saves.js";
import { exportArtifactBag, importArtifactBag } from "../cocreate/artifact-store.js";
import { scrubExportPayload } from "./privacy.js";
import { BACKUP_AUTHORITY_MANIFEST } from "./backup-authority.js";

export { BACKUP_AUTHORITY_MANIFEST } from "./backup-authority.js";

export function collectSettings() {
  return {
    diary: getDiarySettings(),
    rag: getRagSettings(),
    sync: getSyncPreferences(),
    prompt: getPromptSettings(),
    palace: getPalaceSettings(),
    voice: exportVoiceSettingsForBackup(),
  };
}

export async function buildExportPayload(deps, options = {}) {
  const {
    collectProfileState,
    collectLibraryState,
    getEcosystemState,
    getAllRecords,
    normalizeMemory,
    collectWorldbookEntries,
    currentDailyStatus,
    collectSettings: collectSettingsDep,
    getAvatarState,
    listCharactersForBackup,
  } = deps;

  const mediaRecords = await getAllRecords("media");
  let scenarioBag = {};
  try {
    scenarioBag = JSON.parse(window.localStorage.getItem(SCENARIO_STORE_KEY) || "{}") || {};
  } catch {
    scenarioBag = {};
  }

  let characters = [];
  try {
    characters = listCharactersForBackup
      ? await listCharactersForBackup()
      : (await getAllRecords("characters")) || [];
  } catch {
    characters = [];
  }

  const payload = {
    schema: "yueqi-companion-export",
    version: SYNC_PAYLOAD_VERSION,
    appVersion: APP_VERSION,
    locale: getLocale(),
    brand: getBrandName(),
    profile: collectProfileState(),
    library: collectLibraryState(),
    avatar: getAvatarState?.() || null,
    mediaManifest: mediaRecords.map((record) => ({
      id: record.id,
      kind: record.kind,
      name: record.name,
      type: record.type,
      size: record.size,
      createdAt: record.createdAt,
      filePath: record.filePath || "",
    })),
    ecosystem: {
      ...getEcosystemState(),
      token: "",
    },
    settings: collectSettingsDep?.() || collectSettings(),
    memories: (await getAllRecords("memories")).map(normalizeMemory),
    palaceKg: await getAllRecords("palace_kg"),
    worldbook: collectWorldbookEntries(),
    messages: await getAllRecords("messages"),
    conversations: await getAllRecords("conversations"),
    conversationV2: exportConversationBag(),
    contextGraph: exportContextBag(),
    contextSessionMap: exportSessionMapBag(),
    contextBranchSummaries: exportBranchSummaryBag(),
    moments: exportMomentsBag(),
    characters,
    scenario: {
      scripts: scenarioBag.scripts || [],
      runs: scenarioBag.runs || [],
    },
    story: exportStoryBag(),
    cocreate: exportCocreateBag(),
    cocreateSession: exportSessionBag(),
    cocreateArtifact: exportArtifactBag(),
    games: exportGamesBag(),
    yeosGames: exportYeosGamesBag(),
    yeosSaves: exportYeosSavesBag(),
    multiplayer: exportMultiplayerBag(),
    cohabitTimeline: exportCohabitTimeline(),
    life: exportLifeBag(),
    wallet: exportWallet(),
    shopOrders: exportShopOrders(),
    shopInventory: exportShopInventory(),
    shopWishlist: exportShopWishlist(),
    sidewrite: await exportSidewrite(),
    presets: exportPresetsBag(),
    regex: exportRegexBag(),
    assetsHub: exportAssetsHubBag(),
    extensions: exportExtensionsBag(),
    gatePrefs: exportGatePrefsBag(),
    reports: exportReportsBag(),
    skillPlatform: exportSkillPlatformBag(),
    companionLife: exportCompanionLifeBag(),
    appEvents: exportAppEventsBag(options.appEventsLimit ?? 32),
    dataModules: listDataModuleIds(),
    /** M9: which payload keys are authority vs rebuildable index/projection */
    authorityManifest: BACKUP_AUTHORITY_MANIFEST,
    dailyStatus: currentDailyStatus,
    exportedAt: new Date().toISOString(),
  };

  if (options.omitMedia) {
    payload.mediaManifest = [];
  }

  return scrubExportPayload(payload);
}

/** Full backup ZIP: backup.json + media/{id} bytes. */
export async function buildFullBackupZip(deps, options = {}) {
  const { includeMedia = true, ...payloadOptions } = options;
  const payload = await buildExportPayload(deps, {
    ...payloadOptions,
    omitMedia: !includeMedia,
  });
  const { getAllRecords } = deps;
  const files = {
    "backup.json": strToU8(JSON.stringify(payload, null, 2)),
  };

  if (includeMedia) {
    const mediaRecords = await getAllRecords("media");
    for (const record of mediaRecords) {
      const bytes = await readMediaBytes(record);
      if (!bytes?.length) continue;
      files[`media/${record.id}`] = bytes;
    }
  }

  return zipSync(files, { level: 6 });
}

export async function restoreImportPayload(payload, deps) {
  if (!payload || payload.schema !== "yueqi-companion-export") {
    throw new Error(t("alerts.invalidBackup"));
  }
  if (payload.version != null && Number(payload.version) > SYNC_PAYLOAD_VERSION) {
    throw new Error(t("alerts.invalidBackup"));
  }

  const {
    writeLocalObject,
    localFallback,
    clearStore,
    storeRecord,
    normalizeMemory,
    saveEcosystemState,
    getEcosystemState,
    applyProfileState,
    renderLibraryState,
    renderWorldbookEntries,
    renderMemoryState,
    loadChatHistory,
    onDiarySettingsRestored,
    applyAvatarState,
    onPromptSettingsRestored,
    onSyncSettingsRestored,
  } = deps;

  if (payload.locale) {
    setLocale(payload.locale, { chosen: true });
  }

  if (payload.profile) {
    writeLocalObject(localFallback.profileKey, payload.profile);
    applyProfileState(payload.profile);
  }
  if (payload.library) {
    writeLocalObject(localFallback.libraryKey, payload.library);
    await renderLibraryState(payload.library);
  }
  if (payload.avatar) {
    applyAvatarState?.(payload.avatar);
  }
  if (payload.ecosystem) {
    const current = getEcosystemState();
    saveEcosystemState({ ...current, ...payload.ecosystem, token: current.token });
  }

  await clearStore("memories");
  for (const memory of payload.memories || []) {
    await storeRecord("memories", normalizeMemory(memory));
  }

  await clearStore("palace_kg");
  for (const fact of payload.palaceKg || []) {
    await storeRecord("palace_kg", fact);
  }

  await clearStore("worldbook");
  for (const entry of payload.worldbook || []) {
    await storeRecord("worldbook", entry);
  }
  renderWorldbookEntries(payload.worldbook || []);

  await clearStore("messages");
  for (const message of payload.messages || []) {
    await storeRecord("messages", message);
  }

  await clearStore("conversations");
  for (const conversation of payload.conversations || []) {
    await storeRecord("conversations", conversation);
  }

  if (payload.conversationV2) importConversationBag(payload.conversationV2);
  if (payload.contextGraph) importContextBag(payload.contextGraph);
  if (payload.contextSessionMap) importSessionMapBag(payload.contextSessionMap);
  if (payload.contextBranchSummaries) importBranchSummaryBag(payload.contextBranchSummaries);
  if (payload.moments) importMomentsBag(payload.moments);

  if (Array.isArray(payload.characters) && payload.characters.length) {
    try {
      await clearStore("characters");
      for (const character of payload.characters) {
        await storeRecord("characters", character);
      }
    } catch {
      /* characters store may be unavailable in older DBs */
    }
  }

  if (payload.scenario && typeof payload.scenario === "object") {
    try {
      window.localStorage.setItem(SCENARIO_STORE_KEY, JSON.stringify({
        scripts: payload.scenario.scripts || [],
        runs: payload.scenario.runs || [],
      }));
    } catch {
      /* ignore */
    }
  }

  if (payload.story) {
    try {
      importStoryBag(payload.story);
    } catch {
      /* ignore */
    }
  }

  if (payload.cocreate) {
    try {
      importCocreateBag(payload.cocreate);
    } catch {
      /* ignore */
    }
  }

  if (payload.cocreateSession) {
    try { importSessionBag(payload.cocreateSession); } catch { /* ignore */ }
  }
  if (payload.cocreateArtifact) {
    try { importArtifactBag(payload.cocreateArtifact); } catch { /* ignore */ }
  }

  if (payload.games) {
    try {
      importGamesBag(payload.games);
    } catch {
      /* ignore */
    }
  }

  if (payload.yeosGames) {
    try {
      importYeosGamesBag(payload.yeosGames);
    } catch {
      /* ignore yeos games restore errors */
    }
  }

  if (payload.yeosSaves) {
    try {
      importYeosSavesBag(payload.yeosSaves);
    } catch {
      /* ignore yeos saves restore errors */
    }
  }

  if (payload.multiplayer) {
    try {
      importMultiplayerBag(payload.multiplayer);
    } catch {
      /* ignore */
    }
  }

  if (payload.cohabitTimeline) {
    importCohabitTimeline(payload.cohabitTimeline);
  }

  if (payload.life) {
    try {
      importLifeBag(payload.life);
    } catch {
      /* ignore life restore errors */
    }
  }

  if (payload.wallet) {
    importWallet(payload.wallet);
  }

  if (payload.shopOrders) {
    importShopOrders(payload.shopOrders);
  }

  if (payload.shopInventory) {
    importShopInventory(payload.shopInventory);
  }

  if (payload.shopWishlist) {
    importShopWishlist(payload.shopWishlist);
  }

  if (payload.sidewrite) {
    try {
      await importSidewrite(payload.sidewrite);
    } catch {
      /* ignore sidewrite restore errors */
    }
  }

  if (payload.presets) {
    try {
      importPresetsBag(payload.presets);
    } catch {
      /* ignore */
    }
  }

  if (payload.regex) {
    try {
      importRegexBag(payload.regex);
    } catch {
      /* ignore */
    }
  }

  if (payload.assetsHub) {
    try {
      importAssetsHubBag(payload.assetsHub);
    } catch {
      /* ignore */
    }
  }

  if (payload.extensions) {
    try {
      importExtensionsBag(payload.extensions);
    } catch {
      /* ignore */
    }
  }

  if (payload.gatePrefs) {
    try {
      importGatePrefsBag(payload.gatePrefs);
    } catch {
      /* ignore */
    }
  }

  if (payload.reports) {
    try {
      importReportsBag(payload.reports);
    } catch {
      /* ignore */
    }
  }

  if (payload.skillPlatform) {
    try {
      importSkillPlatformBag(payload.skillPlatform);
    } catch {
      /* ignore skill platform restore errors */
    }
  }

  if (payload.companionLife) {
    try {
      importCompanionLifeBag(payload.companionLife);
    } catch {
      /* ignore companion life restore errors */
    }
  }

  if (payload.appEvents) {
    try {
      importAppEventsBag(payload.appEvents);
    } catch {
      /* ignore app events restore errors */
    }
  }

  if (payload.dailyStatus) {
    writeLocalObject(localFallback.statusKey, payload.dailyStatus);
  }

  if (payload.settings?.diary) {
    saveDiarySettings(payload.settings.diary);
    onDiarySettingsRestored?.();
  }
  if (payload.settings?.rag) {
    saveRagSettings(payload.settings.rag);
  }
  if (payload.settings?.sync) {
    saveSyncPreferences(payload.settings.sync);
    onSyncSettingsRestored?.();
  }
  if (payload.settings?.prompt) {
    savePromptSettings(payload.settings.prompt);
    deps.onPromptSettingsRestored?.();
  }
  if (payload.settings?.palace) {
    savePalaceSettings(payload.settings.palace);
  }
  if (payload.settings?.voice) {
    saveVoiceSettings(payload.settings.voice);
    deps.onVoiceSettingsRestored?.();
  }

  await renderMemoryState();
  await loadChatHistory();
}

/**
 * Restore full ZIP backup (payload + media files).
 * Media store is cleared and rebuilt from ZIP entries + mediaManifest.
 */
export async function restoreFullBackupZip(bytes, deps) {
  const entries = unzipSync(bytes);
  const backupRaw = entries["backup.json"];
  if (!backupRaw) throw new Error(t("alerts.invalidBackup"));
  const payload = JSON.parse(strFromU8(backupRaw));

  await restoreImportPayload(payload, deps);

  const { clearStore, storeRecord } = deps;
  await clearStore("media");

  const manifest = Array.isArray(payload.mediaManifest) ? payload.mediaManifest : [];
  for (const item of manifest) {
    const id = String(item.id || "").trim();
    if (!id || id.includes("..") || id.includes("/")) continue;
    const fileBytes = entries[`media/${id}`];
    if (!fileBytes) continue;
    const type = item.type || "application/octet-stream";
    const filePath = await persistMediaBytes(id, fileBytes, type);
    const blob = filePath ? null : new Blob([fileBytes], { type });
    await storeRecord("media", {
      id,
      kind: item.kind || "file",
      name: item.name || id,
      type,
      size: fileBytes.length,
      createdAt: item.createdAt || new Date().toISOString(),
      filePath: filePath || "",
      blob,
    });
  }

  if (payload.avatar) deps.applyAvatarState?.(payload.avatar);
}

export function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadBackupZip(filename, bytes) {
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Download a sealed .nyra archive (primary user-facing export). */
export function downloadNyraArchive(filename, bytes) {
  const name = String(filename || `nyra-${Date.now()}.nyra`);
  const safeName = name.endsWith(".nyra") ? name : `${name}.nyra`;
  const blob = new Blob([bytes], { type: "application/vnd.nyra.archive" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.click();
  URL.revokeObjectURL(url);
}
