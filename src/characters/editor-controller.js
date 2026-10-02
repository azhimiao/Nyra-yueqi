import { createCharacterDraftStore } from "./draft-store.js";
import {
  applyDraft,
  createCharacterEditorService,
  getSharedCharacterEditorService,
} from "./editor-service.js";

const EDITOR_MODES = new Set(["basic", "advanced"]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
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

function memoryDraft(characterId, committed, previous, patch) {
  return {
    characterId,
    baseRevision: previous?.baseRevision ?? committed?.revision ?? 0,
    updatedAt: new Date().toISOString(),
    patch: mergePatch(previous?.patch, patch),
    ...(previous?.staleBase ? { staleBase: true } : {}),
  };
}

function resolveEditorService({ editorService, storage } = {}) {
  if (editorService) return editorService;
  if (storage) {
    return createCharacterEditorService({
      draftStore: createCharacterDraftStore({ storage }),
    });
  }
  return getSharedCharacterEditorService();
}

/**
 * Shared App/phone editor container. No DOM. Draft vs committed stay separate.
 * Basic/Advanced is a UI mode flag over the same working document.
 *
 * @param {{
 *   editorService?: ReturnType<typeof createCharacterEditorService>,
 *   storage?: Storage | null,
 *   onUnsavedPrompt?: (detail: { characterId: string, hasUnsaved: boolean }) => void,
 *   onConflict?: (conflict: object) => void,
 *   onError?: (error: Error) => void,
 * }} [options]
 */
export function createCharacterEditorController({
  editorService,
  storage,
  onUnsavedPrompt,
  onConflict,
  onError,
} = {}) {
  const service = resolveEditorService({ editorService, storage });

  let characterId = "";
  let mode = "basic";
  let committed = null;
  let draft = null;
  let dirtyDraft = null;
  let saveError = null;
  let conflict = null;
  let boundShell = "";
  let openGeneration = 0;

  function storedDraft() {
    if (!characterId || typeof service.listUnsaved !== "function") return null;
    return service.listUnsaved().find((item) => item.characterId === characterId) || null;
  }

  function liveDraft() {
    return dirtyDraft || storedDraft() || draft;
  }

  function snapshot() {
    const currentDraft = characterId ? liveDraft() : null;
    draft = currentDraft;
    const working = committed ? applyDraft(committed, currentDraft?.patch) : null;
    const staleBase = Boolean(currentDraft?.staleBase)
      || Boolean(
        currentDraft
        && committed
        && currentDraft.baseRevision !== committed.revision,
      );
    return {
      characterId,
      mode,
      committed: clone(committed),
      draft: clone(currentDraft),
      working: clone(working),
      hasUnsaved: Boolean(currentDraft),
      baseRevision: currentDraft?.baseRevision ?? committed?.revision ?? null,
      staleBase,
      saveError,
      conflict: clone(conflict),
      boundShell,
    };
  }

  async function open(nextCharacterId) {
    const id = String(nextCharacterId || "").trim();
    if (!id) throw new TypeError("character_id_required");
    const generation = ++openGeneration;
    const state = await service.openEditor(id);
    if (generation !== openGeneration) return snapshot();
    if (!state.committed) throw new Error("unknown_character");
    characterId = state.characterId;
    committed = state.committed;
    draft = state.draft || null;
    dirtyDraft = null;
    saveError = null;
    conflict = null;
    return snapshot();
  }

  function setMode(nextMode) {
    const next = String(nextMode || "").trim();
    if (!EDITOR_MODES.has(next)) throw new TypeError("invalid_editor_mode");
    mode = next;
    return snapshot();
  }

  async function patch(partial) {
    if (!characterId) throw new TypeError("editor_not_open");
    const id = characterId;
    const generation = openGeneration;
    const originalCommitted = committed;
    const originalDraft = liveDraft();
    try {
      const savedDraft = await service.saveDraft(id, partial, {
        baseRevision: dirtyDraft?.baseRevision ?? draft?.baseRevision ?? committed?.revision,
      });
      if (characterId !== id || generation !== openGeneration) return { characterId: id, draft: savedDraft, working: applyDraft(originalCommitted, savedDraft.patch), hasUnsaved: true };
      draft = savedDraft;
      dirtyDraft = null;
      saveError = null;
      return snapshot();
    } catch (error) {
      const failedDraft = memoryDraft(id, originalCommitted, originalDraft, partial);
      if (characterId !== id || generation !== openGeneration) return { characterId: id, draft: failedDraft, working: applyDraft(originalCommitted, failedDraft.patch), hasUnsaved: true, saveError: error };
      dirtyDraft = failedDraft;
      draft = dirtyDraft;
      saveError = error;
      onError?.(error);
      return snapshot();
    }
  }

  async function commit() {
    if (!characterId) throw new TypeError("editor_not_open");
    const id = characterId;
    const generation = openGeneration;
    try {
      const result = await service.commitDraft(id, {
        expectedRevision: draft?.baseRevision ?? committed?.revision,
      });
      if (characterId !== id || generation !== openGeneration) return { ...result, characterId: id, working: applyDraft(result.committed || result.conflict?.committed, result.draft?.patch || result.conflict?.draft?.patch) };
      if (result?.ok) {
        committed = result.committed || committed;
        draft = result.draft || null;
        dirtyDraft = null;
        saveError = null;
        conflict = null;
        return { ...result, ...snapshot() };
      }
      conflict = result?.conflict || null;
      if (result?.conflict?.committed) committed = result.conflict.committed;
      if (result?.conflict?.draft) draft = result.conflict.draft;
      saveError = null;
      onConflict?.(result.conflict);
      return { ...result, ...snapshot(), conflict };
    } catch (error) {
      saveError = error;
      conflict = null;
      draft = liveDraft();
      onError?.(error);
      return { ok: false, error, saveError: error, ...snapshot() };
    }
  }

  /** A mounted editor must save its own character even if another shell opens one. */
  async function saveForCharacter(nextCharacterId, partial, { expectedRevision, persistDraft = true } = {}) {
    const id = String(nextCharacterId || "").trim();
    if (!id) throw new TypeError("character_id_required");
    const generation = openGeneration;
    const isCurrent = () => characterId === id && generation === openGeneration;
    const currentDraft = characterId === id ? liveDraft()
      : service.listUnsaved?.().find((item) => item.characterId === id) || null;
    // Reopening a stale identity draft must not silently rebase it onto the new
    // committed revision. Both the mounted editor and existing draft constrain CAS.
    const baseRevision = Number.isInteger(expectedRevision) && Number.isInteger(currentDraft?.baseRevision)
      ? Math.min(expectedRevision, currentDraft.baseRevision)
      : expectedRevision ?? currentDraft?.baseRevision;
    const patch = characterId === id && dirtyDraft
      ? mergePatch(dirtyDraft.patch, partial)
      : partial;
    try {
      const savedDraft = persistDraft ? await service.saveDraft(id, patch, { baseRevision }) : currentDraft;
      const result = await service.commitDraft(id, {
        expectedRevision: persistDraft ? savedDraft.baseRevision : baseRevision,
        ...(persistDraft ? {} : { patch }),
      });
      if (isCurrent()) {
        if (result?.ok) {
          committed = result.committed || committed;
          draft = result.draft || null;
          dirtyDraft = null;
          conflict = null;
        } else {
          conflict = result?.conflict || null;
          if (conflict?.committed) committed = conflict.committed;
          draft = persistDraft ? conflict?.draft || savedDraft : currentDraft;
          onConflict?.(conflict);
        }
        saveError = null;
        return { ...result, ...snapshot() };
      }
      return {
        ...result,
        characterId: id,
        working: result?.committed
          ? applyDraft(result.committed, result.draft?.patch)
          : applyDraft(result?.conflict?.committed, result?.conflict?.draft?.patch),
      };
    } catch (error) {
      if (characterId !== id || generation !== openGeneration) return { ok: false, characterId: id, error, saveError: error };
      if (isCurrent()) saveError = error;
      onError?.(error);
      return { ok: false, characterId: id, error, saveError: error };
    }
  }

  function discard() {
    if (characterId) service.discardDraft(characterId);
    draft = null;
    dirtyDraft = null;
    saveError = null;
    conflict = null;
    return snapshot();
  }

  function canLeave() {
    return !snapshot().hasUnsaved;
  }

  function confirmLeave() {
    const state = snapshot();
    if (state.hasUnsaved) {
      onUnsavedPrompt?.({
        characterId: state.characterId,
        hasUnsaved: true,
      });
    }
    return {
      allowed: !state.hasUnsaved,
      hasUnsaved: state.hasUnsaved,
    };
  }

  function confirmNavigation() {
    return confirmLeave();
  }

  function bindShell(name) {
    boundShell = String(name || "");
    return snapshot();
  }

  return {
    get characterId() {
      return characterId;
    },
    get mode() {
      return mode;
    },
    get committed() {
      return snapshot().committed;
    },
    get draft() {
      return snapshot().draft;
    },
    get working() {
      return snapshot().working;
    },
    get hasUnsaved() {
      return snapshot().hasUnsaved;
    },
    get baseRevision() {
      return snapshot().baseRevision;
    },
    get staleBase() {
      return snapshot().staleBase;
    },
    get saveError() {
      return saveError;
    },
    get conflict() {
      return snapshot().conflict;
    },
    get boundShell() {
      return boundShell;
    },
    open,
    getState: snapshot,
    snapshot,
    setMode,
    patch,
    commit,
    save: commit,
    saveForCharacter,
    discard,
    canLeave,
    confirmLeave,
    confirmNavigation,
    bindShell,
  };
}

export function identityPatchFromProfileState(profileState = {}) {
  const fields = Array.isArray(profileState.fields) ? [...profileState.fields] : [];
  const pronouns = Array.isArray(profileState.pronouns)
    ? profileState.pronouns.map((item) => String(item || "").trim()).filter(Boolean)
    : String(profileState.pronouns || "")
      .split(/[,，、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  const genderIdentity = Object.hasOwn(profileState, "genderIdentity")
    ? String(profileState.genderIdentity || "").trim()
    : undefined;
  const ownBoundaries = Array.isArray(profileState.ownBoundaries)
    ? profileState.ownBoundaries.map((item) => String(item || "").trim()).filter(Boolean)
    : undefined;
  return {
    ...(fields[0] != null ? { name: fields[0] } : {}),
    ...(fields[1] != null ? { alias: fields[1] } : {}),
    ...(genderIdentity !== undefined || pronouns.length
      ? {
        selfIdentity: {
          ...(genderIdentity !== undefined ? { genderIdentity } : {}),
          ...(pronouns.length ? { pronouns } : {}),
        },
      }
      : {}),
    profile: {
      ...(fields.length ? { fields } : {}),
      ...(Object.hasOwn(profileState, "promptSystem")
        ? { promptSystem: profileState.promptSystem }
        : {}),
      ...(Object.hasOwn(profileState, "promptDeveloper")
        ? { promptDeveloper: profileState.promptDeveloper }
        : {}),
      ...(Object.hasOwn(profileState, "postHistoryInstructions")
        ? { postHistoryInstructions: profileState.postHistoryInstructions }
        : {}),
      ...(Object.hasOwn(profileState, "scenario")
        ? { scenario: profileState.scenario }
        : {}),
      ...(ownBoundaries ? { ownBoundaries } : {}),
    },
  };
}

let sharedController;

export function getSharedCharacterEditorController() {
  sharedController ||= createCharacterEditorController({
    editorService: getSharedCharacterEditorService(),
  });
  return sharedController;
}

export default getSharedCharacterEditorController;
