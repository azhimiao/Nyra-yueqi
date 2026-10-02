/**
 * Memory Pipeline M3 — relationship events from conversation turns.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/MEMORY_PIPELINE");
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
globalThis.localStorage = storage;

const { __setTimelineStorageForTests, clearTimelineForTests, listTimelineEvents } =
  await import("../src/timeline/repository.js");
const { emitRelationshipEventsFromTurn } = await import("../src/timeline/from-conversation.js");
const { projectOpenTimelineCommitments } = await import("../src/context/timeline-projector.js");

__setTimelineStorageForTests(storage);
clearTimelineForTests();

{
  const once = emitRelationshipEventsFromTurn({
    companionId: "c_tl",
    userId: "local",
    userText: "我明天下午答辩，好紧张。",
    assistantText: "结束以后告诉我。",
    sourceTurnId: "turn1",
  });
  record("schedule_event", once.ok && once.events.some((e) => e.eventType === "schedule_commitment"));
  record("followup_promise", once.events.some((e) => e.eventType === "followup_promise"));

  const twice = emitRelationshipEventsFromTurn({
    companionId: "c_tl",
    userId: "local",
    userText: "我明天下午答辩，好紧张。",
    assistantText: "结束以后告诉我。",
    sourceTurnId: "turn1",
  });
  const listed = listTimelineEvents({ companionId: "c_tl", limit: 20 });
  const schedules = listed.filter((e) => e.eventType === "schedule_commitment");
  record("idempotent_no_dup", schedules.length === 1 && twice.ok, `count=${schedules.length}`);
}

{
  const blocks = projectOpenTimelineCommitments({ companionId: "c_tl" });
  record("projector_open_commitments", blocks.length > 0 && /答辩|回访/.test(blocks[0].text));
}

const allPass = cases.every((c) => c.pass);
writeFileSync(join(outDir, "VERIFY_TIMELINE.json"), `${JSON.stringify({ phase: "M3", status: allPass ? "pass" : "fail", cases }, null, 2)}\n`);
console.log(allPass ? "\nM3 TIMELINE ALL PASS" : "\nM3 TIMELINE FAILED");
process.exit(allPass ? 0 : 1);
