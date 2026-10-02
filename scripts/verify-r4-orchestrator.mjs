import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/R4");
mkdirSync(outDir, { recursive: true });
const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

const storage = (() => {
  const m = new Map();
  return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
  };
})();
globalThis.window = { localStorage: storage, dispatchEvent() {} };

const { routeUserInput, normalizeAgentSessionPolicy } = await import("../src/agent-orchestrator/index.js");
const {
  __setUnifiedTaskStorageForTests,
  clearUnifiedTasksForTests,
  createTask,
  getTask,
} = await import("../src/tasks/unified-task-repo.js");
const { evaluatePolicy, evaluateDirectAction } = await import("../src/policy/engine.js");

__setUnifiedTaskStorageForTests(storage);
clearUnifiedTasksForTests();

const love = routeUserInput({ text: "想你了" });
record("love_chat_no_task", love.route === "companion_chat" && love.createTask === false);

const agent = routeUserInput({ text: "帮我规划", agentId: "agt_life" });
record("agent_route", agent.route === "agent_session");

const multi = routeUserInput({ text: "多步骤", multiStep: true, agentId: "agt_x" });
record("multistep_task_route", multi.route === "unified_task");

const policy = normalizeAgentSessionPolicy({ mode: "shared_session", writeBackCandidates: true });
record("session_policy", policy.mode === "shared_session" && policy.writeBackMode === "candidates");

const a = createTask({ userId: "u1", title: "One", idempotencyKey: "t-1", state: "proposed" });
const b = createTask({ userId: "u1", title: "One again", idempotencyKey: "t-1", state: "proposed" });
record("single_task_record", a.ok && b.ok && b.deduped === true && getTask(a.value.taskId)?.title === "One");

const denied = evaluatePolicy({ capabilityId: "files.write", grantedCapabilities: [] });
record("deny_without_grant", denied.allow === false);

const allowed = evaluatePolicy({
  capabilityId: "files.write",
  grantedCapabilities: ["files.write"],
  approvalState: "approved",
  requiresApproval: true,
});
record("allow_with_grant_approval", allowed.allow === true);

const direct = evaluateDirectAction({ capabilityId: "prefs.read", grantedCapabilities: ["prefs.read"] });
record("direct_action_uses_policy", direct.allow === true);

const runtime = readFileSync(join(root, "src/skill-platform/runtime.js"), "utf8");
record("commit_skill_turn_exists", runtime.includes("export function commitSkillTurn"));

const allPass = cases.every((c) => c.pass);
writeFileSync(join(outDir, "VERIFY_ORCHESTRATOR.json"), `${JSON.stringify({
  phase: "R4",
  status: allPass ? "pass" : "fail",
  cases,
}, null, 2)}\n`);
console.log(allPass ? "\nR4 ALL PASS" : "\nR4 FAILED");
process.exit(allPass ? 0 : 1);
