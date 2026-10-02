/**
 * Task 1.2 — per-character drafts and compare-and-swap character saves.
 * Run: node scripts/verify-character-editor-cas.mjs
 */
import assert from "node:assert/strict";

class MemoryStorage {
  constructor() {
    this._data = new Map();
    this.failKey = "";
  }

  get length() {
    return this._data.size;
  }

  key(index) {
    return [...this._data.keys()][index] ?? null;
  }

  getItem(key) {
    return this._data.get(String(key)) ?? null;
  }

  setItem(key, value) {
    if (String(key) === this.failKey) throw new Error("injected_store_failure");
    this._data.set(String(key), String(value));
  }

  removeItem(key) {
    this._data.delete(String(key));
  }
}

const characterStorage = new MemoryStorage();
globalThis.window = { localStorage: characterStorage };
globalThis.document = { dispatchEvent: () => true };

const { defaultProfile, LOCAL_KEYS } = await import("../src/constants.js");
const {
  CHARACTER_DRAFT_KEY_PREFIX,
  createCharacterDraftStore,
} = await import("../src/characters/draft-store.js");
const { createCharacterEditorService } = await import("../src/characters/editor-service.js");
const {
  getCharacter,
  resetCharacterCacheForTests,
  upsertCharacter,
} = await import("../src/characters/store.js");

function profile(name) {
  return {
    ...defaultProfile,
    fields: [name, name, ...defaultProfile.fields.slice(2)],
  };
}

resetCharacterCacheForTests();
const characterA = await upsertCharacter({
  id: "character-a",
  name: "A",
  alias: "A",
  profile: profile("A"),
});
const characterB = await upsertCharacter({
  id: "character-b",
  name: "B",
  alias: "B",
  profile: profile("B"),
});

let passed = 0;
async function verify(name, run) {
  await run();
  passed += 1;
  console.log(`PASS  ${name}`);
}

await verify("A draft stays isolated through A to B to A", async () => {
  const draftStorage = new MemoryStorage();
  const editor = createCharacterEditorService({
    draftStore: createCharacterDraftStore({ storage: draftStorage }),
  });
  await editor.openEditor(characterA.id);
  await editor.saveDraft(characterA.id, { name: "A draft" }, {
    baseRevision: characterA.revision,
  });
  const bState = await editor.openEditor(characterB.id);
  assert.equal(bState.draft, null);
  assert.equal(bState.hasUnsaved, false);
  const aState = await editor.openEditor(characterA.id);
  assert.equal(aState.draft.patch.name, "A draft");
  assert.equal(aState.hasUnsaved, true);
  const staleDraft = await editor.saveDraft(characterA.id, { alias: "stale base" }, {
    baseRevision: characterA.revision + 99,
  });
  assert.equal(staleDraft.staleBase, true);
});

await verify("stale tab commit returns conflict without overwrite", async () => {
  const firstTab = createCharacterEditorService({
    draftStore: createCharacterDraftStore({ storage: new MemoryStorage() }),
  });
  const staleTab = createCharacterEditorService({
    draftStore: createCharacterDraftStore({ storage: new MemoryStorage() }),
  });
  const firstOpen = await firstTab.openEditor(characterA.id);
  const staleOpen = await staleTab.openEditor(characterA.id);
  await firstTab.saveDraft(characterA.id, { name: "A committed by first tab" }, {
    baseRevision: firstOpen.committed.revision,
  });
  await staleTab.saveDraft(characterA.id, { name: "A stale overwrite" }, {
    baseRevision: staleOpen.committed.revision,
  });

  const firstCommit = await firstTab.commitDraft(characterA.id, {
    expectedRevision: firstOpen.committed.revision,
  });
  assert.equal(firstCommit.ok, true);
  assert.equal(firstCommit.committed.revision, firstOpen.committed.revision + 1);

  const conflict = await staleTab.commitDraft(characterA.id, {
    expectedRevision: staleOpen.committed.revision,
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict.expectedRevision, staleOpen.committed.revision);
  assert.equal(conflict.conflict.actualRevision, firstCommit.committed.revision);
  assert.equal(conflict.conflict.draft.patch.name, "A stale overwrite");
  assert.equal((await getCharacter(characterA.id)).name, "A committed by first tab");
});

await verify("store failure preserves draft and committed cache", async () => {
  const draftStorage = new MemoryStorage();
  const editor = createCharacterEditorService({
    draftStore: createCharacterDraftStore({ storage: draftStorage }),
  });
  const before = await editor.openEditor(characterB.id);
  await editor.saveDraft(characterB.id, { name: "must survive failure" }, {
    baseRevision: before.committed.revision,
  });
  characterStorage.failKey = LOCAL_KEYS.charactersKey;
  await assert.rejects(
    editor.commitDraft(characterB.id, { expectedRevision: before.committed.revision }),
    /injected_store_failure/,
  );
  characterStorage.failKey = "";
  assert.equal((await editor.openEditor(characterB.id)).draft.patch.name, "must survive failure");
  assert.equal((await getCharacter(characterB.id)).name, before.committed.name);
  assert.equal((await getCharacter(characterB.id)).revision, before.committed.revision);
});

await verify("reload keeps committed and draft separate", async () => {
  const sharedDraftStorage = new MemoryStorage();
  const firstService = createCharacterEditorService({
    draftStore: createCharacterDraftStore({ storage: sharedDraftStorage }),
  });
  const committed = await getCharacter(characterB.id);
  await firstService.saveDraft(characterB.id, {
    alias: "reload draft alias",
    profile: { promptSystem: "reload draft prompt" },
  }, { baseRevision: committed.revision });

  resetCharacterCacheForTests();
  const reloadedService = createCharacterEditorService({
    draftStore: createCharacterDraftStore({ storage: sharedDraftStorage }),
  });
  const reloaded = await reloadedService.openEditor(characterB.id);
  assert.equal(reloaded.committed.alias, committed.alias);
  assert.equal(reloaded.committed.profile.promptSystem, committed.profile.promptSystem);
  assert.equal(reloaded.draft.patch.alias, "reload draft alias");
  assert.equal(reloaded.draft.patch.profile.promptSystem, "reload draft prompt");
});

await verify("discard removes only the selected character draft", async () => {
  const draftStorage = new MemoryStorage();
  const editor = createCharacterEditorService({
    draftStore: createCharacterDraftStore({ storage: draftStorage }),
  });
  const committed = await getCharacter(characterA.id);
  await editor.saveDraft(characterA.id, { alias: "discard me" }, {
    baseRevision: committed.revision,
  });
  editor.discardDraft(characterA.id);
  const corruptKey = `${CHARACTER_DRAFT_KEY_PREFIX}${encodeURIComponent(characterA.id)}`;
  draftStorage.setItem(corruptKey, "{not-json");
  const corruptSafeEditor = createCharacterEditorService({
    draftStore: createCharacterDraftStore({ storage: draftStorage }),
  });
  const state = await editor.openEditor(characterA.id);
  assert.equal(state.draft, null);
  assert.equal(state.hasUnsaved, false);
  assert.equal((await corruptSafeEditor.openEditor(characterA.id)).draft, null);
});

await verify("upsert without expectedRevision remains compatible", async () => {
  const before = await getCharacter(characterB.id);
  const result = await upsertCharacter({ id: characterB.id, alias: "legacy overwrite" });
  assert.equal(result.id, characterB.id);
  assert.equal(result.alias, "legacy overwrite");
  assert.equal(result.revision, before.revision + 1);
  await assert.rejects(
    upsertCharacter(
      { id: characterB.id, alias: "must not overwrite" },
      { expectedRevision: before.revision },
    ),
    (error) => error?.code === "revision_conflict"
      && error.expectedRevision === before.revision
      && error.actualRevision === result.revision
      && error.current?.alias === "legacy overwrite",
  );
  assert.equal((await getCharacter(characterB.id)).alias, "legacy overwrite");
});

assert.equal(passed, 6);
console.log(`\nPASS  ${passed}/6 character editor CAS checks`);
