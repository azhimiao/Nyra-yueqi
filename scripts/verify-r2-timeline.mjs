/**
 * R2 gates — Conversation first-write contract + Timeline idempotency.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/R2");
mkdirSync(outDir, { recursive: true });

const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

const storage = (() => {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
})();
globalThis.window = { localStorage: storage, dispatchEvent() {} };
globalThis.document = { dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
};

const {
  __setTimelineStorageForTests,
  appendTimelineEvent,
  getTimelineEvent,
  clearTimelineForTests,
} = await import("../src/timeline/index.js");
const {
  __setCohabitStorageForTests,
  appendCohabitEvent,
} = await import("../src/memory/cohabit-timeline.js");

__setTimelineStorageForTests(storage);
__setCohabitStorageForTests(storage);
clearTimelineForTests();

{
  const a = appendTimelineEvent({
    eventId: "evt_test_1",
    eventType: "test.ping",
    source: "r2-verify",
    idempotencyKey: "r2-idem-1",
    actor: "user",
    principal: "usr_x",
    companionId: "cmp_x",
    userId: "usr_x",
    realityNamespace: "reality",
    payload: { n: 1 },
  });
  const b = appendTimelineEvent({
    eventId: "evt_test_2",
    eventType: "test.ping",
    source: "r2-verify",
    idempotencyKey: "r2-idem-1",
    actor: "user",
    principal: "usr_x",
    companionId: "cmp_x",
    userId: "usr_x",
    realityNamespace: "reality",
    payload: { n: 2 },
  });
  const found = getTimelineEvent({ idempotencyKey: "r2-idem-1" });
  record(
    "timeline_idempotent_append",
    a.ok && b.ok && b.replaced === true && found?.revision === 2 && found?.payload?.n === 2,
    `rev=${found?.revision} n=${found?.payload?.n}`,
  );
}

{
  const event = appendCohabitEvent({
    appId: "listen",
    kind: "play",
    summary: "Played a track",
    characterId: "cmp_x",
    idempotencyKey: "listen::play::cmp_x::track1",
    meta: { trackId: "track1" },
  });
  const canonical = getTimelineEvent({ idempotencyKey: "listen::play::cmp_x::track1" });
  record(
    "cohabit_dual_writes_timeline",
    Boolean(event?.sourceEventId) && canonical?.eventId === event.sourceEventId,
    `sourceEventId=${event?.sourceEventId || ""}`,
  );
}

{
  const chat = readFileSync(join(root, "src/panels/chat.js"), "utf8");
  const userBlock = chat.includes("authoritative user write failed — refusing IDB-only success");
  const asstBlock = chat.includes("authoritative assistant write failed — refusing IDB-only success");
  // M0+/M6: Pop uses writeCompanionTurn / writePopTurn (V2-first shared gate), not IDB-first.
  const usesCompanionWrite = chat.includes("writeCompanionTurn") || chat.includes("writePopTurn");
  const orderHint = usesCompanionWrite
    || (
      chat.indexOf("mirrorToConversation(\"user\"") >= 0
      && chat.indexOf("mirrorToConversation(\"user\"") < chat.indexOf("savedUserMessage = await saveChatMessage")
    );
  record("chat_v2_first_write_order", userBlock && asstBlock && orderHint, `user=${userBlock} asst=${asstBlock} order=${orderHint}`);
}

{
  const bridge = readFileSync(join(root, "src/conversation/bridge-chat.js"), "utf8");
  record("bridge_no_premature_mirrored_flag", !bridge.includes("mirroredToChat: true"));
}

const allPass = cases.every((c) => c.pass);
const payload = {
  phase: "R2-conversation-timeline",
  generatedAt: new Date().toISOString(),
  status: allPass ? "pass" : "fail",
  command: "npm run verify:r2-timeline",
  cases,
};
writeFileSync(join(outDir, "VERIFY_TIMELINE.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(allPass ? "\nR2 ALL PASS" : "\nR2 FAILED");
process.exit(allPass ? 0 : 1);
