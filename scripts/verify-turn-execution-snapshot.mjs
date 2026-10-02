#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
globalThis.window = {
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {},
  },
};
globalThis.document = { dispatchEvent() { return true; } };

const {
  buildTurnExecutionSnapshot,
  getHeldTurnSnapshot,
  hashSnapshotPayload,
  holdTurnSnapshot,
} = await import("../src/conversation/turn-execution-snapshot.js");
const { validateTurnExecutionSnapshotV1 } = await import("../src/contracts/turn-execution-snapshot-v1.js");
const { setActiveCharacterId } = await import("../src/characters/store.js");

const characters = [
  { id: "char-a", revision: 3, name: "A" },
  { id: "char-b", revision: 7, name: "B" },
];

function build(overrides = {}) {
  return buildTurnExecutionSnapshot({
    turnExecutionId: "tex-test-1",
    userId: "local",
    focus: { kind: "dm", characterId: "char-a", sessionId: "char:char-a" },
    speakerCharacterId: "char-a",
    currentInput: { text: "hello", attachmentRefs: [] },
    characters,
    conversationRevision: 2,
    locale: "zh-CN",
    conversationLanguage: "zh-CN",
    promptSettings: { mode: "chat" },
    budgetProfile: { total: 8000 },
    cutoverProfile: "legacy",
    providerCapabilities: { streaming: true },
    runtimeCapabilities: { network: true },
    historyBoundaryIds: ["msg-1"],
    preset: { id: "default", revision: 1 },
    ...overrides,
  });
}

const dm = build();
assert.equal(dm.ok, true, JSON.stringify(dm.errors));
assert.equal(validateTurnExecutionSnapshotV1(dm.snapshot).ok, true);
assert.deepEqual(dm.snapshot.participants, [{ characterId: "char-a", revision: 3 }]);
assert.equal(dm.snapshot.characterRevisions["char-a"], 3);
console.log("PASS DM snapshot validates with speaker revision");

const groupFocus = {
  kind: "group",
  sessionId: "group:test",
  memberIds: ["char-a", "char-b"],
};
const group = build({
  focus: groupFocus,
  speakerCharacterId: "char-b",
});
assert.equal(group.ok, true, JSON.stringify(group.errors));
assert.equal(group.snapshot.participants.length, 2);
assert.deepEqual(group.snapshot.participants.map((item) => item.characterId), ["char-a", "char-b"]);
console.log("PASS group snapshot freezes all participants");

holdTurnSnapshot(group.snapshot);
const originalHash = group.snapshot.snapshotHash;
characters.splice(0, characters.length, { id: "char-c", revision: 1 });
groupFocus.memberIds.splice(0, groupFocus.memberIds.length, "char-c");
setActiveCharacterId("char-c");
assert.equal(group.snapshot.speakerCharacterId, "char-b");
assert.deepEqual(group.snapshot.characterRevisions, { "char-a": 3, "char-b": 7 });
assert.equal(group.snapshot.snapshotHash, originalHash);
assert.equal(getHeldTurnSnapshot("tex-test-1"), group.snapshot);
console.log("PASS held snapshot ignores live character changes");

const deletedSpeaker = build({
  characters: [{ id: "char-a", revision: 3 }],
  focus: {
    kind: "group",
    sessionId: "group:test",
    memberIds: ["char-a", "char-b"],
  },
  speakerCharacterId: "char-b",
});
assert.equal(deletedSpeaker.ok, false);
assert.equal(deletedSpeaker.snapshot, undefined);
assert.ok(deletedSpeaker.errors.some((item) => item.code === "invalid_id"));
console.log("PASS deleted speaker fails closed");

const staleRevision = build({
  characters: [
    { id: "char-a", revision: 4 },
    { id: "char-b", revision: 7 },
  ],
  characterRevisions: { "char-a": 3 },
});
assert.equal(staleRevision.ok, false);
assert.ok(staleRevision.errors.some((item) => item.code === "invalid_revision"));
console.log("PASS participant revision mismatch fails closed");

assert.equal(Object.isFrozen(dm.snapshot), true);
assert.equal(Object.isFrozen(dm.snapshot.participants), true);
assert.equal(Object.isFrozen(dm.snapshot.promptSettings), true);
assert.throws(() => {
  dm.snapshot.participants[0].revision = 99;
}, TypeError);
assert.equal(dm.snapshot.participants[0].revision, 3);
console.log("PASS snapshot is deeply immutable");

const sameA = build({ characters: [{ id: "char-a", revision: 3 }] });
const sameB = build({ characters: [{ id: "char-a", revision: 3 }] });
assert.equal(sameA.snapshot.snapshotHash, sameB.snapshot.snapshotHash);
assert.equal(hashSnapshotPayload(sameA.snapshot), hashSnapshotPayload(sameB.snapshot));
const differentTurn = build({
  turnExecutionId: "tex-test-2",
  characters: [{ id: "char-a", revision: 3 }],
});
assert.equal(hashSnapshotPayload(sameA.snapshot), hashSnapshotPayload(differentTurn.snapshot));
console.log("PASS snapshot payload hashing is deterministic");

const builderSource = readFileSync(
  join(root, "src/conversation/turn-execution-snapshot.js"),
  "utf8",
);
for (const forbidden of ["querySelector", "getElementById", "textarea"]) {
  assert.equal(builderSource.includes(forbidden), false, `forbidden DOM reader: ${forbidden}`);
}
console.log("PASS snapshot builder is DOM-free");

console.log("verify-turn-execution-snapshot: PASS");
