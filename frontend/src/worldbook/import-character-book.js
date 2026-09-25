/**
 * character_book.entries → character-scoped worldbook rows.
 */

import { normalizeWorldbookEntry } from "./match.js";

const POSITION_MAP = Object.freeze({
  before_char: "before_scenario",
  after_char: "after_scenario",
  before_em: "before_history",
  after_em: "post_history",
});

export function mapCharacterBookEntry(entry, characterId, index = 0) {
  const raw = entry && typeof entry === "object" ? entry : {};
  const mapped = normalizeWorldbookEntry({
    id: String(raw.id || `lore-${characterId}-${index}`),
    title: String(raw.comment || raw.title || `lore-${index + 1}`),
    keys: Array.isArray(raw.keys) ? raw.keys : [],
    secondaryKeys: Array.isArray(raw.secondary_keys) ? raw.secondary_keys : [],
    content: String(raw.content || ""),
    enabled: raw.enabled !== false,
    priority: raw.priority ?? raw.insertion_order ?? 50,
    insertPosition: POSITION_MAP[raw.position] || "after_scenario",
    matchMode: raw.selective ? "all" : "any",
    characterId,
    linkedCharacterIds: [characterId],
    scope: "character",
    constant: Boolean(raw.constant),
    depth: raw.depth,
    sourceRef: {
      kind: "character_book",
      characterId,
      index,
    },
    rawUnsupported: {
      extensions: raw.extensions || null,
    },
  });
  mapped.characterId = characterId;
  mapped.linkedCharacterIds = [characterId];
  mapped.scope = "character";
  return mapped;
}

export function importCharacterBook(book, characterId) {
  const entries = Array.isArray(book?.entries) ? book.entries : [];
  return entries.map((entry, index) => mapCharacterBookEntry(entry, characterId, index));
}

export function loreIsolatedToCharacter(entries, characterId) {
  return (entries || []).every((entry) => (
    entry.characterId === characterId
    && (entry.linkedCharacterIds || []).every((id) => id === characterId)
    && entry.scope === "character"
  ));
}
