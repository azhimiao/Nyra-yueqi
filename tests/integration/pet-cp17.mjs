/**
 * CP-17 — Desktop pet presence unified with companion life-state.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  __clearLifeStateForTests,
  __setLifeStateStorageForTests,
  getLifeState,
  saveLifeState,
} from "../../src/companion/life-state.js";
import {
  COMPANION_LIFE_EVENT,
  buildCatalogPetOverlayState,
  derivePetPresenceFromLifeState,
  mergePetPresenceIntoState,
  resolvePetSpritePack,
  LIFE_MOOD_TO_EMOTION,
  LIFE_MOOD_TO_IDLE_ACTION,
} from "../../src/companion/pet-presence-bridge.js";
import { runCompanionLifeTick } from "../../src/companion/life-tick.js";
import {
  readBrowserPetEnabled,
  writeBrowserPetEnabled,
} from "../../src/ui/pet-visibility-pref.js";

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

const baseNow = Date.parse("2026-07-30T14:00:00.000Z");
const charId = "pop-char-1";

console.log("=== CP-17 Mood → presence mapping ===");
__clearLifeStateForTests();
__setLifeStateStorageForTests(makeMemoryStorage());
saveLifeState(charId, { characterId: charId, currentMood: "playful" });
{
  const p = derivePetPresenceFromLifeState(charId, { playState: "idle" });
  assert(p.emotion === LIFE_MOOD_TO_EMOTION.playful, "playful → happy emotion");
  assert(p.actionId === LIFE_MOOD_TO_IDLE_ACTION.playful, "playful → greet idle");
  assert(p.presenceLabel.includes("心情"), "playful status label");
}

saveLifeState(charId, { characterId: charId, currentMood: "tired" });
{
  const p = derivePetPresenceFromLifeState(charId, { playState: "idle" });
  assert(p.asleep === true, "tired → asleep when idle");
  assert(p.actionId === "sleep_pose", "tired → sleep_pose");
}

console.log("=== CP-17 Life tick mood change updates presence ===");
saveLifeState(charId, { characterId: charId, currentMood: "calm", lastTickAt: baseNow - 8 * 3600000 });
{
  const tick = runCompanionLifeTick({
    characterId: charId,
    source: "open_app",
    now: baseNow,
    force: true,
    isFeatureEnabled: () => true,
    isWithinDnd: () => false,
  });
  assert(tick.ok && !tick.skipped, "life tick runs");
  assert(tick.moodShift?.to && tick.moodShift.to !== "calm", "mood advanced from offline");
  const after = derivePetPresenceFromLifeState(charId, { playState: "idle" });
  assert(after.currentMood === getLifeState(charId).currentMood, "presence reads saved life mood");
  assert(after.currentMood === tick.state.currentMood, "presence matches tick state");
}

console.log("=== CP-17 Active chat playback wins over idle mood pose ===");
saveLifeState(charId, { characterId: charId, currentMood: "pensive" });
{
  const merged = mergePetPresenceIntoState(
    { playState: "talking", actionId: "talking_default", emotion: "warm" },
    derivePetPresenceFromLifeState(charId, { playState: "idle" }),
  );
  assert(merged.playState === "talking", "keep talking playState");
  assert(merged.actionId === "talking_default", "keep talking action");
  assert(merged.emotion === "warm", "keep runtime emotion during chat");
}

console.log("=== CP-17 No dual pet mood store ===");
{
  const overlay = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../src/overlay/overlay-app.js"),
    "utf8",
  );
  const bridge = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../src/companion/pet-presence-bridge.js"),
    "utf8",
  );
  assert(!overlay.includes("petMood"), "overlay has no petMood key");
  assert(!overlay.includes("overlayMood"), "overlay has no overlayMood key");
  assert(bridge.includes("getLifeState"), "bridge reads life-state only");
  assert(!bridge.includes("localStorage.setItem"), "bridge does not persist separate mood");
  assert(!overlay.includes("mountBoyCharacter"), "overlay does not mount boy skeleton");
}

console.log("=== CP-17 Catalog overlay state stays lightweight ===");
{
  const state = await buildCatalogPetOverlayState({
    companionRuntime: { getState: () => ({ characterName: "测试", playState: "idle" }) },
    getActiveCharacterId: () => charId,
    getAvatarState: () => ({}),
    getCurrentLook: () => ({ name: "ignored" }),
    getActionPlayer: () => null,
  });
  assert(state.lookDataUrl === "", "no wardrobe look blob");
  assert(state.actionDataUrl === "", "no wardrobe action blob");
  assert(state.spritePack === "bubble", "defaults to bubble catalog pack");
}

console.log("=== CP-17 Character package identity ===");
{
  assert(resolvePetSpritePack({ lookDataUrl: "data:image/png;base64,abc" }) === "bubble", "character look never overrides catalog pet");
  assert(resolvePetSpritePack({}) === "bubble", "default pack when no custom media");
  assert(resolvePetSpritePack({ petId: "yueqi-male" }) === "yueqi-male", "selected pet pack wins");
  assert(resolvePetSpritePack({ petId: "bubble" }) === "bubble", "bubble pet is not swapped for a sprite");
  assert(resolvePetSpritePack({ petId: "xingli" }) === "xingli", "xingli remains a selectable sprite pack");
}

console.log("=== CP-17 Pet visibility is user-initiated ===");
{
  const storage = makeMemoryStorage();
  assert(readBrowserPetEnabled(storage) === false, "fresh install keeps pet hidden");
  writeBrowserPetEnabled(true, storage);
  assert(readBrowserPetEnabled(storage) === true, "manual open persists");
  writeBrowserPetEnabled(false, storage);
  assert(readBrowserPetEnabled(storage) === false, "manual close persists");
}

console.log("=== CP-17 Wire + short chat path ===");
{
  const desktopWire = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../src/ui/desktop-presence-wire.js"),
    "utf8",
  );
  const appJs = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../src/app.js"),
    "utf8",
  );
  const overlay = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../src/overlay/overlay-app.js"),
    "utf8",
  );
  assert(desktopWire.includes("buildCatalogPetOverlayState"), "desktop wire uses bridge");
  assert(
    desktopWire.includes(COMPANION_LIFE_EVENT) || desktopWire.includes("COMPANION_LIFE_EVENT"),
    "desktop listens for life changes",
  );
  assert(appJs.includes("bindPetPresenceBridge"), "app binds pet presence bridge");
  assert(appJs.includes("submitExternalTurn"), "pet turns use Pop submit path");
  assert(!overlay.includes("OpenClaw"), "overlay does not invoke OpenClaw");
  assert(overlay.includes("sendTurn") && overlay.includes("sendTurn(payload)"), "overlay quick chat sendTurn");
}

console.log("");
if (failures.length) {
  console.error(`CP-17 pet presence: ${failures.length} failure(s)`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("CP-17 pet presence: all checks passed");
