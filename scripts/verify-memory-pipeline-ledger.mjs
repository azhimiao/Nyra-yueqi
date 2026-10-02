/**
 * Memory Pipeline M2 — extraction routes through candidate-ledger.
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

const {
  __setCandidateLedgerStorageForTests,
  clearCandidateLedgerForTests,
  recallCandidates,
  recallStableMemory,
} = await import("../src/memory/candidate-ledger.js");
const { applyMemoryOperations, extractAndApplyMemoryOperations } =
  await import("../src/context/extraction.js");

__setCandidateLedgerStorageForTests(storage);
clearCandidateLedgerForTests();

{
  const inferred = applyMemoryOperations([{
    op: "ADD",
    content: "用户可能睡眠不足",
    kind: "semantic",
    confidence: 0.7,
    evidenceSpan: "最近好累",
    inferred: true,
  }], {
    characterId: "c_ledger",
    userEvidenceRef: "u1",
    assistantEvidenceRef: "a1",
    userText: "最近好累",
  });
  const pending = recallCandidates({ companionId: "c_ledger", includeStatuses: ["pending"] });
  const stable = recallStableMemory({ companionId: "c_ledger" });
  record("inferred_goes_to_candidates", inferred.ok && pending.some((c) => c.claim.includes("睡眠")));
  record("inferred_not_auto_stable", !stable.some((m) => String(m.body || "").includes("睡眠")));
}

{
  clearCandidateLedgerForTests();
  const stated = applyMemoryOperations([{
    op: "ADD",
    content: "不喜欢空洞鼓励",
    kind: "preference",
    confidence: 0.9,
    evidenceSpan: "不要再说你一定可以",
    inferred: false,
  }], {
    characterId: "c_ledger",
    userEvidenceRef: "u2",
    assistantEvidenceRef: "a2",
    userText: "不要再说你一定可以",
  });
  const stable = recallStableMemory({ companionId: "c_ledger" });
  // The authoritative memory preserves the user's actual boundary; the model's
  // broader paraphrase ("空洞鼓励") has no direct evidence and is not promoted.
  record("user_stated_promotes", stated.ok && stable.some((m) => m.body === "不要再说你一定可以"));
}

{
  clearCandidateLedgerForTests();
  const fiction = await extractAndApplyMemoryOperations({
    characterId: "c_ledger",
    userText: "在故事里我是海盗船长",
    assistantText: "好的船长",
    userEvidenceRef: "u3",
    realityNamespace: "shared_fiction",
  });
  // Deterministic path may submit with realityNamespace from input
  const realityStable = recallStableMemory({ companionId: "c_ledger", realityNamespace: "reality" });
  record("extract_ok", fiction.ok !== false);
  record("no_fiction_in_reality_stable_forced", !realityStable.some((m) => String(m.body || "").includes("海盗")));
}

const allPass = cases.every((c) => c.pass);
writeFileSync(join(outDir, "VERIFY_LEDGER.json"), `${JSON.stringify({ phase: "M2", status: allPass ? "pass" : "fail", cases }, null, 2)}\n`);
console.log(allPass ? "\nM2 LEDGER ALL PASS" : "\nM2 LEDGER FAILED");
process.exit(allPass ? 0 : 1);
