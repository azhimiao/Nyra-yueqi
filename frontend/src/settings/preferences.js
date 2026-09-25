import { LOCAL_KEYS, SYNC_PAYLOAD_VERSION } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import { normalizePromptLayout } from "../prompt/authoring.js";

const DEFAULT_RAG = { topK: 4, scope: "all", diaryStyle: "" };

export function getRagSettings() {
  return { ...DEFAULT_RAG, ...readLocalObject(LOCAL_KEYS.settingsKey, {}).rag };
}

export function saveRagSettings(partial) {
  const settings = readLocalObject(LOCAL_KEYS.settingsKey, {});
  settings.rag = { ...DEFAULT_RAG, ...settings.rag, ...partial };
  writeLocalObject(LOCAL_KEYS.settingsKey, settings);
  return settings.rag;
}

export function getSyncPreferences() {
  return {
    strategy: "local_wins",
    lastSyncedAt: "",
    lastLocalExportAt: "",
    ...readLocalObject(LOCAL_KEYS.settingsKey, {}).sync,
  };
}

export function saveSyncPreferences(partial) {
  const settings = readLocalObject(LOCAL_KEYS.settingsKey, {});
  settings.sync = { ...getSyncPreferences(), ...partial };
  writeLocalObject(LOCAL_KEYS.settingsKey, settings);
  return settings.sync;
}

const DEFAULT_DIARY = {
  style: "literary",
  scheduleEnabled: false,
  scheduleTime: "23:00",
  scheduleOverwrite: true,
};

export function getDiarySettings() {
  return { ...DEFAULT_DIARY, ...readLocalObject(LOCAL_KEYS.settingsKey, {}).diary };
}

export function saveDiarySettings(partial) {
  const settings = readLocalObject(LOCAL_KEYS.settingsKey, {});
  settings.diary = { ...DEFAULT_DIARY, ...settings.diary, ...partial };
  writeLocalObject(LOCAL_KEYS.settingsKey, settings);
  return settings.diary;
}

const DEFAULT_PROMPT = {
  budget: 1800,
  order: ["character", "worldbook", "memory", "daily", "external"],
  promptLayout: null,
};

export function getPromptSettings() {
  const stored = readLocalObject(LOCAL_KEYS.settingsKey, {}).prompt || {};
  return {
    ...DEFAULT_PROMPT,
    ...stored,
    order: stored.order?.length ? stored.order : DEFAULT_PROMPT.order,
    promptLayout: normalizePromptLayout(stored.promptLayout, stored.order || DEFAULT_PROMPT.order),
  };
}

export function savePromptSettings(partial) {
  const settings = readLocalObject(LOCAL_KEYS.settingsKey, {});
  settings.prompt = { ...getPromptSettings(), ...partial };
  writeLocalObject(LOCAL_KEYS.settingsKey, settings);
  return settings.prompt;
}

const DEFAULT_PALACE = {
  enabled: true,
  recallMode: "protocol",
  defaultWing: "Relationship",
  embeddingMode: "enhanced",
  chunkSize: 900,
  neighborExpand: true,
};

export function getPalaceSettings() {
  return { ...DEFAULT_PALACE, ...readLocalObject(LOCAL_KEYS.settingsKey, {}).palace };
}

export function savePalaceSettings(partial) {
  const settings = readLocalObject(LOCAL_KEYS.settingsKey, {});
  settings.palace = { ...DEFAULT_PALACE, ...settings.palace, ...partial };
  writeLocalObject(LOCAL_KEYS.settingsKey, settings);
  return settings.palace;
}
