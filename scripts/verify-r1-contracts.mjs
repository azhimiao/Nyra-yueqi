/**
 * R1 contract gate — schemas + ownership docs must exist and validate.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mintId,
  isIdShape,
  createTimelineEventV1,
  validateTimelineEventV1,
  createUnderstandingCandidateV1,
  validateUnderstandingCandidateV1,
  createStableMemoryV1,
  validateStableMemoryV1,
  createUnifiedTaskV1,
  validateUnifiedTaskV1,
  createCapabilityV1,
  validateCapabilityV1,
  createGrantV1,
  validateGrantV1,
  createApprovalV1,
  validateApprovalV1,
  createAuditV1,
  validateAuditV1,
  createPackageManifestV1,
  validatePackageManifestV1,
  createModelRequestContractV1,
  validateModelRequestContractV1,
  FORBIDDEN_NEW_LOCALSTORAGE_AUTHORITIES,
} from "../src/contracts/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/R1");
mkdirSync(outDir, { recursive: true });

const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

function mustExist(rel) {
  const ok = existsSync(join(root, rel));
  record(`doc_${rel.replace(/[\\/]/g, "_")}`, ok, ok ? "present" : "missing");
  return ok;
}

mustExist("docs/architecture/adr/001-companion-agent-skill-experience-openclaw.md");
mustExist("docs/architecture/DATA_OWNERSHIP_MATRIX.md");

const userId = mintId("userId", "demo");
const companionId = mintId("companionId", "demo");
record("id_shapes", isIdShape("userId", userId) && isIdShape("companionId", companionId), `${userId} ${companionId}`);

{
  const ev = createTimelineEventV1({
    eventId: mintId("eventId"),
    eventType: "shared.moment",
    source: "r1-verify",
    idempotencyKey: "r1-evt-1",
    actor: "user",
    principal: userId,
    companionId,
    userId,
    realityNamespace: "reality",
  });
  const v = validateTimelineEventV1(ev);
  record("timeline_event_v1", v.ok, v.errors.join(",") || "ok");
}

{
  const c = createUnderstandingCandidateV1({
    candidateId: mintId("eventId", "cand"),
    userId,
    companionId,
    claim: "likes quiet mornings",
    source: "user_stated",
    userStated: true,
    confidence: 0.9,
    idempotencyKey: "cand-1",
  });
  const v = validateUnderstandingCandidateV1(c);
  record("understanding_candidate_v1", v.ok, v.errors.join(",") || "ok");
}

{
  const m = createStableMemoryV1({
    memoryId: mintId("eventId", "mem"),
    userId,
    companionId,
    body: "Prefers quiet mornings",
    source: "promotion",
    idempotencyKey: "mem-1",
  });
  const v = validateStableMemoryV1(m);
  record("stable_memory_v1", v.ok, v.errors.join(",") || "ok");
}

{
  const t = createUnifiedTaskV1({
    taskId: mintId("taskId"),
    userId,
    title: "Draft calendar note",
    state: "proposed",
    idempotencyKey: "task-1",
  });
  const v = validateUnifiedTaskV1(t);
  record("unified_task_v1", v.ok, v.errors.join(",") || "ok");
}

{
  const cap = createCapabilityV1({
    capabilityId: "calendar.write",
    operation: "calendar.create_draft",
    riskClass: "medium",
    requiresApproval: true,
    writeClass: "user_data",
  });
  const grant = createGrantV1({
    grantId: mintId("grantId"),
    userId,
    capabilityId: cap.capabilityId,
    scope: "calendar",
    principal: userId,
  });
  const approval = createApprovalV1({
    approvalId: mintId("approvalId"),
    userId,
    capabilityId: cap.capabilityId,
    taskId: mintId("taskId"),
    state: "pending",
  });
  const audit = createAuditV1({
    auditId: mintId("eventId", "aud"),
    operationId: "calendar.create_draft",
    principal: userId,
    userId,
  });
  record("capability_v1", validateCapabilityV1(cap).ok);
  record("grant_v1", validateGrantV1(grant).ok);
  record("approval_v1", validateApprovalV1(approval).ok);
  record("audit_v1", validateAuditV1(audit).ok);
}

{
  const pkg = createPackageManifestV1({
    packageId: mintId("packageId"),
    packageType: "skill",
    name: "Relationship Intelligence",
    version: "1.0.0",
    contentHash: "sha256:demo",
    requestedCapabilities: ["memory.read"],
  });
  record("package_manifest_v1", validatePackageManifestV1(pkg).ok);
}

{
  const req = createModelRequestContractV1({
    requestId: mintId("requestId"),
    idempotencyKey: "model-1",
    billingSource: "byok",
    operation: "chat",
    userId,
    companionId,
    messages: [{ role: "user", content: "hi" }],
  });
  const v = validateModelRequestContractV1(req);
  record("model_provider_contract_v1", v.ok && req.chargedCredits === 0, v.errors.join(",") || "byok_zero_charge");
}

record(
  "forbidden_localstorage_authority_notice",
  Array.isArray(FORBIDDEN_NEW_LOCALSTORAGE_AUTHORITIES)
    && FORBIDDEN_NEW_LOCALSTORAGE_AUTHORITIES.length >= 1,
);

const matrix = readFileSync(join(root, "docs/architecture/DATA_OWNERSHIP_MATRIX.md"), "utf8");
record(
  "ownership_matrix_covers_core",
  ["Conversation V2", "Relationship Timeline", "Unified Task", "Billing Account", "NyraCoin"]
    .every((needle) => matrix.includes(needle)),
);

const allPass = cases.every((c) => c.pass);
const payload = {
  phase: "R1-contracts",
  generatedAt: new Date().toISOString(),
  status: allPass ? "pass" : "fail",
  command: "npm run verify:r1-contracts",
  cases,
  summary: {
    total: cases.length,
    passed: cases.filter((c) => c.pass).length,
    failed: cases.filter((c) => !c.pass).length,
  },
};
writeFileSync(join(outDir, "VERIFY_CONTRACTS.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(allPass ? "\nR1 CONTRACTS ALL PASS" : "\nR1 CONTRACTS FAILED");
process.exit(allPass ? 0 : 1);
