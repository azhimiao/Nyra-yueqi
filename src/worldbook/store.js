/**
 * Worldbook IDB thin wrapper (F5 / F2).
 */

import { deleteRecord, getAllRecords, openMemoryDb, storeRecord } from "../storage/db.js";
import { normalizeWorldbookEntry } from "./match.js";

function nowIso() {
  return new Date().toISOString();
}

export function worldbookCharacterId(entry = {}) {
  return String(entry.characterId || entry.linkedCharacterIds?.[0] || "").trim();
}

/** Unscoped legacy rows stay visible for every companion. */
export function worldbookVisibleForCharacter(entry, characterId) {
  if (entry?.scope === "global") return true;
  const linked = entry?.linkedCharacterIds?.length ? entry.linkedCharacterIds : [worldbookCharacterId(entry)].filter(Boolean);
  if (!linked.length) return entry?.scope !== "character";
  return linked.includes(String(characterId || "").trim());
}

export function bindWorldbookToCharacter(entry = {}, characterId = "") {
  const id = String(characterId || "").trim();
  return normalizeWorldbookEntry({
    ...entry,
    characterId: id,
    linkedCharacterIds: id ? [id] : [],
    scope: id ? "character" : "global",
  });
}

export function filterWorldbookForCharacter(entries, characterId) {
  const list = Array.isArray(entries) ? entries : [];
  return list.filter((entry) => worldbookVisibleForCharacter(entry, characterId));
}

export async function listWorldbookEntries() {
  await openMemoryDb();
  const rows = (await getAllRecords("worldbook")) || [];
  return rows.map(normalizeWorldbookEntry);
}

export async function getWorldbookEntry(id) {
  const all = await listWorldbookEntries();
  return all.find((e) => e.id === id) || null;
}

export async function upsertWorldbookEntry(partial = {}) {
  const existing = partial.id ? await getWorldbookEntry(partial.id) : null;
  const normalized = normalizeWorldbookEntry({
    ...existing,
    ...partial,
    ...(Object.hasOwn(partial, "triggers") && !Object.hasOwn(partial, "keys") ? { keys: partial.triggers } : {}),
    updatedAt: nowIso(),
  });
  await storeRecord("worldbook", normalized);
  return normalized;
}

export async function deleteWorldbookEntry(id) {
  await deleteRecord("worldbook", String(id || ""));
}

export async function setAllWorldbookEnabled(enabled) {
  const rows = await listWorldbookEntries();
  const next = [];
  for (const entry of rows) {
    const updated = await upsertWorldbookEntry({ ...entry, enabled: Boolean(enabled) });
    next.push(updated);
  }
  return next;
}

export async function replaceAllWorldbookEntries(entries) {
  const { clearStore } = await import("../storage/db.js");
  await clearStore("worldbook");
  const list = Array.isArray(entries) ? entries : [];
  const saved = [];
  for (const entry of list) {
    saved.push(await upsertWorldbookEntry(entry));
  }
  return saved;
}
