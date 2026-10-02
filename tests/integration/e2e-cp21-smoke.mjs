/**
 * CP-21 — Light bridge smoke: app-events emit + companion life-state read.
 */
import {
  __clearAppEventsForTests,
  __setAppEventStorageForTests,
  emitAppEvent,
  listRecentAppEvents,
  selectEventsForCompanion,
} from "../../src/world/app-events.js";
import {
  __clearLifeStateForTests,
  __setLifeStateStorageForTests,
  createEmptyLifeState,
  getLifeState,
  saveLifeState,
} from "../../src/companion/life-state.js";

const failures = [];
function assert(c, m) {
  if (!c) failures.push(m);
}

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, v);
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

console.log("=== CP-21 smoke: app-events ===");
__clearAppEventsForTests();
__setAppEventStorageForTests(makeMemoryStorage());
const emitResult = emitAppEvent("pop.message.sent", { appId: "pop", preview: "e2e-smoke" });
assert(emitResult?.type === "pop.message.sent", "emitAppEvent returns event");
assert(listRecentAppEvents(5).length >= 1, "recent events");
const companionEvents = selectEventsForCompanion(5);
assert(companionEvents.some((e) => e.type === "pop.message.sent"), "companion filter");

console.log("=== CP-21 smoke: life-state ===");
__clearLifeStateForTests();
__setLifeStateStorageForTests(makeMemoryStorage());
const charId = "e2e-char-smoke";
saveLifeState(charId, createEmptyLifeState({ characterId: charId, currentMood: "warm" }));
const life = getLifeState(charId);
assert(life?.characterId === charId, "getLifeState characterId");
assert(life?.currentMood === "warm", "getLifeState mood");

if (failures.length) {
  console.error("e2e-cp21-smoke failed:", failures.join("; "));
  process.exit(1);
}
console.log("e2e-cp21-smoke passed");
