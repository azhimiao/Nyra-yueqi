export const CHARACTER_DRAFT_KEY_PREFIX = "yueqi.character.draft.v1:";

function defaultStorage() {
  return typeof window !== "undefined" ? window.localStorage : null;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function draftKey(characterId) {
  return `${CHARACTER_DRAFT_KEY_PREFIX}${encodeURIComponent(characterId)}`;
}

function normalizeDraft(value) {
  if (!isObject(value)) return null;
  const characterId = String(value.characterId || "").trim();
  const baseRevision = Number(value.baseRevision);
  if (!characterId || !Number.isInteger(baseRevision) || !isObject(value.patch)) return null;
  return {
    characterId,
    baseRevision,
    updatedAt: typeof value.updatedAt === "string" && value.updatedAt
      ? value.updatedAt
      : new Date().toISOString(),
    patch: clone(value.patch),
    ...(value.staleBase === true ? { staleBase: true } : {}),
  };
}

/**
 * Rebuildable, per-character editor drafts. Character records remain authoritative.
 * @param {{ storage?: Storage }} [options]
 */
export function createCharacterDraftStore({ storage = defaultStorage() } = {}) {
  function getDraft(characterId) {
    const id = String(characterId || "").trim();
    if (!id || !storage) return null;
    try {
      return normalizeDraft(JSON.parse(storage.getItem(draftKey(id)) || "null"));
    } catch {
      return null;
    }
  }

  function putDraft(draft) {
    const normalized = normalizeDraft({
      ...draft,
      updatedAt: draft?.updatedAt || new Date().toISOString(),
    });
    if (!normalized) throw new TypeError("invalid_character_draft");
    if (!storage) throw new Error("draft_storage_unavailable");
    storage.setItem(draftKey(normalized.characterId), JSON.stringify(normalized));
    return clone(normalized);
  }

  function clearDraft(characterId) {
    const id = String(characterId || "").trim();
    if (!id || !storage) return false;
    storage.removeItem(draftKey(id));
    return true;
  }

  function listDrafts() {
    if (!storage) return [];
    const drafts = [];
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(CHARACTER_DRAFT_KEY_PREFIX)) continue;
        try {
          const draft = normalizeDraft(JSON.parse(storage.getItem(key) || "null"));
          if (draft) drafts.push(draft);
        } catch {
          // A corrupt rebuildable draft must not break the editor.
        }
      }
    } catch {
      return [];
    }
    return drafts.sort((a, b) => a.characterId.localeCompare(b.characterId));
  }

  return { getDraft, putDraft, clearDraft, listDrafts };
}

function defaultDraftStore() {
  return createCharacterDraftStore();
}

export const getDraft = (characterId) => defaultDraftStore().getDraft(characterId);
export const putDraft = (draft) => defaultDraftStore().putDraft(draft);
export const clearDraft = (characterId) => defaultDraftStore().clearDraft(characterId);
export const listDrafts = () => defaultDraftStore().listDrafts();
