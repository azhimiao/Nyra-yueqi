/**
 * Task 2.1 — shared App/phone editor container (draft + explicit save).
 * Run: node scripts/verify-editor-container.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
    if (this.failKey && String(key).includes(this.failKey)) {
      throw new Error("injected_store_failure");
    }
    this._data.set(String(key), String(value));
  }

  removeItem(key) {
    this._data.delete(String(key));
  }
}

const characterStorage = new MemoryStorage();
globalThis.window = { localStorage: characterStorage };
globalThis.document = { dispatchEvent: () => true };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { defaultProfile, LOCAL_KEYS } = await import("../src/constants.js");
const { CHARACTER_DRAFT_KEY_PREFIX, createCharacterDraftStore } = await import(
  "../src/characters/draft-store.js"
);
const { createCharacterEditorService } = await import("../src/characters/editor-service.js");
const { createCharacterEditorController } = await import("../src/characters/editor-controller.js");
const {
  resetCharacterCacheForTests,
  upsertCharacter,
} = await import("../src/characters/store.js");

function profile(name) {
  return {
    ...defaultProfile,
    fields: [name, name, ...defaultProfile.fields.slice(2)],
    promptSystem: `${name} system`,
  };
}

resetCharacterCacheForTests();
const character = await upsertCharacter({
  id: "editor-shared",
  name: "Shared",
  alias: "Shared",
  profile: profile("Shared"),
});

let passed = 0;
async function verify(name, run) {
  await run();
  passed += 1;
  console.log(`PASS  ${name}`);
}

await verify("App-shaped and phone-shaped controllers share one draft", async () => {
  const draftStorage = new MemoryStorage();
  const draftStore = createCharacterDraftStore({ storage: draftStorage });
  const editorService = createCharacterEditorService({ draftStore });
  const app = createCharacterEditorController({ editorService });
  const phone = createCharacterEditorController({ editorService });

  await app.open(character.id);
  await app.patch({
    name: "App draft name",
    profile: { promptSystem: "App draft prompt" },
  });

  const phoneState = await phone.open(character.id);
  assert.equal(phoneState.draft.patch.name, "App draft name");
  assert.equal(phoneState.working.profile.promptSystem, "App draft prompt");
  assert.equal(phoneState.hasUnsaved, true);
  assert.equal(phoneState.committed.name, "Shared");
});

await verify("basic to advanced to basic keeps promptSystem and name", async () => {
  const editorService = createCharacterEditorService({
    draftStore: createCharacterDraftStore({ storage: new MemoryStorage() }),
  });
  const controller = createCharacterEditorController({ editorService });
  await controller.open(character.id);
  await controller.patch({
    name: "Kept name",
    profile: { promptSystem: "Kept prompt" },
  });
  const advanced = controller.setMode("advanced");
  assert.equal(advanced.mode, "advanced");
  assert.equal(advanced.working.name, "Kept name");
  assert.equal(advanced.working.profile.promptSystem, "Kept prompt");
  const basic = controller.setMode("basic");
  assert.equal(basic.mode, "basic");
  assert.equal(basic.working.name, "Kept name");
  assert.equal(basic.working.profile.promptSystem, "Kept prompt");
});

await verify("hasUnsaved makes canLeave false and confirmLeave prompts", async () => {
  let prompted = 0;
  const editorService = createCharacterEditorService({
    draftStore: createCharacterDraftStore({ storage: new MemoryStorage() }),
  });
  const controller = createCharacterEditorController({
    editorService,
    onUnsavedPrompt: () => {
      prompted += 1;
    },
  });
  await controller.open(character.id);
  assert.equal(controller.canLeave(), true);
  await controller.patch({ name: "Unsaved" });
  assert.equal(controller.getState().hasUnsaved, true);
  assert.equal(controller.canLeave(), false);
  const leave = controller.confirmLeave();
  assert.equal(leave.allowed, false);
  assert.equal(leave.hasUnsaved, true);
  assert.equal(prompted, 1);
});

await verify("commit CAS conflict keeps committed off the stale draft", async () => {
  const editorService = createCharacterEditorService({
    draftStore: createCharacterDraftStore({ storage: new MemoryStorage() }),
  });
  let conflictSeen = null;
  const controller = createCharacterEditorController({
    editorService,
    onConflict: (conflict) => {
      conflictSeen = conflict;
    },
  });
  const opened = await controller.open(character.id);
  await controller.patch({ name: "Stale draft name" });
  const external = await upsertCharacter(
    { id: character.id, name: "External winner" },
    { expectedRevision: opened.committed.revision },
  );
  const result = await controller.commit();
  assert.equal(result.ok, false);
  assert.ok(result.conflict);
  assert.ok(conflictSeen);
  assert.equal(controller.getState().committed.name, "External winner");
  assert.notEqual(controller.getState().committed.name, "Stale draft name");
  assert.equal(controller.getState().draft.patch.name, "Stale draft name");
  assert.equal(controller.getState().committed.revision, external.revision);
});

await verify("store failure keeps the draft and calls onError", async () => {
  const failChar = await upsertCharacter({
    id: "editor-store-fail",
    name: "FailSafe",
    alias: "FailSafe",
    profile: profile("FailSafe"),
  });
  const draftStorage = new MemoryStorage();
  const editorService = createCharacterEditorService({
    draftStore: createCharacterDraftStore({ storage: draftStorage }),
  });
  let errorSeen = null;
  const controller = createCharacterEditorController({
    editorService,
    onError: (error) => {
      errorSeen = error;
    },
  });
  await controller.open(failChar.id);
  await controller.patch({ name: "must survive" });
  draftStorage.failKey = CHARACTER_DRAFT_KEY_PREFIX;
  const afterFail = await controller.patch({ alias: "still in memory" });
  draftStorage.failKey = "";
  assert.ok(errorSeen);
  assert.match(String(errorSeen.message || errorSeen), /injected_store_failure/);
  assert.equal(afterFail.hasUnsaved, true);
  assert.equal(afterFail.working.name, "must survive");
  assert.equal(afterFail.working.alias, "still in memory");
  assert.equal(afterFail.committed.name, "FailSafe");

  characterStorage.failKey = LOCAL_KEYS.charactersKey;
  const commitFail = await controller.commit();
  characterStorage.failKey = "";
  assert.equal(commitFail.ok, false);
  assert.equal(controller.getState().hasUnsaved, true);
  assert.equal(controller.getState().working.alias, "still in memory");
});

await verify("App and phone both import the shared editor modules", () => {
  const appSource = readFileSync(join(root, "src", "app.js"), "utf8");
  const phoneSource = readFileSync(join(root, "src", "phone-shell", "phone-shell.js"), "utf8");
  const sharedImport = /characters\/editor-controller\.js|characters\/editor-service\.js/;
  assert.match(appSource, sharedImport);
  assert.match(phoneSource, sharedImport);
  assert.match(appSource, /createCharacterEditorController|getSharedCharacterEditorController/);
  assert.match(phoneSource, /createCharacterEditorController|getSharedCharacterEditorController/);
  assert.equal(
    /yueqi\.character\.draft\.v2:/.test(appSource) || /yueqi\.character\.draft\.v2:/.test(phoneSource),
    false,
  );
});

assert.equal(passed, 6);
console.log(`\nPASS  ${passed}/6 editor container checks`);
