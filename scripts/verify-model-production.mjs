import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/model-production");
mkdirSync(outDir, { recursive: true });
const checks = [];

function check(id, pass, detail = "") {
  checks.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` - ${detail}` : ""}`);
}

function source(path) {
  return readFileSync(join(root, path), "utf8");
}

const storage = {
  data: new Map(),
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; },
  setItem(key, value) { this.data.set(key, String(value)); },
  removeItem(key) { this.data.delete(key); },
  clear() { this.data.clear(); },
};
globalThis.localStorage = storage;
globalThis.window = globalThis;
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
globalThis.dispatchEvent = () => true;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.document = { dispatchEvent() {} };

const runtime = source("src/model/runtime.js");
const client = source("src/model/client.js");
const server = source("server/index.mjs");
const agentStream = source("src/studio-assist/agent/byok-stream.js");
const agentRunner = source("src/studio-assist/agent/runner.js");
const moments = source("src/moments/auto-post.js");
const worldPost = source("src/world/character-world-post.js");
const imageRunner = source("src/imagegen/runner.js");
const debugConsole = source("src/ui/companion-debug-console.js");
const qijian = source("src/qijian/generate.js");

check("runtime_facade_all_capabilities", ["chat(", "vision(", "image(", "stt(", "tts("].every((part) => runtime.includes(part)));
check("single_chat_gateway", client.includes('modelServiceUrl("/model/chat")') && !server.includes("/model/chat-legacy"));
check("production_agent_uses_gateway", agentRunner.includes("createGatewayStreamFn") && !agentRunner.includes("createByokStreamFn"));
check("legacy_direct_adapter_test_only", agentStream.includes("export function createByokStreamFn") && agentStream.includes("export function createGatewayStreamFn"));
check("moments_fail_without_model", !moments.includes("fallbackContent") && moments.includes("return null"));
check("world_post_fail_without_model", worldPost.includes("MODEL_GENERATION_REQUIRED"));
check("qijian_fail_without_model", qijian.includes("PROVIDER_REQUIRED") && !qijian.includes("offlineQijianDraft"));
check("identity_reference_honest_failure", imageRunner.includes("!result.identityReferencesApplied")
  && server.includes("image_references_unavailable") && server.includes("invalid_image_reference")
  && server.includes("identityReferencesApplied: Boolean(referenceBlob)"));
check("debug_console_exposes_model_runtime", debugConsole.includes("Model Runtime") && debugConsole.includes("listModelExecutionTraces"));
const { consumeModelStream } = await import("../src/model/stream-protocol.js");
const fixtureStream = [
  { choices: [{ delta: { content: "fixture" }, finish_reason: "stop" }] },
  { usage: { prompt_tokens: 10, completion_tokens: 4 } },
  { yueqi: { billing: { source: "hosted", chargedCredits: 2, remainingCredits: 98 } } },
].map(value => `data: ${JSON.stringify(value)}\n\n`).join("") + "data: [DONE]\n\n";
const streamResult = await consumeModelStream(new Response(fixtureStream));
check("stream_usage_and_billing_trailer_preserved", streamResult.usage.prompt_tokens === 10
  && streamResult.usage.completion_tokens === 4 && streamResult.execution.billing.chargedCredits === 2
  && streamResult.execution.billing.remainingCredits === 98);
check("gateway_uses_validated_stream_consumer", server.includes("await consumeModelStream(upstream,")
  && server.includes("extractUsageFromSseChunk(chunk)") && server.includes("settleHostedTextReservation({"));

const trace = await import("../src/observability/model-execution-trace.js");
trace.clearModelExecutionTraces();
const modelExecutionId = trace.startModelExecutionTrace({
  turnExecutionId: "turn-verify",
  userId: "user-verify",
  companionId: "companion-verify",
  businessPurpose: "verify.trace",
  capability: "chat",
  providerMode: "byok",
  provider: "test",
  model: "test-model",
  messages: [{ role: "system", content: "secret prompt" }, { role: "user", content: "hello" }],
});
const completed = trace.finishModelExecutionTrace(modelExecutionId, {
  model: "test-model",
  latencyMs: 12,
  usage: { prompt_tokens: 10, completion_tokens: 4 },
  estimatedCost: 0.001,
  billing: { source: "byok", chargedCredits: 0 },
});
check("trace_contract_complete", completed?.success === true
  && completed.inputTokens === 10
  && completed.outputTokens === 4
  && completed.businessPurpose === "verify.trace"
  && completed.turnExecutionId === "turn-verify");
check("trace_does_not_store_prompt", !JSON.stringify(completed).includes("secret prompt"));

const { generateQijianDraft } = await import("../src/qijian/generate.js");
storage.removeItem("yueqi.qijian.v1");
const noProviderQijian = await generateQijianDraft({}, { hasApiKey: false });
check("qijian_no_provider_no_persistence", noProviderQijian.ok === false
  && noProviderQijian.reason === "PROVIDER_REQUIRED"
  && storage.getItem("yueqi.qijian.v1") === null);

const { __setLifeStateStorageForTests, getLifeState, saveLifeState } = await import("../src/companion/life-state.js");
const { __setAutonomyBagForTests, DEFAULT_AUTONOMY } = await import("../src/companion/autonomy-prefs.js");
const { __setActivityLogForTests } = await import("../src/companion/activity-log.js");
const { projectLifePlannerDecision } = await import("../src/companion/life-product-adapter.js");
__setLifeStateStorageForTests(storage);
__setActivityLogForTests([]);
__setAutonomyBagForTests({
  ...DEFAULT_AUTONOMY,
  onboardingComplete: true,
  aiAutonomousLife: true,
  autoDiary: true,
  autoMoments: true,
  proactiveMessage: true,
  quietStart: "00:00",
  quietEnd: "00:00",
  dailyModelBudget: 100,
  dailyProactiveBudget: 100,
  dailyCap: 8,
});

const companionId = "companion-life-verify";
const plannerEvent = {
  id: "life-event-verify",
  status: "pending_projection",
  provenance: { source: "model_life_planner", verifiedAgainstEvidence: true },
};
saveLifeState(companionId, {
  characterId: companionId,
  pendingActions: [{ id: plannerEvent.id, kind: "diary", source: "model_life_planner" }],
});
const lifeResult = {
  state: { characterId: companionId },
  planner: {
    ok: true,
    action: "WRITE_DIARY",
    title: "Reflection",
    summary: "A verified reflection",
    motivation: "recent evidence",
    evidenceRefs: ["memory-1"],
    event: plannerEvent,
  },
};
const projection = await projectLifePlannerDecision(lifeResult, {
  companionId,
  diaryProducer: async () => ({ ok: true, diaryId: "diary-verify" }),
  collectCharacterProfile: () => ({ id: companionId, name: "Nyra" }),
});
const projectedState = getLifeState(companionId);
check("life_projection_commits_after_success", projection.ok === true
  && projectedState.pendingActions.length === 0
  && projectedState.recentLifeEvents[0]?.projection?.diaryId === "diary-verify"
  && projectedState.recentLifeEvents[0]?.status === "completed");

saveLifeState(companionId, {
  ...projectedState,
  pendingActions: [{ id: "life-event-fail", kind: "diary", source: "model_life_planner" }],
});
const failedProjection = await projectLifePlannerDecision({
  ...lifeResult,
  planner: { ...lifeResult.planner, event: { ...plannerEvent, id: "life-event-fail" } },
}, {
  companionId,
  diaryProducer: async () => ({ ok: false, reason: "provider_failed" }),
  collectCharacterProfile: () => ({ id: companionId, name: "Nyra" }),
});
check("life_projection_retains_pending_on_failure", failedProjection.ok === false
  && getLifeState(companionId).pendingActions.some((item) => item.id === "life-event-fail"));

const failed = checks.filter((item) => !item.pass);
const report = {
  generatedAt: new Date().toISOString(),
  status: failed.length ? "FAIL" : "IMPLEMENTATION_GREEN",
  externalModelValidation: "RUN_NPM_SMOKE_MODEL_PRODUCTION",
  checks,
};
writeFileSync(join(outDir, "VERIFY_LATEST.json"), `${JSON.stringify(report, null, 2)}\n`);
assert.equal(failed.length, 0, `${failed.length} model production checks failed`);
console.log("\nMODEL PRODUCTION IMPLEMENTATION GREEN");
