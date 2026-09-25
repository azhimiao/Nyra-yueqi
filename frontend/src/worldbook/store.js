/**
 * Worldbook IDB thin wrapper (F5 / F2).
 */

import { deleteRecord, getAllRecords, openMemoryDb, storeRecord } from "../storage/db.js";
import { normalizeWorldbookEntry } from "./match.js";

function nowIso() {
  return new Date().toISOString();
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
  const normalized = normalizeWorldbookEntry({
    ...partial,
    updatedAt: nowIso(),
  });
  if (!normalized.triggers.length) {
    normalized.triggers = ["关键词"];
  }
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
