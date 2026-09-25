import { LOCAL_KEYS } from "../../constants.js";
import { readLocalObject, writeLocalObject } from "../../lib/utils.js";

const MAX_ENTRIES = 12;

function readDiaryStore() {
  return readLocalObject(LOCAL_KEYS.settingsKey, {}).palaceSessionDiary || [];
}

function writeDiaryStore(entries) {
  const settings = readLocalObject(LOCAL_KEYS.settingsKey, {});
  settings.palaceSessionDiary = entries.slice(0, MAX_ENTRIES);
  writeLocalObject(LOCAL_KEYS.settingsKey, settings);
  return settings.palaceSessionDiary;
}

/** MemPalace session diary — continuity between visits (not AI daily diary). */
export function readSessionDiary(limit = 3) {
  return readDiaryStore().slice(0, limit);
}

export function writeSessionDiary(entry) {
  const text = String(entry?.summary || entry?.text || "").trim();
  if (!text) return readDiaryStore();

  const next = [
    {
      id: `palace-diary-${Date.now()}`,
      summary: text,
      wing: entry.wing || "Relationship",
      createdAt: new Date().toISOString(),
    },
    ...readDiaryStore(),
  ];
  return writeDiaryStore(next);
}

export function formatSessionDiaryBlock(limit = 3) {
  const entries = readSessionDiary(limit);
  if (!entries.length) return "";
  return entries
    .map((entry, index) => `${index + 1}. [${entry.createdAt?.slice(0, 10) || "session"}] ${entry.summary}`)
    .join("\n");
}
