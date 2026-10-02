/**
 * W3: Action risk policy R0–R3 (plan §7.3).
 */

import assert from "node:assert/strict";
import { createActionProposalV1, validateActionProposalV1 } from "../src/contracts/index.js";
import {
  policyForRisk,
  applyActionPolicy,
  applyActionPolicyToAll,
} from "../src/turn-understanding/index.js";

function ok(name) {
  console.log(`PASS ${name}`);
}

function main() {
  const r0 = policyForRisk("R0");
  assert.equal(r0.requiresApproval, false);
  assert.equal(r0.mayAutoExecute, true);
  assert.equal(r0.strategy, "direct_with_source");
  ok("R0: direct with source; no approval");

  const r1Explicit = policyForRisk("R1", "explicit_command");
  assert.equal(r1Explicit.requiresApproval, false);
  assert.equal(r1Explicit.mayAutoExecute, true);
  assert.equal(r1Explicit.reversible, true);
  ok("R1 explicit: execute with undo");

  const r1Implicit = policyForRisk("R1", "implicit_suggestion");
  assert.equal(r1Implicit.requiresApproval, true);
  assert.equal(r1Implicit.mayAutoExecute, false);
  ok("R1 implicit: confirm suggestion first");

  const r2 = policyForRisk("R2");
  assert.equal(r2.requiresApproval, true);
  assert.equal(r2.mayAutoExecute, false);
  assert.equal(r2.strategy, "confirm_exact_effect");
  ok("R2: confirm exactEffect");

  const r3 = policyForRisk("R3");
  assert.equal(r3.requiresApproval, true);
  assert.equal(r3.mayAutoExecute, false);
  assert.equal(r3.forbidBatchConsent, true);
  ok("R3: always confirm; no batch consent");

  // applyActionPolicy forces R2 calendar to require approval even if caller lied
  const cal = applyActionPolicy(
    createActionProposalV1({
      capabilityId: "calendar",
      operation: "create_reminder",
      title: "提醒",
      exactEffect: "写日历",
      risk: "R2",
      explicitness: "explicit_command",
      requiresApproval: false, // attacker/bug — policy overrides
      evidenceRefs: ["帮我加提醒"],
    }),
  );
  assert.equal(cal.requiresApproval, true);
  assert.equal(validateActionProposalV1(cal).ok, true);
  ok("applyActionPolicy forces R2 requiresApproval");

  const weather = applyActionPolicy(
    createActionProposalV1({
      capabilityId: "web.weather",
      operation: "lookup",
      title: "天气",
      exactEffect: "查询",
      risk: "R0",
      explicitness: "explicit_command",
      evidenceRefs: ["查天气"],
    }),
  );
  assert.equal(weather.requiresApproval, false);
  ok("R0 weather stays approval-free");

  const send = applyActionPolicy(
    createActionProposalV1({
      capabilityId: "messaging.external",
      operation: "send_message",
      title: "发消息",
      exactEffect: "外发",
      risk: "R3",
      explicitness: "explicit_command",
      requiresApproval: false,
      evidenceRefs: ["帮我发消息"],
    }),
  );
  assert.equal(send.requiresApproval, true);
  assert.equal(send.policy.forbidBatchConsent, true);
  ok("R3 send always requiresApproval");

  // Observation vs action distinction (policy doc)
  // “明天有答辩” is not an action — covered by turn-understanding verify;
  // here we assert policy helpers do not invent calendar risk for empty input.
  const none = applyActionPolicyToAll([]);
  assert.deepEqual(none, []);
  ok("empty proposal list stays empty");

  // Implicit fear ≠ calendar command
  const fear = applyActionPolicy(
    createActionProposalV1({
      capabilityId: "calendar",
      operation: "create_reminder",
      title: "建议提醒",
      exactEffect: "建议写入日历",
      risk: "R1",
      explicitness: "implicit_suggestion",
      evidenceRefs: ["我怕明天忘了"],
    }),
  );
  assert.equal(fear.requiresApproval, true);
  assert.equal(fear.policy.strategy, "confirm_suggestion");
  ok("implicit_suggestion calendar stays confirm-first");

  console.log("\nverify-action-policy: all checks passed.");
}

main();
