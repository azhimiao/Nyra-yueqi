/**
 * CP-11 World — unified 栖机 app event bus + registry.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APP_EVENT_TYPES,
  COMPANION_EVENT_TYPES,
  __clearAppEventsForTests,
  __setAppEventStorageForTests,
  emitAppEvent,
  listRecentAppEvents,
  redactAppEventDetail,
  selectEventsForCompanion,
  subscribeAppEvent,
} from "../../src/world/app-events.js";
import {
  PHONE_APP_REGISTRY,
  getAppRegistryEntry,
  listEventCapableApps,
  listLiveApps,
} from "../../src/phone-shell/app-registry.js";

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

console.log("=== CP-11 Event types ===");
assert(APP_EVENT_TYPES.length >= 13, "13+ event types");
for (const t of [
  "pop.message.sent",
  "feed.post.liked",
  "diary.viewed",
  "calendar.event.reached",
  "scenario.event.completed",
]) {
  assert(APP_EVENT_TYPES.includes(t), `type ${t}`);
}

console.log("=== CP-11 Emit / subscribe / ring buffer ===");
__clearAppEventsForTests();
__setAppEventStorageForTests(makeMemoryStorage());
{
  const seen = [];
  const unsub = subscribeAppEvent("pop.message.sent", (evt) => seen.push(evt.type));
  const wildcard = subscribeAppEvent("*", (evt) => seen.push(`*:${evt.type}`));
  emitAppEvent("pop.message.sent", { appId: "pop", preview: "hi" });
  emitAppEvent("gallery.photo.created", { appId: "gallery", photoId: "p1" });
  unsub();
  wildcard();
  assert(seen.includes("pop.message.sent"), "typed handler");
  assert(seen.includes("*:pop.message.sent"), "wildcard handler");
  assert(seen.includes("*:gallery.photo.created"), "wildcard all types");
  assert(listRecentAppEvents(10).length === 2, "ring buffer length");
}

console.log("=== CP-11 Redaction ===");
{
  const redacted = redactAppEventDetail({
    preview: "key sk-abcdefghijklmnopqrstuvwxyz",
    token: "secret-value",
    password: "hunter2",
  });
  assert(String(redacted.preview).includes("[redacted]"), "redact sk- prefix");
  assert(redacted.password === "[redacted]", "redact password key");
  assert(redacted.token === "[redacted]", "redact token key");
}

console.log("=== CP-11 Companion filter ===");
{
  const events = [
    { id: "1", type: "pop.message.sent", at: 1 },
    { id: "2", type: "feed.post.viewed", at: 2 },
    { id: "3", type: "feed.post.liked", at: 3 },
    { id: "4", type: "gallery.photo.created", at: 4 },
    { id: "5", type: "game.session.completed", at: 5 },
    { id: "6", type: "scenario.event.completed", at: 6 },
  ];
  const picked = selectEventsForCompanion(events);
  assert(!picked.some((e) => e.type === "feed.post.viewed"), "drop feed view noise");
  assert(!picked.some((e) => e.type === "gallery.photo.created"), "drop gallery noise");
  assert(!picked.some((e) => e.type === "game.session.completed"), "drop game noise");
  assert(picked.some((e) => e.type === "scenario.event.completed"), "keep scenario");
  assert(picked.some((e) => e.type === "feed.post.liked"), "keep feed like");
  assert(COMPANION_EVENT_TYPES.every((t) => typeof t === "string"), "companion types frozen");
}

console.log("=== CP-11 App registry ===");
{
  const pop = getAppRegistryEntry("pop");
  assert(pop.status === "live" && pop.hasUi && pop.hasStore && pop.hasEvents, "pop live + events");
  const lab = getAppRegistryEntry("lab");
  assert(lab.status === "minimal", "lab minimal");
  const closed = getAppRegistryEntry("sidewrite");
  assert(closed.status === "closed", "removed app closed");
  assert(listLiveApps().length >= 10, "live apps listed");
  assert(listEventCapableApps().some((a) => a.id === "explore"), "explore has events");
  assert(PHONE_APP_REGISTRY.every((a) => "status" in a && "hasUi" in a), "registry enriched");
}

console.log("=== CP-11 Source wiring ===");
{
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const phone = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
  const lifeWake = readFileSync(join(root, "src/companion/life-wake.js"), "utf8");
  const scheduler = readFileSync(join(root, "src/proactive/scheduler.js"), "utf8");
  const explore = readFileSync(join(root, "src/skill-platform/ui/explore-ui.js"), "utf8");
  const assist = readFileSync(join(root, "src/studio-assist/chat-store.js"), "utf8");
  const diary = readFileSync(join(root, "src/diary/records.js"), "utf8");
  const scenario = readFileSync(join(root, "src/scenario/runtime/persistence.js"), "utf8");
  const games = readFileSync(join(root, "src/games/lobby-ui.js"), "utf8");
  assert(phone.includes('emitPhoneAppEvent("pop.message.sent"'), "phone pop send");
  assert(phone.includes('emitPhoneAppEvent("feed.post.liked"'), "phone feed like");
  assert(phone.includes('emitPhoneAppEvent("diary.viewed"'), "phone diary view");
  assert(phone.includes("emitAppEvent"), "phone uses app event bus");
  assert(lifeWake.includes("subscribeAppEvent"), "life wake subscribes app events");
  assert(lifeWake.includes("APP_EVENT_WAKE_SOURCES"), "filtered wake map");
  assert(scheduler.includes('emitAppEvent("calendar.event.reached"'), "scheduler calendar emit");
  assert(explore.includes('emitAppEvent("explore.task.completed"'), "explore task emit");
  assert(assist.includes('emitAppEvent("assist.task.completed"'), "assist task emit");
  assert(diary.includes('emitAppEvent("diary.created"'), "diary create emit");
  assert(scenario.includes('emitAppEvent("scenario.event.completed"'), "scenario finale emit");
  assert(games.includes("onSessionCompleted"), "games session callback");
}

if (failures.length) {
  console.error("FAILED", failures);
  process.exit(1);
}
console.log("CP-11 world verify PASSED");
