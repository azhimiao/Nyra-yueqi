#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  createCapabilityOperationV2,
  createCharacterImportReportV1,
  createCharacterProfileV2,
  createPreparedModelRequestV1,
  createToolRunV1,
  createTurnExecutionSnapshotV1,
  createUserCompanionPreferenceV2,
  isExplicit,
  migrateLegacyCharacterToProfileV2,
  transitionToolRun,
  validateCapabilityOperationV2,
  validateCharacterImportReportV1,
  validateCharacterProfileV2,
  validatePreparedModelRequestV1,
  validateToolRunV1,
  validateTurnExecutionSnapshotV1,
  validateUserCompanionPreferenceV2,
  assertSnapshotReferences,
} from "../src/contracts/index.js";

let passCount = 0;
function pass(name, fn) {
  fn();
  passCount += 1;
  console.log(`PASS ${name}`);
}
function has(result, code, path) {
  return result.errors.some((error) => error.code === code && (!path || error.path === path));
}
function rejects(validator, value, code, path) {
  const result = validator(value);
  assert.equal(result.ok, false);
  assert.equal(has(result, code, path), true, JSON.stringify(result.errors));
}
function checkCommon(name, create, validate) {
  const valid = create();
  pass(`${name}: minimal create validates`, () => assert.equal(validate(valid).ok, true));
  pass(`${name}: missing required field`, () => {
    const raw = { ...valid };
    delete raw.revision;
    rejects(validate, raw, "missing_field", "revision");
  });
  pass(`${name}: unknown top-level field`, () =>
    rejects(validate, { ...valid, surprise: true }, "unknown_field", "surprise"));
  pass(`${name}: schema version is immutable`, () =>
    rejects(validate, { ...valid, schemaVersion: 999 }, "invalid_schema_version", "schemaVersion"));
  for (const revision of [0, -1, 1.5]) {
    pass(`${name}: rejects revision ${revision}`, () =>
      rejects(validate, { ...valid, revision }, "invalid_revision", "revision"));
  }
  return valid;
}

const character = checkCommon(
  "CharacterProfileV2",
  () => createCharacterProfileV2({ name: "月栖" }),
  validateCharacterProfileV2,
);
pass("CharacterProfileV2: fills documented defaults", () => {
  assert.deepEqual(character.exampleDialogue, []);
  assert.equal(character.provenance.source, "user");
});
pass("CharacterProfileV2: forbidden private user field", () =>
  rejects(validateCharacterProfileV2, { ...character, userId: "legacy-user" }, "forbidden_field", "userId"));
pass("CharacterProfileV2: oversized field", () => {
  const raw = structuredClone(character);
  raw.name = "x".repeat(201);
  rejects(validateCharacterProfileV2, raw, "oversized_field", "name");
});
pass("CharacterProfileV2: too many items", () => {
  const raw = structuredClone(character);
  raw.tags = Array(65).fill("tag");
  rejects(validateCharacterProfileV2, raw, "too_many_items", "tags");
});
pass("CharacterProfileV2: 512 KiB aggregate limit", () => {
  const raw = structuredClone(character);
  raw.exampleDialogue = Array(9).fill("界".repeat(64000));
  rejects(validateCharacterProfileV2, raw, "oversized_field", "$");
});
pass("CharacterProfileV2: legacy migration preserves prompt bytes", () => {
  const system = "  系统 prompt\n原字节  ";
  const developer = "\tdeveloper prompt\r\n";
  const migrated = migrateLegacyCharacterToProfileV2({
    id: "legacy-opaque-id",
    name: "旧角色",
    description: "旧描述",
    profile: { promptSystem: system, promptDeveloper: developer },
  });
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.record.prompts.characterSystemSupplement, system);
  assert.equal(migrated.record.prompts.characterDeveloperSupplement, developer);
  assert.equal(validateCharacterProfileV2(migrated.record).ok, true);
});

const explicit = (value, source = "explicit") => ({
  value,
  source,
  updatedAt: "2026-08-17T00:00:00.000Z",
});
const preference = checkCommon(
  "UserCompanionPreferenceV2",
  () => createUserCompanionPreferenceV2({ userId: "legacy-user", characterId: "legacy-character" }),
  validateUserCompanionPreferenceV2,
);
pass("UserCompanionPreferenceV2: default and skipped are not explicit", () => {
  assert.equal(isExplicit(explicit("x", "default")), false);
  assert.equal(isExplicit(explicit("x", "skipped")), false);
  assert.equal(isExplicit(explicit("x", "explicit")), true);
  assert.equal(isExplicit(explicit("x", "import_review")), true);
});
pass("UserCompanionPreferenceV2: forbidden credentials", () =>
  rejects(validateUserCompanionPreferenceV2, { ...preference, apiKey: "secret" }, "forbidden_field", "apiKey"));
pass("UserCompanionPreferenceV2: invalid flirt enum", () => {
  const raw = structuredClone(preference);
  raw.interaction.flirtLevel = explicit("maximum");
  rejects(validateUserCompanionPreferenceV2, raw, "invalid_enum", "interaction.flirtLevel.value");
});
pass("UserCompanionPreferenceV2: oversized list", () => {
  const raw = structuredClone(preference);
  raw.boundaries.userHardBoundaries = explicit(Array(65).fill("x"));
  rejects(validateUserCompanionPreferenceV2, raw, "too_many_items", "boundaries.userHardBoundaries.value");
});

const snapshot = checkCommon(
  "TurnExecutionSnapshotV1",
  () => createTurnExecutionSnapshotV1({
    conversationId: "legacy-conversation",
    sessionId: "session-1",
    conversationRevision: 1,
    speakerCharacterId: "legacy-character",
    participants: [{ characterId: "legacy-character", revision: 3 }],
    userId: "legacy-user",
    relationshipScope: "dm",
    preferenceRevision: 1,
    locale: "zh-CN",
    conversationLanguage: "zh-CN",
    preset: { id: "preset-default", revision: 1 },
    cutoverProfile: "legacy",
    currentInput: { text: "你好", attachmentRefs: [] },
  }),
  validateTurnExecutionSnapshotV1,
);
pass("TurnExecutionSnapshotV1: create freezes snapshot and participants", () => {
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.participants), true);
});
pass("TurnExecutionSnapshotV1: participant required", () =>
  rejects(validateTurnExecutionSnapshotV1, { ...snapshot, participants: [] }, "too_many_items", "participants"));
pass("TurnExecutionSnapshotV1: mismatched character revisions fail closed", () => {
  const raw = structuredClone(snapshot);
  raw.characterRevisions["legacy-character"] = 4;
  rejects(validateTurnExecutionSnapshotV1, raw, "invalid_revision", "characterRevisions.legacy-character");
});
pass("TurnExecutionSnapshotV1: stale record reference fails closed", () => {
  const result = assertSnapshotReferences(snapshot, [{ characterId: "legacy-character", revision: 4 }]);
  assert.equal(result.ok, false);
  assert.equal(has(result, "invalid_revision"), true);
});
pass("TurnExecutionSnapshotV1: oversized history boundary list", () => {
  const raw = structuredClone(snapshot);
  raw.historyBoundaryIds = Array(1001).fill("turn");
  rejects(validateTurnExecutionSnapshotV1, raw, "too_many_items", "historyBoundaryIds");
});

const request = checkCommon(
  "PreparedModelRequestV1",
  () => createPreparedModelRequestV1({
    snapshotHash: snapshot.snapshotHash,
    messages: [{ role: "user", content: "你好", provenance: "turn_input" }],
    tools: [],
    providerMode: "hosted",
  }),
  validatePreparedModelRequestV1,
);
pass("PreparedModelRequestV1: empty tools are valid", () => assert.deepEqual(request.tools, []));
pass("PreparedModelRequestV1: top-level DOM reference forbidden", () =>
  rejects(validatePreparedModelRequestV1, { ...request, element: {} }, "forbidden_field", "element"));
pass("PreparedModelRequestV1: message DOM reference forbidden", () => {
  const raw = structuredClone(request);
  raw.messages[0].innerHTML = "<b>bad</b>";
  rejects(validatePreparedModelRequestV1, raw, "forbidden_field", "messages[0].innerHTML");
});
pass("PreparedModelRequestV1: oversized messages", () => {
  const raw = structuredClone(request);
  raw.messages = Array(1001).fill(raw.messages[0]);
  rejects(validatePreparedModelRequestV1, raw, "too_many_items", "messages");
});

const capability = checkCommon(
  "CapabilityOperationV2",
  () => createCapabilityOperationV2({
    capabilityId: "weather",
    operation: "read",
    discoverable: true,
    requestable: true,
    executable: true,
    risk: "R0",
    approval: "none",
    idempotencyKeyPolicy: "per-request",
    executorId: "weather.read",
  }),
  validateCapabilityOperationV2,
);
pass("CapabilityOperationV2: executor functions are forbidden", () =>
  rejects(validateCapabilityOperationV2, { ...capability, executor: () => {} }, "forbidden_field", "executor"));
pass("CapabilityOperationV2: too many reason codes", () =>
  rejects(validateCapabilityOperationV2, { ...capability, reasonCodes: Array(65).fill("x") }, "too_many_items", "reasonCodes"));

const toolRun = checkCommon(
  "ToolRunV1",
  () => createToolRunV1({
    capabilityId: "weather",
    operation: "read",
    risk: "R0",
    explicitness: "explicit_command",
    idempotencyKey: "weather-1",
    proposalSource: "user_ui",
    exactEffect: "读取天气",
    requiresApproval: false,
  }),
  validateToolRunV1,
);
pass("ToolRunV1: legal transition", () => {
  const result = transitionToolRun(toolRun, "executing");
  assert.equal(result.ok, true);
  assert.equal(result.record.status, "executing");
});
pass("ToolRunV1: invalid transition has stable code", () => {
  const succeeded = { ...toolRun, status: "succeeded" };
  const result = transitionToolRun(succeeded, "planned");
  assert.equal(result.ok, false);
  assert.equal(has(result, "invalid_transition", "status"), true);
});
pass("ToolRunV1: unknown cannot jump to succeeded", () => {
  const result = transitionToolRun({ ...toolRun, status: "unknown" }, "succeeded");
  assert.equal(result.ok, false);
});
pass("ToolRunV1: oversized exact effect", () =>
  rejects(validateToolRunV1, { ...toolRun, exactEffect: "x".repeat(8001) }, "oversized_field", "exactEffect"));

const report = checkCommon(
  "CharacterImportReportV1",
  () => createCharacterImportReportV1({
    format: "tavern_v2_json",
    entries: [{ path: "data.first_mes", disposition: "dropped", reasonCode: "unsupported" }],
  }),
  validateCharacterImportReportV1,
);
pass("CharacterImportReportV1: dropped first_mes summary is consistent", () => {
  assert.equal(report.summary.dropped, 1);
  assert.equal(report.hasSevereLoss, true);
});
pass("CharacterImportReportV1: inconsistent summary rejected", () =>
  rejects(validateCharacterImportReportV1, { ...report, summary: { ...report.summary, dropped: 0 } }, "invalid_type", "summary"));
pass("CharacterImportReportV1: imported system prompt cannot elevate", () => {
  const elevated = createCharacterImportReportV1({
    format: "tavern_v3_json",
    entries: [{
      path: "data.system_prompt",
      disposition: "preserved",
      targetPath: "platform.kernel",
    }],
  });
  rejects(validateCharacterImportReportV1, elevated, "untrusted_elevation", "entries[0]");
});
pass("CharacterImportReportV1: too many entries", () => {
  const raw = structuredClone(report);
  raw.entries = Array(10001).fill(raw.entries[0]);
  rejects(validateCharacterImportReportV1, raw, "too_many_items", "entries");
});

console.log(`\nverify-companion-v2-contracts: ${passCount} PASS.`);
