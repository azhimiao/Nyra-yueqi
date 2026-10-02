import assert from "node:assert/strict";
import {
  AUTONOMY_CHANGED_EVENT, AUTONOMY_PREFS_KEY,
  loadAutonomyPrefs, saveAutonomyPrefs, __setAutonomyBagForTests,
} from "./autonomy-prefs.js";
import { shouldDispatchDeskPetSet } from "../ui/pet-power-control.js";

const data = new Map();
let writes = 0;
globalThis.localStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => { writes += 1; data.set(key, String(value)); },
};
globalThis.CustomEvent = class { constructor(type, { detail } = {}) { this.type = type; this.detail = detail; } };
function eventBus() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) { listeners.set(type, callback); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); },
  };
}
globalThis.document = eventBus();
const petCommands = eventBus();
let prefOn = false;
let closeCalls = 0;
let openCalls = 0;
let changes = 0;
let depth = 0;
let maxDepth = 0;

// Reproduce the production synchronous feedback, preserving the deliberate
// "always dispatch Off" contract used to close stale system overlays.
document.addEventListener(AUTONOMY_CHANGED_EVENT, ({ detail }) => {
  changes += 1;
  depth += 1;
  maxDepth = Math.max(maxDepth, depth);
  if (depth > 8) throw new Error("autonomy_visibility_feedback_loop");
  if (shouldDispatchDeskPetSet(detail.prefs.deskPetVisible, prefOn)) {
    petCommands.dispatchEvent(new CustomEvent("set", { detail: { enabled: detail.prefs.deskPetVisible } }));
  }
  depth -= 1;
});
petCommands.addEventListener("set", ({ detail }) => {
  prefOn = detail.enabled;
  if (prefOn) openCalls += 1;
  else closeCalls += 1;
  saveAutonomyPrefs({ deskPetVisible: prefOn });
});

saveAutonomyPrefs({ deskPetVisible: false });
assert.equal(changes, 0);
assert.equal(writes, 0, "saving the effective default is a no-op");

saveAutonomyPrefs({ deskPetVisible: true });
assert.equal(loadAutonomyPrefs().deskPetVisible, true);
assert.equal(openCalls, 1);
assert.equal(changes, 1);
assert.equal(writes, 1);
saveAutonomyPrefs({ deskPetVisible: false });
assert.equal(loadAutonomyPrefs().deskPetVisible, false);
assert.equal(closeCalls, 1);
assert.equal(changes, 2);
assert.equal(writes, 2);
assert.equal(maxDepth, 1, "state acknowledgement must not recursively emit");

petCommands.dispatchEvent(new CustomEvent("set", { detail: { enabled: false } }));
assert.equal(closeCalls, 2, "repeated Off still reaches the closer");
assert.equal(changes, 2, "repeated Off does not broadcast unchanged prefs");
assert.equal(writes, 2);
saveAutonomyPrefs({ dailyCap: 4, deskPetVisible: false });
assert.equal(changes, 3, "other preference changes still notify subscribers");
assert.equal(loadAutonomyPrefs().dailyCap, 4);
saveAutonomyPrefs({ dailyCap: "4" });
assert.equal(changes, 3, "normalization-equivalent updates are no-ops");
assert.equal(JSON.parse(data.get(AUTONOMY_PREFS_KEY)).dailyCap, 4);
saveAutonomyPrefs({ deskPetVisible: true });
assert.equal(changes, 4);
assert.equal(openCalls, 2, "the pet can reopen after a close");

const testBag = { deskPetVisible: false };
__setAutonomyBagForTests(testBag);
prefOn = false;
saveAutonomyPrefs({ deskPetVisible: true });
assert.equal(testBag.deskPetVisible, true, "the test storage path keeps the same change semantics");
const afterTestChange = changes;
saveAutonomyPrefs({ deskPetVisible: true });
assert.equal(changes, afterTestChange);
__setAutonomyBagForTests(null);
console.log("PASS autonomy visibility feedback is bounded; On, Off, repeated Off and other preference changes still work");
