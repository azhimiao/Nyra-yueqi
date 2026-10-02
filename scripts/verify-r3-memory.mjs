/**
 * R3 — Candidate Ledger + namespace isolation gates.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/R3");
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

const {
  __setCandidateLedgerStorageForTests,
  clearCandidateLedgerForTests,
  submitCandidate,
  promoteCandidateToStable,
  transitionCandidate,
  recallCandidates,
  recallStableMemory,
  forgetUnderstanding,
} = await import("../src/memory/candidate-ledger.js");
const { normalizeContextRequest } = await import("../src/context/contract.js");

__setCandidateLedgerStorageForTests(storage);
clearCandidateLedgerForTests();

{
  const single = submitCandidate({
    userId: "u1",
    companionId: "c1",
    claim: "likes spicy food",
    confidence: 0.9,
    evidenceRefs: ["obs1"],
    source: "observation",
    idempotencyKey: "obs-spicy-1",
  });
  const promo = promoteCandidateToStable(single.value.candidateId);
  record("single_observation_blocked", !promo.ok && promo.reason === "single_observation_blocked", promo.reason);
}

{
  const fiction = submitCandidate({
    userId: "u1",
    companionId: "c1",
    claim: "was a pirate captain",
    confidence: 0.99,
    userStated: true,
    evidenceRefs: ["a", "b"],
    realityNamespace: "shared_fiction",
    source: "experience",
    idempotencyKey: "fiction-1",
  });
  const promo = promoteCandidateToStable(fiction.value.candidateId);
  record("shared_fiction_not_promoted", !promo.ok && promo.reason === "shared_fiction_blocked", promo.reason);
  const realityRecall = recallCandidates({ companionId: "c1", realityNamespace: "reality", includeStatuses: ["pending", "accepted"] });
  record("fiction_not_in_reality_recall", !realityRecall.some((c) => c.idempotencyKey === "fiction-1"));
}

{
  const stated = submitCandidate({
    userId: "u1",
    companionId: "c1",
    claim: "prefers quiet mornings",
    userStated: true,
    confidence: 0.95,
    evidenceRefs: ["user"],
    source: "user_stated",
    idempotencyKey: "quiet-1",
  });
  const promo = promoteCandidateToStable(stated.value.candidateId);
  record("user_stated_promotes", promo.ok, promo.reason || "ok");
  forgetUnderstanding({ companionId: "c1", claimIncludes: "quiet mornings" });
  const after = recallStableMemory({ companionId: "c1", realityNamespace: "reality" });
  const cand = recallCandidates({ companionId: "c1", realityNamespace: "reality", includeStatuses: ["pending", "accepted", "forgotten"] });
  record(
    "forget_removes_from_recall",
    !after.some((m) => String(m.body).includes("quiet"))
      && cand.filter((c) => c.idempotencyKey === "quiet-1").every((c) => c.status === "forgotten"),
  );
}

{
  const corrected = submitCandidate({
    userId: "u1",
    companionId: "c1",
    claim: "hates tea",
    confidence: 0.9,
    evidenceRefs: ["e1", "e2"],
    source: "observation",
    idempotencyKey: "tea-1",
  });
  promoteCandidateToStable(corrected.value.candidateId);
  transitionCandidate(corrected.value.candidateId, "corrected", { claim: "likes tea", counterEvidenceRefs: ["fix"] });
  forgetUnderstanding({ companionId: "c1", claimIncludes: "tea" });
  const stable = recallStableMemory({ companionId: "c1" });
  record("corrected_then_forgotten", !stable.some((m) => /tea/i.test(m.body || "")));
}

{
  const req = normalizeContextRequest({
    purpose: "skill",
    characterId: "c1",
    agentId: "agt_x",
    skillId: "skl_y",
    currentInput: "hello",
  });
  record(
    "context_request_agent_skill_fields",
    req.agentId === "agt_x" && req.skillId === "skl_y" && req.purpose === "skill",
  );
  const scen = normalizeContextRequest({ purpose: "scenario", characterId: "c1", currentInput: "go" });
  record("scenario_defaults_shared_fiction", scen.realityNamespace === "shared_fiction");
}

// Isolation matrix sample (scaled down from 1000 — pattern check)
{
  let leak = 0;
  for (let i = 0; i < 40; i += 1) {
    submitCandidate({
      userId: "u1",
      companionId: `c${i % 4}`,
      claim: `fact-${i}`,
      confidence: 0.9,
      userStated: true,
      evidenceRefs: ["x"],
      source: "iso_test",
      idempotencyKey: `iso-${i}`,
      realityNamespace: i % 5 === 0 ? "shared_fiction" : "reality",
    });
  }
  const forC0 = recallCandidates({ companionId: "c0", realityNamespace: "reality", includeStatuses: ["pending", "accepted"], limit: 100 });
  if (forC0.some((c) => c.companionId !== "c0")) leak += 1;
  if (forC0.some((c) => c.realityNamespace === "shared_fiction")) leak += 1;
  record("isolation_matrix_sample", leak === 0, `leak=${leak} n=${forC0.length}`);
}

const allPass = cases.every((c) => c.pass);
writeFileSync(join(outDir, "VERIFY_MEMORY.json"), `${JSON.stringify({
  phase: "R3-memory",
  generatedAt: new Date().toISOString(),
  status: allPass ? "pass" : "fail",
  cases,
}, null, 2)}\n`);
console.log(allPass ? "\nR3 ALL PASS" : "\nR3 FAILED");
process.exit(allPass ? 0 : 1);
