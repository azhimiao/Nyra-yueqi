import assert from "node:assert/strict";
import { createCharacterEditorController } from "./editor-controller.js";
import { createCharacterEditorService } from "./editor-service.js";
import { createCharacterDraftStore } from "./draft-store.js";

const clone = (value) => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const data = new Map();
  const storage = { get length() { return data.size; }, key: (index) => [...data.keys()][index], getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  const records = new Map(["A", "B"].map((id) => [id, { id, name: id, revision: 1, profile: { fields: [id], promptSystem: `${id}_OLD` } }]));
  const characterStore = {
    getCharacter: async (id) => clone(records.get(id)),
    upsertCharacter: async (record, { expectedRevision }) => {
      assert.equal(record.revision, expectedRevision);
      assert.equal(records.get(record.id).revision, expectedRevision);
      const saved = { ...record, revision: record.revision + 1 };
      records.set(record.id, clone(saved));
      return clone(saved);
    },
  };
  const service = createCharacterEditorService({ characterStore, draftStore: createCharacterDraftStore({ storage }) });
  return { records, service, characterStore };
}

{
  const { records, service } = fixture();
  const controller = createCharacterEditorController({ editorService: service });
  await controller.open("A");
  await controller.patch({ name: "A identity draft", alias: "preserved" });
  await controller.open("B");
  const beforeB = clone(records.get("B"));
  const result = await controller.saveForCharacter("A", { profile: { promptSystem: "A_NEW" } }, { expectedRevision: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.working.id, "A");
  assert.equal(records.get("A").profile.promptSystem, "A_NEW");
  assert.equal(records.get("A").name, "A identity draft");
  assert.equal(records.get("A").alias, "preserved");
  assert.deepEqual(records.get("B"), beforeB);
  assert.equal(controller.working.id, "B");
  console.log("PASS scoped save preserves target identity draft and leaves another open character untouched");
}

for (const boundary of ["saveDraft", "commitDraft"]) {
  const { records, service } = fixture();
  const started = deferred();
  const resume = deferred();
  const controller = createCharacterEditorController({ editorService: {
    ...service,
    async [boundary](...args) { if (args[0] === "A") { started.resolve(); await resume.promise; } return service[boundary](...args); },
  } });
  await controller.open("A");
  const saving = controller.saveForCharacter("A", { profile: { promptSystem: "ASYNC_A" } }, { expectedRevision: 1 });
  await started.promise;
  await controller.open("B");
  await controller.patch({ alias: "B draft during A save" });
  resume.resolve();
  const result = await saving;
  assert.equal(result.ok, true);
  assert.equal(result.committed.id, "A");
  assert.equal(records.get("A").profile.promptSystem, "ASYNC_A");
  assert.equal(records.get("B").profile.promptSystem, "B_OLD");
  assert.equal(controller.working.id, "B");
  assert.equal(controller.working.alias, "B draft during A save");
  assert.equal(controller.hasUnsaved, true);
  console.log(`PASS character switch during ${boundary} cannot redirect save or overwrite new controller state`);
}

{
  const { records, service } = fixture();
  const controller = createCharacterEditorController({ editorService: service });
  await controller.open("A");
  records.set("A", { ...records.get("A"), revision: 2, name: "concurrent update" });
  const result = await controller.saveForCharacter("A", { profile: { promptSystem: "STALE" } }, { expectedRevision: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.conflict.actualRevision, 2);
  assert.equal(records.get("A").profile.promptSystem, "A_OLD");
  assert.equal(controller.working.profile.promptSystem, "STALE");
  assert.equal(controller.hasUnsaved, true);
  console.log("PASS stale revision rejects committed overwrite while retaining prompt draft");
}

{
  const { service } = fixture();
  const openedA = deferred();
  const controller = createCharacterEditorController({ editorService: {
    ...service,
    async openEditor(id) { if (id === "A") await openedA.promise; return service.openEditor(id); },
  } });
  const openingA = controller.open("A");
  await controller.open("B");
  openedA.resolve();
  await openingA;
  assert.equal(controller.characterId, "B");
  assert.equal(controller.working.id, "B");
  console.log("PASS stale async open cannot replace the latest character selection");
}

{
  const { records, service } = fixture();
  await service.saveDraft("A", { name: "old identity draft" }, { baseRevision: 1 });
  records.set("A", { ...records.get("A"), revision: 2, name: "external identity" });
  const controller = createCharacterEditorController({ editorService: service });
  await controller.open("B");
  const result = await controller.saveForCharacter("A", { profile: { promptSystem: "NEW_PROMPT" } }, { expectedRevision: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.conflict.expectedRevision, 1);
  assert.equal(records.get("A").name, "external identity");
  assert.equal(service.listUnsaved().find((draft) => draft.characterId === "A").patch.profile.promptSystem, "NEW_PROMPT");
  console.log("PASS prompt save cannot rebase an older identity draft silently");
}

for (const operation of ["patch", "commit"]) {
  const { service } = fixture();
  const started = deferred();
  const resume = deferred();
  const boundary = operation === "patch" ? "saveDraft" : "commitDraft";
  const controller = createCharacterEditorController({ editorService: {
    ...service,
    async [boundary](id, ...args) { if (id === "A") { started.resolve(); await resume.promise; } return service[boundary](id, ...args); },
  } });
  await controller.open("A");
  if (operation === "commit") await service.saveDraft("A", { alias: "A pending" });
  const pending = operation === "patch" ? controller.patch({ alias: "A pending" }) : controller.commit();
  await started.promise;
  await controller.open("B");
  await controller.patch({ alias: "B pending" });
  resume.resolve();
  const result = await pending;
  assert.equal(result.working.id, "A");
  assert.equal(controller.working.id, "B");
  assert.equal(controller.working.alias, "B pending");
  console.log(`PASS late identity ${operation} completion cannot alter another open character`);
}

{
  const { records, service, characterStore } = fixture();
  const writing = deferred();
  const resume = deferred();
  const originalWrite = characterStore.upsertCharacter;
  characterStore.upsertCharacter = async (...args) => { writing.resolve(); await resume.promise; return originalWrite(...args); };
  const controller = createCharacterEditorController({ editorService: service });
  await controller.open("A");
  await controller.patch({ alias: "submitted identity" });
  const saving = controller.saveForCharacter("A", { profile: { promptSystem: "SAVED_PROMPT" } }, { expectedRevision: 1, persistDraft: false });
  await writing.promise;
  await controller.patch({ alias: "typed while saving" });
  resume.resolve();
  const result = await saving;
  assert.equal(result.ok, true);
  assert.equal(records.get("A").alias, "submitted identity");
  assert.equal(records.get("A").profile.promptSystem, "SAVED_PROMPT");
  assert.equal(controller.working.alias, "typed while saving");
  assert.equal(controller.draft.baseRevision, records.get("A").revision);
  assert.equal(controller.hasUnsaved, true);
  console.log("PASS identity text typed during prompt commit survives as a newer draft");
}

{
  const { records, service, characterStore } = fixture();
  const controller = createCharacterEditorController({ editorService: service });
  await controller.open("A");
  await controller.patch({ alias: "identity before failure" });
  characterStore.upsertCharacter = async () => { throw new Error("write_failed"); };
  const result = await controller.saveForCharacter("A", { profile: { promptSystem: "LOCAL_PROMPT" } }, { expectedRevision: 1, persistDraft: false });
  assert.equal(result.ok, false);
  assert.equal(records.get("A").profile.promptSystem, "A_OLD");
  assert.equal(controller.draft.patch.profile?.promptSystem, undefined);
  assert.equal(controller.working.alias, "identity before failure");
  console.log("PASS failed local prompt submission does not contaminate the persisted identity draft");
}
