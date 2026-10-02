#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  EDITOR_SECTIONS,
  applyStructuredCharacterPatch,
  exportCharacterWithoutPrivate,
  isGenderUnset,
} from "../src/characters/editor-sections.js";

let n = 0;
function pass(name) {
  n += 1;
  console.log(`PASS ${name}`);
}

assert.ok(EDITOR_SECTIONS.some((section) => section.id === "identity"));
assert.ok(EDITOR_SECTIONS.find((section) => section.id === "relationship").private === true);
pass("sections include private relationship");

assert.equal(isGenderUnset(""), true);
assert.equal(isGenderUnset("暂不设定"), true);
assert.equal(isGenderUnset("女"), false);
pass("unset gender is distinct");

const exported = exportCharacterWithoutPrivate({
  id: "c1",
  name: "林黛玉",
  preference: { callUserAs: { value: "宝玉", source: "explicit" } },
  privatePreference: { secret: true },
  profileV2: { name: "林黛玉", relationship: { type: "lover" } },
});
assert.equal(exported.preference, undefined);
assert.equal(exported.privatePreference, undefined);
assert.equal(exported.profileV2.relationship, undefined);
assert.equal(exported.name, "林黛玉");
pass("export strips private preference");

const next = applyStructuredCharacterPatch(
  { name: "A", selfIdentity: { genderIdentity: "" } },
  { name: "B", genderIdentity: "女", pronouns: "她, they" },
);
assert.equal(next.name, "B");
assert.equal(next.selfIdentity.genderIdentity, "女");
assert.deepEqual(next.selfIdentity.pronouns, ["她", "they"]);
pass("structured patch writes gender and pronouns");

console.log(`verify-editor-sections: ${n} PASS`);
