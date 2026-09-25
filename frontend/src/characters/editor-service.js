import {
  getCharacter,
  upsertCharacter,
} from "./store.js";
import { createCharacterDraftStore } from "./draft-store.js";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteInteger(value) {
  return Number.isFinite(value) && Number.isInteger(value);
}

function mergePatch(previousPatch, patch) {
  const previous = isObject(previousPatch) ? previousPatch : {};
  const next = isObject(patch) ? patch : {};
  return {
    ...previous,
    ...next,
    ...(isObject(previous.profile) || isObject(next.profile)
      ? {
        profile: {
          ...(isObject(previous.profile) ? previous.profile : {}),
          ...(isObject(next.profile) ? next.profile : {}),
        },
      }
      : {}),
  };
}

export function applyDraft(committed, patch) {
  if (!committed) return null;
  const mergedPatch = isObject(patch) ? patch : {};
  const patchProfile = isObject(mergedPatch.profile) ? mergedPatch.profile : null;
  const patchedFields = Array.isArray(patchProfile?.fields) ? patchProfile.fields : null;
  return {
    ...committed,
    ...mergedPatch,
    id: committed.id,
    revision: committed.revision,
    ...(patchProfile
      ? {
        profile: {
          ...(isObject(committed.profile) ? committed.profile : {}),
          ...patchProfile,
        },
      }
      : {}),
    ...(!Object.hasOwn(mergedPatch, "name") && patchedFields?.[0]
      ? { name: patchedFields[0] }
      : {}),
    ...(!Object.hasOwn(mergedPatch, "alias") && patchedFields?.[1]
      ? { alias: patchedFields[1] }
      : {}),
  };
}

/**
 * @param {{
 *   draftStore?: ReturnType<typeof createCharacterDraftStore>,
 *   characterStore?: { getCharacter: Function, upsertCharacter: Function }
 * }} [options]
 */
export function createCharacterEditorService({
  draftStore = createCharacterDraftStore(),
  characterStore = { getCharacter, upsertCharacter },
} = {}) {
  let editingCharacterId = "";

  async function openEditor(characterId) {
    const id = String(characterId || "").trim();
    if (!id) throw new TypeError("character_id_required");
    editingCharacterId = id;
    const committed = await characterStore.getCharacter(id);
    const draft = draftStore.getDraft(id);
    return {
      characterId: id,
      committed,
      draft,
      hasUnsaved: Boolean(draft),
    };
  }

  async function saveDraft(characterId, patch, { baseRevision } = {}) {
    const id = String(characterId || "").trim();
    if (!id) throw new TypeError("character_id_required");
    if (!isObject(patch)) throw new TypeError("invalid_character_draft_patch");
    const [committed, currentDraft] = await Promise.all([
      characterStore.getCharacter(id),
      Promise.resolve(draftStore.getDraft(id)),
    ]);
    if (!committed) throw new Error("unknown_character");

    const requestedBase = finiteInteger(baseRevision) ? baseRevision : null;
    const draftBase = requestedBase ?? currentDraft?.baseRevision ?? committed.revision;
    const staleBase = Boolean(currentDraft?.staleBase)
      || (requestedBase !== null && currentDraft && currentDraft.baseRevision !== requestedBase)
      || (requestedBase !== null && committed.revision !== requestedBase);
    return draftStore.putDraft({
      characterId: id,
      baseRevision: draftBase,
      updatedAt: new Date().toISOString(),
      patch: mergePatch(currentDraft?.patch, patch),
      ...(staleBase ? { staleBase: true } : {}),
    });
  }

  function conflictResult(expectedRevision, committed, draft) {
    return {
      ok: false,
      conflict: {
        expectedRevision,
        actualRevision: committed?.revision,
        committed,
        draft,
      },
    };
  }

  async function commitDraft(characterId, { expectedRevision } = {}) {
    const id = String(characterId || "").trim();
    if (!id) throw new TypeError("character_id_required");
    const draft = draftStore.getDraft(id);
    const committed = await characterStore.getCharacter(id);
    if (!committed) throw new Error("unknown_character");
    if (!draft) return { ok: true, committed, draft: null };

    const casRevision = finiteInteger(expectedRevision)
      ? expectedRevision
      : draft.baseRevision;
    if (committed.revision !== casRevision) {
      return conflictResult(casRevision, committed, draft);
    }

    try {
      const saved = await characterStore.upsertCharacter(
        applyDraft(committed, draft.patch),
        { expectedRevision: casRevision },
      );
      draftStore.clearDraft(id);
      return { ok: true, committed: saved, draft: null };
    } catch (error) {
      if (error?.code !== "revision_conflict") throw error;
      return conflictResult(
        error.expectedRevision,
        error.current || await characterStore.getCharacter(id),
        draft,
      );
    }
  }

  function discardDraft(characterId) {
    return draftStore.clearDraft(characterId);
  }

  function listUnsaved() {
    return draftStore.listDrafts();
  }

  return {
    openEditor,
    loadEditorState: openEditor,
    saveDraft,
    commitDraft,
    discardDraft,
    listUnsaved,
    get editingCharacterId() {
      return editingCharacterId;
    },
  };
}

let defaultService;
function service() {
  defaultService ||= createCharacterEditorService();
  return defaultService;
}

export function getSharedCharacterEditorService() {
  return service();
}

export const openEditor = (...args) => service().openEditor(...args);
export const loadEditorState = (...args) => service().loadEditorState(...args);
export const saveDraft = (...args) => service().saveDraft(...args);
export const commitDraft = (...args) => service().commitDraft(...args);
export const discardDraft = (...args) => service().discardDraft(...args);
export const listUnsaved = (...args) => service().listUnsaved(...args);
