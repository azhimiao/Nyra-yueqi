#!/usr/bin/env node
import assert from "node:assert/strict";
import { createEmptyDraftV2, createDefaultStateV2, transition } from "../src/first-light/state-v2.js";
import { commitFirstLightV2, preferenceRecordId } from "../src/first-light/commit-v2.js";
import { createExplicitValue } from "../src/contracts/companion-v2-shared.js";
import { buildCharacterIdentityV2, pronounsFromGenderIdentity } from "../src/prompt/character-identity-v2.js";
import { buildRelationshipContractV2 } from "../src/prompt/relationship-contract-v2.js";
import { FL_V2_FIELD_PATHS } from "../src/first-light/state-v2.js";

const AT = "2026-08-18T04:00:00.000Z";
let n = 0;
function pass(name) {
  n += 1;
  console.log(`PASS ${name}`);
}

function memoryBackend() {
  const stores = new Map();
  return {
    stores,
    async runTransaction({ ops, fingerprint, idempotencyKey }) {
      this._seen = this._seen || new Map();
      if (this._seen.has(idempotencyKey)) {
        const prev = this._seen.get(idempotencyKey);
        if (prev.fingerprint !== fingerprint) return { ok: false, conflict: true };
        return { ok: true, duplicate: true, committed: prev.committed };
      }
      for (const op of ops) {
        const bag = stores.get(op.store) || new Map();
        if (op.type === "put") bag.set(op.record.id, op.record);
        else bag.delete(op.id);
        stores.set(op.store, bag);
      }
      const committed = ops.map((op) => ({ store: op.store, id: op.type === "put" ? op.record.id : op.id }));
      this._seen.set(idempotencyKey, { fingerprint, committed });
      return { ok: true, duplicate: false, committed };
    },
  };
}

let state = createDefaultStateV2();
state = transition(state, { type: "SELECT_PATH", path: "quick", at: AT });
state = transition(state, {
  type: "SET_FIELD",
  path: "character.name",
  value: "林黛玉",
  source: "explicit",
  at: AT,
});
state = transition(state, {
  type: "SET_FIELD",
  path: "character.genderIdentity",
  value: "女",
  source: "explicit",
  at: AT,
});
state = transition(state, {
  type: "SET_FIELD",
  path: "preference.callUserAs",
  value: "宝玉",
  source: "explicit",
  at: AT,
});
state = transition(state, {
  type: "SET_FIELD",
  path: "preference.relationshipType",
  value: "lover",
  source: "explicit",
  at: AT,
});
state = transition(state, {
  type: "SET_FIELD",
  path: "preference.purposes",
  value: ["listen"],
  source: "explicit",
  at: AT,
});
state = transition(state, {
  type: "SET_FIELD",
  path: "preference.supportStyle",
  value: "listen",
  source: "explicit",
  at: AT,
});
state = transition(state, {
  type: "SET_FIELD",
  path: "preference.initiativeStyle",
  value: "wait",
  source: "explicit",
  at: AT,
});
state = transition(state, {
  type: "SET_FIELD",
  path: "preference.allowProactive",
  value: false,
  source: "explicit",
  at: AT,
});
state = transition(state, {
  type: "SET_FIELD",
  path: "preference.quietHours",
  value: { start: "23:00", end: "08:00" },
  source: "explicit",
  at: AT,
});
state = transition(state, {
  type: "SET_FIELD",
  path: "preference.hardBoundaries",
  value: ["不谈考试"],
  source: "explicit",
  at: AT,
});

const backend = memoryBackend();
const clock = { nowIso: () => AT };
const committed = await commitFirstLightV2(state, {
  characterId: "char-daiyu",
  backend,
  clock,
});
assert.equal(committed.ok, true);
assert.equal(backend.stores.get("characters").get("char-daiyu").selfIdentity.genderIdentity, "女");
assert.deepEqual(backend.stores.get("characters").get("char-daiyu").selfIdentity.pronouns, ["她"]);
assert.equal(
  backend.stores.get("preferences").get(preferenceRecordId("local", "char-daiyu")).userIdentity.callUserAs.value,
  "宝玉",
);
assert.match(committed.firstMessage, /我是林黛玉/);
assert.match(committed.firstMessage, /我叫你宝玉/);
assert.match(committed.firstMessage, /月栖|Yueqi/);
assert.doesNotMatch(committed.firstMessage, /我是宝玉|来自宝玉|你叫我宝玉|我是月栖/);
const opening = backend.stores.get("openings").get("fl-first-char-daiyu");
assert.equal(opening.content, committed.firstMessage);
assert.equal(opening.status, "ready");
pass("atomic commit writes character, preference, and a self-intro opening");

const again = await commitFirstLightV2(state, { characterId: "char-daiyu", backend, clock });
assert.equal(again.ok, true);
assert.equal(again.duplicate, true);
assert.equal(backend.stores.get("openings").size, 1);
assert.equal([...backend.stores.get("openings").values()][0].content, committed.firstMessage);
pass("same commit id is idempotent");

const identity = buildCharacterIdentityV2(committed.character);
assert.match(identity, /女/);
assert.match(identity, /林黛玉/);
const contract = buildRelationshipContractV2(committed.preference);
assert.match(contract, /宝玉/);
assert.match(contract, /lover|恋爱|关系/);
assert.match(contract, /不谈考试/);
pass("committed records compile into identity and relationship prompt");

assert.deepEqual(pronounsFromGenderIdentity("female"), ["她"]);
assert.deepEqual(pronounsFromGenderIdentity("male"), ["他"]);
assert.deepEqual(pronounsFromGenderIdentity("nonbinary"), ["ta"]);
assert.deepEqual(pronounsFromGenderIdentity("unset"), ["ta"]);
assert.deepEqual(pronounsFromGenderIdentity(""), []);
pass("gender derives pronouns; unset stays ta");

assert.ok(Array.isArray(FL_V2_FIELD_PATHS) && FL_V2_FIELD_PATHS.length >= 10);
pass("field path list exists for coverage meta-test");

let importState = createDefaultStateV2();
importState = transition(importState, { type: "SELECT_PATH", path: "import", at: AT });
importState = transition(importState, {
  type: "SET_FIELD",
  path: "importedCharacterId",
  value: "char-imported",
  at: AT,
});
importState = transition(importState, {
  type: "SET_FIELD",
  path: "preference.callUserAs",
  value: "你",
  source: "explicit",
  at: AT,
});
importState = transition(importState, {
  type: "SET_FIELD",
  path: "preference.relationshipType",
  value: "friend",
  source: "explicit",
  at: AT,
});
const importBackend = memoryBackend();
const imported = await commitFirstLightV2(importState, {
  characterId: "char-imported",
  existingCharacter: {
    id: "char-imported",
    name: "艾拉",
    source: "import",
    skipOpeningIntro: true,
  },
  backend: importBackend,
  clock,
});
assert.equal(imported.ok, true);
assert.match(imported.firstMessage, /我是艾拉/);
assert.match(imported.firstMessage, /月栖/);
assert.equal(importBackend.stores.get("openings").get("fl-first-char-imported").content, imported.firstMessage);
assert.equal(importBackend.stores.get("characters").get("char-imported").skipOpeningIntro, false);
assert.equal(importBackend.stores.get("onboarding").get("onboarding:char-imported").skipOpeningIntro, false);
pass("import path keeps persona and still sends a Yueqi opening");

const greetingBackend = memoryBackend();
const greeted = await commitFirstLightV2(importState, {
  characterId: "char-greeted",
  existingCharacter: {
    id: "char-greeted",
    name: "艾拉",
    source: "import",
    greetings: { primary: "你来了。" },
  },
  backend: greetingBackend,
  clock,
});
assert.equal(greeted.ok, true);
assert.equal(greeted.firstMessage, "你来了。");
assert.equal(greetingBackend.stores.get("openings").get("fl-first-char-greeted").content, "你来了。");
pass("imported card first_mes is the first spoken line");

console.log(`verify-first-light-commit-v2: ${n} PASS`);
