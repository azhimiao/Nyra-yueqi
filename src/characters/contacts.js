/**
 * Pop address book — separate from character library.
 * Character create/import does not auto-add contacts.
 */

import { listCharacters, getCharacterSync } from "./store.js";

export const POP_CONTACTS_KEY = "yueqi.pop.contacts.v1";
export const POP_CONTACTS_CHANGED_EVENT = "yueqi:pop-contacts-changed";

/**
 * @typedef {{ characterId: string, nickname?: string, addedAt: string }} PopContact
 */

function nowIso() {
  return new Date().toISOString();
}

function readBag() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(POP_CONTACTS_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    const contacts = Array.isArray(parsed?.contacts) ? parsed.contacts : [];
    return {
      contacts: contacts
        .map((row) => ({
          characterId: String(row?.characterId || "").trim(),
          nickname: row?.nickname != null ? String(row.nickname).trim() : undefined,
          addedAt: String(row?.addedAt || nowIso()),
        }))
        .filter((row) => row.characterId),
    };
  } catch {
    return { contacts: [] };
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(POP_CONTACTS_KEY, JSON.stringify({
      contacts: Array.isArray(bag?.contacts) ? bag.contacts : [],
    }));
  } catch {
    /* ignore quota */
  }
}

function dispatchChanged(detail = {}) {
  try {
    document.dispatchEvent(new CustomEvent(POP_CONTACTS_CHANGED_EVENT, { detail }));
  } catch {
    /* non-DOM */
  }
}

/**
 * One-shot: if store key missing, seed all current characters as contacts
 * so existing users keep their Pop list. New characters after this do not auto-join.
 * @returns {Promise<{ seeded: boolean, count: number }>}
 */
export async function ensurePopContactsMigrated() {
  if (typeof window !== "undefined" && window.localStorage?.getItem(POP_CONTACTS_KEY) != null) {
    return { seeded: false, count: listContacts().length };
  }
  const characters = await listCharacters();
  const contacts = characters.map((character) => ({
    characterId: character.id,
    addedAt: nowIso(),
  }));
  writeBag({ contacts });
  dispatchChanged({ reason: "migrate", count: contacts.length });
  return { seeded: true, count: contacts.length };
}

/** @returns {PopContact[]} */
export function listContacts() {
  const bag = readBag();
  if (!bag) return [];
  return bag.contacts.slice();
}

/** @param {string} characterId */
export function isContact(characterId) {
  const id = String(characterId || "").trim();
  if (!id) return false;
  return listContacts().some((row) => row.characterId === id);
}

/**
 * @param {string} characterId
 * @param {{ nickname?: string }} [opts]
 * @returns {PopContact | null}
 */
export function addContact(characterId, opts = {}) {
  const id = String(characterId || "").trim();
  if (!id) return null;
  const bag = readBag() || { contacts: [] };
  const existing = bag.contacts.find((row) => row.characterId === id);
  if (existing) return { ...existing };
  const next = {
    characterId: id,
    nickname: opts.nickname != null ? String(opts.nickname).trim() || undefined : undefined,
    addedAt: nowIso(),
  };
  bag.contacts = [...bag.contacts, next];
  writeBag(bag);
  dispatchChanged({ reason: "add", characterId: id });
  return { ...next };
}

/** @param {string} characterId */
export function removeContact(characterId) {
  const id = String(characterId || "").trim();
  if (!id) return false;
  const bag = readBag() || { contacts: [] };
  const next = bag.contacts.filter((row) => row.characterId !== id);
  if (next.length === bag.contacts.length) return false;
  writeBag({ contacts: next });
  dispatchChanged({ reason: "remove", characterId: id });
  return true;
}

/**
 * Characters in the library that are not yet Pop contacts.
 * @returns {Promise<object[]>}
 */
export async function listNonContactCharacters() {
  await ensurePopContactsMigrated();
  const contacts = new Set(listContacts().map((row) => row.characterId));
  const characters = await listCharacters();
  return characters.filter((character) => !contacts.has(character.id));
}

/**
 * Resolve contacts to character records (skips missing ids).
 * @returns {Promise<Array<object & { contact: PopContact }>>}
 */
export async function listContactCharacters() {
  await ensurePopContactsMigrated();
  const contacts = listContacts();
  const characters = await listCharacters();
  const byId = new Map(characters.map((item) => [item.id, item]));
  /** @type {Array<object & { contact: PopContact }>} */
  const rows = [];
  for (const contact of contacts) {
    const character = byId.get(contact.characterId) || getCharacterSync(contact.characterId);
    if (!character) continue;
    rows.push({ ...character, contact });
  }
  rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh"));
  return rows;
}

/** Test helper — clear store key (next ensure will re-migrate). */
export function resetPopContactsForTests() {
  try {
    window.localStorage.removeItem(POP_CONTACTS_KEY);
  } catch {
    /* ignore */
  }
}
