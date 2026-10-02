/**
 * Memory Pipeline M4 — orchestrator routing + OpenClaw writeback.
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

const { routeUserInput } = await import("../src/agent-orchestrator/index.js");
const { __setConversationStorageForTests, clearAllConversations, getSession, selectVisibleHistory } =
  await import("../src/conversation/index.js");
const { __setTimelineStorageForTests, clearTimelineForTests, listTimelineEvents } =
  await import("../src/timeline/repository.js");
const { writeOpenClawResultToCompanionHistory } =
  await import("../src/integrations/openclaw-mobile/writeback.js");

__setConversationStorageForTests(storage);
__setTimelineStorageForTests(storage);
clearAllConversations();
clearTimelineForTests();

record("love_chat_route", routeUserInput({ text: "你还记得我明天要答辩吗？" }).route === "companion_chat");
record("tool_task_route", routeUserInput({ text: "帮我检查这个角色包，把冲突的人设找出来" }).route === "unified_task");

{
  const idb = [];
  const wb = await writeOpenClawResultToCompanionHistory({
    companionId: "c_claw",
    chatSessionId: "dm:c_claw",
    taskId: "task_1",
    summary: "我们一起整理完了答辩材料",
    saveChatMessage: async (m) => { idb.push(m); return m; },
  });
  const session = getSession(wb.conversation?.conversationSessionId);
  const history = session ? selectVisibleHistory(session) : [];
  record("openclaw_writeback_v2", wb.ok && history.some((t) => String(t.text || t.content || "").includes("答辩材料")));
  record("openclaw_timeline", listTimelineEvents({ companionId: "c_claw" }).some((e) => e.eventType === "shared_task_completed"));
}

const allPass = cases.every((c) => c.pass);
writeFileSync(join(outDir, "VERIFY_ORCH.json"), `${JSON.stringify({ phase: "M4", status: allPass ? "pass" : "fail", cases }, null, 2)}\n`);
console.log(allPass ? "\nM4 ORCH ALL PASS" : "\nM4 ORCH FAILED");
process.exit(allPass ? 0 : 1);
