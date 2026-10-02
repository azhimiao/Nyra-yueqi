/** Lossless JSON interchange and validation, shared by both editor shells. */
import { normalizeWorldbookEntry, LORE_SCOPES } from "./match.js";
import { mapCharacterBookEntry } from "./import-character-book.js";
import { listWorldbookEntries } from "./store.js";
import { runRepositoryTransaction } from "../storage/db.js";

export class WorldbookValidationError extends Error {
  constructor(code, index = -1, field = "") {
    super(code);
    this.code = code;
    this.index = index;
    this.field = field;
  }
}

export function validateWorldbookEntry(entry, index = -1) {
  const fail = (code, field) => { throw new WorldbookValidationError(code, index, field); };
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail("invalid_entry", "");
  if (typeof entry.content !== "string" || !entry.content.trim()) fail("content_required", "content");
  for (const field of ["id", "title", "category", "regex", "scope", "characterId", "personaId", "experienceId", "sessionId", "insertPosition", "role"]) {
    if (entry[field] != null && typeof entry[field] !== "string") fail("invalid_value", field);
  }
  for (const field of ["enabled", "constant", "caseSensitive"]) {
    if (entry[field] != null && typeof entry[field] !== "boolean") fail("invalid_value", field);
  }
  const choices = { matchMode: ["any", "all", "not_any"], primaryMatchMode: ["any", "all"], secondaryMatchMode: ["any", "all"], secondaryLogic: ["and", "or"] };
  for (const [field, values] of Object.entries(choices)) {
    if (entry[field] != null && !values.includes(entry[field])) fail("invalid_value", field);
  }
  for (const field of ["keys", "triggers", "secondaryKeys", "scopeApps", "linkedCharacterIds"]) {
    if (entry[field] != null && (!Array.isArray(entry[field]) || entry[field].some((value) => typeof value !== "string"))) {
      fail("invalid_list", field);
    }
  }
  for (const field of ["priority", "tokenBudget", "scanDepth"]) {
    if (entry[field] != null && (typeof entry[field] === "boolean" || !Number.isFinite(Number(entry[field])) || (field !== "priority" && Number(entry[field]) < 0))) {
      fail("invalid_number", field);
    }
  }
  if (entry.scope && !LORE_SCOPES.includes(entry.scope)) fail("invalid_scope", "scope");
  if (entry.scope === "character" && !entry.characterId && !entry.linkedCharacterIds?.length) fail("character_required", "scope");
  if (entry.regex) {
    try { new RegExp(entry.regex, entry.caseSensitive ? "" : "i"); }
    catch { fail("invalid_regex", "regex"); }
  }
  return normalizeWorldbookEntry(entry);
}

export function parseWorldbookImport(value, { characterId = "" } = {}) {
  let parsed;
  try { parsed = typeof value === "string" ? JSON.parse(value) : value; }
  catch { throw new WorldbookValidationError("invalid_json"); }
  const characterBook = parsed?.character_book || parsed?.data?.character_book;
  const nativeBackup = parsed?.format === "yueqi-worldbook";
  const source = characterBook?.entries ?? (Array.isArray(parsed) ? parsed : parsed?.entries);
  const entries = Array.isArray(source) ? source : (source && typeof source === "object" ? Object.values(source) : null);
  if (!entries) throw new WorldbookValidationError("entries_required");
  if (!entries.length) throw new WorldbookValidationError("entries_empty");
  const ids = new Set();
  return entries.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new WorldbookValidationError("invalid_entry", index);
    // Native exports retain external compatibility fields. Their explicit
    // format is authoritative so importing again cannot rebind or re-ID them.
    const isExternal = !nativeBackup && (Boolean(characterBook) || "secondary_keys" in raw || "insertion_order" in raw);
    if (isExternal) {
      // Validate the source before the compatibility mapper normalizes it;
      // otherwise malformed keywords/flags could silently become defaults.
      for (const field of ["keys", "secondary_keys"]) {
        if (raw[field] != null && (!Array.isArray(raw[field]) || raw[field].some((key) => typeof key !== "string"))) {
          throw new WorldbookValidationError("invalid_list", index, field);
        }
      }
      for (const field of ["enabled", "constant", "selective", "case_sensitive"]) {
        if (raw[field] != null && typeof raw[field] !== "boolean") throw new WorldbookValidationError("invalid_value", index, field);
      }
      if (typeof raw.content !== "string") throw new WorldbookValidationError("content_required", index, "content");
      for (const field of ["priority", "insertion_order"]) {
        if (raw[field] != null && (typeof raw[field] === "boolean" || !Number.isFinite(Number(raw[field])))) throw new WorldbookValidationError("invalid_number", index, field);
      }
    }
    const mapped = isExternal ? mapCharacterBookEntry(raw, characterId, index) : { ...raw };
    // Native backups keep their scope. Unbound external books use the target
    // character selected in the editor, or remain global in the all-books view.
    if (isExternal && !characterId) {
      mapped.scope = "global";
      mapped.characterId = "";
      mapped.linkedCharacterIds = [];
    }
    const entry = validateWorldbookEntry(mapped, index);
    if (ids.has(entry.id)) throw new WorldbookValidationError("duplicate_id", index, "id");
    ids.add(entry.id);
    return entry;
  });
}

export function exportWorldbookJson(entries) {
  return JSON.stringify({ format: "yueqi-worldbook", version: 1, entries: entries.map(normalizeWorldbookEntry) }, null, 2);
}

/** Validate first, then merge in one transaction; unrelated books survive. */
export async function mergeWorldbookEntries(entries) {
  const validated = entries.map((entry, index) => validateWorldbookEntry(entry, index));
  const ids = new Set();
  validated.forEach((entry, index) => {
    if (ids.has(entry.id)) throw new WorldbookValidationError("duplicate_id", index, "id");
    ids.add(entry.id);
  });
  const existing = new Map((await listWorldbookEntries()).map((entry) => [entry.id, entry]));
  const now = new Date().toISOString();
  const saved = validated.map((entry) => normalizeWorldbookEntry({ ...existing.get(entry.id), ...entry, updatedAt: now }));
  const result = await runRepositoryTransaction({
    idempotencyKey: `worldbook-import-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`,
    ops: saved.map((record) => ({ type: "put", store: "worldbook", record })),
  });
  if (result?.ok === false) throw new Error(result.error?.message || result.error?.code || "worldbook_import_failed");
  return saved;
}
