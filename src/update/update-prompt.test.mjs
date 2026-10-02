import assert from "node:assert/strict";
import { shouldPromptUpdate, snoozeOptionalUpdate } from "./update-prompt.mjs";

assert.equal(shouldPromptUpdate({ kind: "none" }), false);
assert.equal(shouldPromptUpdate({ kind: "invalid" }), false);
assert.equal(shouldPromptUpdate({ kind: "forced", latestVersion: "1.1.0" }), true);

const store = new Map();
globalThis.localStorage = {
  getItem(key) { return store.has(key) ? store.get(key) : null; },
  setItem(key, value) { store.set(key, String(value)); },
};

assert.equal(shouldPromptUpdate({ kind: "optional", latestVersion: "1.1.0" }), true);
snoozeOptionalUpdate("1.1.0");
assert.equal(shouldPromptUpdate({ kind: "optional", latestVersion: "1.1.0" }), false);
assert.equal(shouldPromptUpdate({ kind: "optional", latestVersion: "1.1.0" }, { force: true }), true);
assert.equal(shouldPromptUpdate({ kind: "optional", latestVersion: "1.2.0" }), true);

console.log("update-prompt.test: ok");
