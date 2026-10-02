/**
 * CP-19 — Threat-oriented security regression (defensive assertions only).
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { scrubExportPayload, assertNoSecretsInExport } from "../../src/memory/privacy.js";
import {
  redactSecrets,
  formatUserError,
  safeUserFacingText,
} from "../../src/onboarding/errors.js";
import { checkPermission } from "../../src/skills/permissions.js";
import { createSandbox, isSurfaceBlocked, SANDBOX_DEFAULT_DENY } from "../../src/skills/sandbox.js";
import { validateInstallGrants } from "../../src/skill-platform/grants.js";
import { escapeHtml } from "../../src/lib/utils.js";
import { violatesContentGuardrails } from "../../src/companion/life-state.js";
import {
  createTaskDraft,
  proposeTask,
  runTask,
  approveAndContinue,
} from "../../src/agent/executor.js";
import {
  __setAgentStorageForTests,
  clearAllAgentTasks,
  getTask,
} from "../../src/agent/task-store.js";
import { registerBuiltinCapabilities } from "../../src/agent/capabilities/index.js";
import { __resetIdSeqForTests } from "../../src/agent/schema.js";

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

const storage = makeMemoryStorage();
globalThis.window = { localStorage: storage };
__setAgentStorageForTests(storage);
__resetIdSeqForTests();
registerBuiltinCapabilities();
clearAllAgentTasks();

console.log("=== CP-19 Secrets — backup scrub ===");
{
  const raw = {
    profile: { name: "u", provider: { apiKey: "sk-live-never-export-abc123456789" } },
    ecosystem: { token: "secret-ecosystem-token-xyz" },
    settings: { voice: { ttsApiKey: "sk-voice-never", sttApiKey: "sk-stt-never" } },
    gatePrefs: { gateSessionToken: "live-gate-session-token" },
    nested: { note: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig" },
  };
  const scrubbed = scrubExportPayload(raw);
  assert(!scrubbed.profile?.provider, "provider stripped");
  assert(scrubbed.ecosystem?.token === "", "ecosystem token cleared");
  assert(!scrubbed.settings?.voice?.ttsApiKey, "tts key stripped");
  assert(scrubbed.gatePrefs?.gateSessionToken === "[redacted]", "gate token redacted");
  assert(scrubbed.nested?.note === "[redacted]", "bearer pattern redacted in values");
  try {
    assertNoSecretsInExport(scrubbed);
    assert(true, "assertNoSecretsInExport");
  } catch (error) {
    assert(false, `export secrets: ${error.message}`);
  }
}

console.log("=== CP-19 Secrets — user-facing errors ===");
{
  const leak = "OpenAI failed sk-prod-key-abcdefghijklmnop\n    at Module.call (/src/x.js:12:3)";
  const safe = redactSecrets(leak);
  assert(!safe.includes("sk-prod"), "redactSecrets strips api key");
  assert(!safe.includes("Module.call"), "stack stripped");
  const toast = safeUserFacingText(leak);
  assert(!toast.includes("sk-prod"), "safeUserFacingText strips api key");
  const formatted = formatUserError({ message: "network_fail with sk-secret-key-1234567890" });
  assert(!formatted.includes("sk-secret"), "formatUserError redacts free-form message");
}

console.log("=== CP-19 Skill default-deny ===");
{
  assert(SANDBOX_DEFAULT_DENY.includes("network"), "network default deny");
  assert(SANDBOX_DEFAULT_DENY.includes("file"), "file default deny");

  const undeclared = checkPermission(
    { skillId: "demo", declared: ["network"], granted: ["network"] },
    "file",
  );
  assert(undeclared.ok === false && undeclared.reason === "undeclared_permission", "undeclared permission");

  const ungranted = checkPermission(
    { skillId: "demo", declared: ["file"], granted: [] },
    "file",
  );
  assert(ungranted.ok === false && ungranted.reason === "permission_denied", "ungranted permission");

  const unknown = checkPermission({ skillId: "demo", declared: [], granted: [] }, "not-a-perm");
  assert(unknown.ok === false && unknown.reason === "unknown_permission", "unknown permission");

  const sandbox = createSandbox({
    skillId: "demo",
    manifestRisk: "low",
    declaredPermissions: ["network"],
    grantedPermissions: [],
  });
  assert(isSurfaceBlocked(sandbox, "network"), "sandbox blocks network without grant");
  assert(isSurfaceBlocked(sandbox, "file"), "sandbox blocks file without declare+grant");
}

console.log("=== CP-19 Install partial grants ===");
{
  const manifest = { requestedCapabilities: ["structured-notes", "calendar-draft"] };
  const none = validateInstallGrants(manifest, []);
  assert(none.ok === false && none.reason === "grants_required", "empty grants rejected");

  const partial = validateInstallGrants(manifest, ["structured-notes"]);
  assert(partial.ok === false && partial.reason === "grants_required", "partial grants rejected");
  assert(partial.missing?.includes("calendar-draft"), "missing capability listed");

  const undeclaredGrant = validateInstallGrants(manifest, ["structured-notes", "calendar-draft", "local-files"]);
  assert(undeclaredGrant.ok === false && undeclaredGrant.reason === "undeclared_grant", "undeclared grant rejected");

  const full = validateInstallGrants(manifest, ["structured-notes", "calendar-draft"]);
  assert(full.ok === true, "full grants accepted");
}

console.log("=== CP-19 XSS escape helper ===");
{
  const payload = `"><img src=x onerror="alert(1)">'&`;
  const encoded = escapeHtml(payload);
  const simulated = `<p>${encoded}</p>`;
  assert(!simulated.includes("<img"), "escapeHtml blocks tag injection");
  assert(!simulated.includes(payload), "raw payload not present");
  assert(encoded.includes("&lt;img") && encoded.includes("&quot;"), "entities encoded");
}

console.log("=== CP-19 Agent approval gate ===");
{
  clearAllAgentTasks();
  const draft = createTaskDraft({
    capabilityId: "structured-notes",
    characterId: "char-cp19",
    title: "CP-19 approval test",
    input: { text: "整理这条测试笔记内容，至少十个字以上。" },
    idempotentKey: "cp19-approval-gate",
    risk: "R2",
  });
  assert(draft.ok, `draft created (${draft.reason || ""})`);
  const taskId = draft.value.id;

  const proposed = proposeTask(taskId);
  assert(proposed.ok, "task proposed");

  const blocked = await runTask(taskId);
  assert(blocked.awaitingApproval === true, "R2 stops for approval");
  assert(getTask(taskId)?.state === "awaiting_approval", "state awaiting_approval");

  const retry = await runTask(taskId);
  assert(retry.reason === "awaiting_approval", "run without approved flag blocked");

  const pendingApproval = (getTask(taskId)?.approvals || []).find((a) => a.decision === "pending");
  assert(pendingApproval?.id, "pending approval exists");

  const continued = await approveAndContinue(taskId, pendingApproval.id);
  const finalState = getTask(taskId)?.state;
  assert(
    continued.ok || finalState === "completed" || finalState === "failed",
    `approved run proceeds (${finalState || continued.reason || ""})`,
  );
}

console.log("=== CP-19 Proactive content guardrails ===");
{
  assert(violatesContentGuardrails("你不理我就永远后悔"), "block emotional blackmail");
  assert(violatesContentGuardrails("快来救我出事了"), "block fake emergency");
  assert(!violatesContentGuardrails("好久不见，回来就好"), "allow gentle copy");
}

console.log("=== CP-19 High-risk sink wiring ===");
{
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const phoneShell = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
  const explore = readFileSync(join(root, "src/skill-platform/ui/explore-ui.js"), "utf8");
  const session = readFileSync(join(root, "src/skill-platform/ui/skill-session-ui.js"), "utf8");
  const popPlugins = readFileSync(join(root, "src/phone-shell/pop-chat-plugins.js"), "utf8");

  assert(phoneShell.includes("escapeHtml(String(msg || \"\"))"), "phone toast action path escapes msg");
  assert(explore.includes("safeUserFacingText"), "explore errors use safeUserFacingText");
  assert(session.includes("safeUserFacingText"), "skill session errors use safeUserFacingText");
  assert(popPlugins.includes("safeUserFacingText"), "pop plugin errors use safeUserFacingText");
  assert(explore.includes("escapeHtml("), "explore market rows escaped");
}

if (failures.length) {
  console.error("\nCP-19 security integration FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("\nCP-19 security integration PASSED");
