import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FEATURE_AUDIT_ROWS } from "../src/audit/feature-audit-registry.js";
import { FL_V2_FIELD_PATHS } from "../src/first-light/state-v2.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = path.join(ROOT, "docs/qa/prompt/wave0-old-baseline.json");
assert.ok(fs.existsSync(baselinePath), "Wave 0 baseline snapshot is missing");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
assert.equal(baseline.fixture.name, "cold-start-first-light-undefined-first-user-hello");
assert.ok(Array.isArray(baseline.promptBlocks) && baseline.promptBlocks.length > 0);
assert.ok(Array.isArray(baseline.tools));
assert.ok(Array.isArray(baseline.budgetLedger?.items));
const baselineSystem = baseline.messages.filter((item) => item.role === "system").map((item) => item.content).join("\n");
assert.ok((baselineSystem.match(/Character Identity/g) || []).length >= 2, "baseline must preserve duplicate identity evidence");
assert.ok(baseline.messages.some((item) => item.role === "system" && String(item.content).includes("本轮能力")), "baseline must preserve runtime-after-history evidence");
assert.equal(FEATURE_AUDIT_ROWS.length, 38);
assert.equal(new Set(FEATURE_AUDIT_ROWS.map((item) => item.featureId)).size, FEATURE_AUDIT_ROWS.length);
for (const row of FEATURE_AUDIT_ROWS) {
  assert.ok(row.owner && row.status && row.successState && row.writeAuthority && row.memoryPolicy, row.featureId);
  assert.ok(["pending", "denied", "cancelled", "failed"].every((key) => row.failureStates[key]), row.featureId);
  assert.ok(Array.isArray(row.operationIds), row.featureId);
  assert.ok(typeof row.known === "boolean" && typeof row.requestable === "boolean" && typeof row.executable === "boolean", row.featureId);
  if (row.executable) assert.equal(row.requestable, true, `${row.featureId} executable must be requestable`);
}
assert.equal(FL_V2_FIELD_PATHS.length, 23);

console.log(`verify-wave0-audit: ok (${FEATURE_AUDIT_ROWS.length} feature rows, ${FL_V2_FIELD_PATHS.length} First Light fields)`);
