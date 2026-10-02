#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCapabilityOperationV2 } from "../src/contracts/capability-operation-v2.js";
import { listCapabilities } from "../src/capabilities/registry.js";
import {
  capabilityOperationManifest,
  getCapabilityOperation,
  listCapabilityOperations,
  listRequestableOperations,
  resolveOperationAvailability,
} from "../src/capabilities/operation-registry-v2.js";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
let passCount = 0;

function pass(name, fn) {
  if (typeof fn === "function") fn();
  passCount += 1;
  console.log(`PASS ${name}`);
}

const FORBIDDEN_FN_KEYS = ["executor", "undoExecutor", "fn", "handler"];

const allOps = [];
const implementedOps = [];
for (const row of listCapabilities({ includeUnavailable: true })) {
  for (const operation of row.operations) {
    const item = { capabilityId: row.id, operation, implemented: row.implemented === true };
    allOps.push(item);
    if (item.implemented) implementedOps.push(item);
  }
}
assert.ok(implementedOps.length >= 10, "expected implemented operations");
for (const { capabilityId, operation } of implementedOps) {
  const desc = getCapabilityOperation(capabilityId, operation);
  assert.ok(desc, `missing descriptor ${capabilityId}.${operation}`);
  const validated = validateCapabilityOperationV2(desc);
  assert.equal(validated.ok, true, `${capabilityId}.${operation}: ${JSON.stringify(validated.errors)}`);
  assert.equal(desc.inputSchema && typeof desc.inputSchema, "object");
  assert.equal(desc.outputSchema && typeof desc.outputSchema, "object");
  assert.equal(typeof desc.discoverable, "boolean");
  assert.equal(typeof desc.requestable, "boolean");
  assert.equal(typeof desc.executable, "boolean");
  assert.ok(Array.isArray(desc.reasonCodes));
  assert.ok(["R0", "R1", "R2", "R3"].includes(desc.risk));
  assert.ok(String(desc.approval || "").length > 0);
  assert.equal(typeof desc.requires, "object");
  assert.ok(String(desc.idempotencyKeyPolicy || "").length > 0);
  assert.equal(typeof desc.receiptRequired, "boolean");
  assert.equal(typeof desc.reversible, "boolean");
  assert.ok(String(desc.executorId || "").length > 0);
}
pass("every implemented registry operation has a valid descriptor");

for (const desc of listCapabilityOperations()) {
  for (const key of FORBIDDEN_FN_KEYS) {
    assert.equal(Object.hasOwn(desc, key), false, `${desc.capabilityId}.${desc.operation} has ${key}`);
    assert.notEqual(typeof desc[key], "function");
  }
  assert.equal(typeof desc.executorId, "string");
  assert.notEqual(typeof desc.executorId, "function");
}
pass("descriptors store executorId only, never executor functions");

const weather = getCapabilityOperation("web.weather", "lookup");
assert.ok(weather);
assert.equal(weather.featureFlag, undefined);
assert.equal(weather.risk, "R0");
const weatherAvail = resolveOperationAvailability(weather, {});
assert.equal(weatherAvail.requestable, true);
pass("weather without featureFlag is requestable");

const search = getCapabilityOperation("web.search", "search");
assert.ok(search);
assert.equal(search.featureFlag, "webRetrievalV1");
const searchOff = resolveOperationAvailability(search, { featureFlags: { webRetrievalV1: false } });
assert.equal(searchOff.requestable, false);
assert.ok(
  searchOff.reasonCodes.some((code) => /flag/i.test(code) || code === "webRetrievalV1"),
  `expected flag reason, got ${JSON.stringify(searchOff.reasonCodes)}`,
);
assert.equal(
  listRequestableOperations({ featureFlags: { webRetrievalV1: false } })
    .some((op) => op.capabilityId === "web.search" && op.operation === "search"),
  false,
);
const searchOn = resolveOperationAvailability(search, { featureFlags: { webRetrievalV1: true } });
assert.equal(searchOn.requestable, true);
pass("search is not requestable when webRetrievalV1 is false");

const calendarCreate = getCapabilityOperation("calendar", "create");
assert.ok(calendarCreate);
assert.equal(calendarCreate.risk, "R2");
assert.equal(calendarCreate.approval, "requiresApproval");
const calendarDenied = resolveOperationAvailability(calendarCreate, {});
assert.equal(calendarDenied.executable, false);
assert.ok(calendarDenied.reasonCodes.includes("approval_required"));
assert.ok(calendarDenied.reasonCodes.includes("permission_required"));
const calendarNoPerm = resolveOperationAvailability(calendarCreate, { approved: true });
assert.equal(calendarNoPerm.executable, false);
assert.ok(calendarNoPerm.reasonCodes.includes("permission_required"));
const calendarReady = resolveOperationAvailability(calendarCreate, {
  approved: true,
  permissions: { "calendar.internal": true },
});
assert.equal(calendarReady.executable, true);
pass("calendar create is not executable without approval or permission");

const calendarRead = getCapabilityOperation("calendar", "list");
assert.equal(calendarRead.risk, "R0");
assert.equal(calendarRead.approval, "none");
const reminder = getCapabilityOperation("calendar", "create_reminder");
assert.equal(reminder.risk, "R2");
assert.equal(reminder.approval, "requiresApproval");
pass("calendar reads are R0 and writes are R2 with requiresApproval");

const poisoned = {
  ...calendarCreate,
  risk: "R0",
  approval: "none",
  requires: {},
  parameters: { risk: "R0" },
};
const ignored = resolveOperationAvailability(poisoned, {
  risk: "R0",
  parameters: { risk: "R0" },
});
assert.equal(getCapabilityOperation("calendar", "create").risk, "R2");
assert.equal(calendarCreate.risk, "R2");
assert.equal(ignored.executable, false);
assert.ok(ignored.reasonCodes.includes("approval_required") || ignored.reasonCodes.includes("permission_required"));
pass("resolve ignores model/runtime parameters.risk and keeps descriptor risk");

for (const { capabilityId, operation } of [
  { capabilityId: "screen.observe", operation: "start" },
  { capabilityId: "screen.observe", operation: "stop" },
  { capabilityId: "messaging.external", operation: "send_message" },
]) {
  const desc = getCapabilityOperation(capabilityId, operation);
  assert.ok(desc, `missing unimplemented ${capabilityId}.${operation}`);
  assert.equal(desc.executable, false);
  assert.ok(desc.reasonCodes.includes("not_implemented"));
  const avail = resolveOperationAvailability(desc, {
    approved: true,
    platform: "android",
    permissions: { "screen.observe": true, "messaging.external": true },
    account: true,
    foreground: true,
  });
  assert.equal(avail.executable, false);
  assert.ok(avail.reasonCodes.includes("not_implemented"));
}
pass("unimplemented operations stay executable=false with not_implemented");

const requiredCovered = [
  ["web.weather", "lookup"],
  ["web.search", "search"],
  ["calendar", "list"],
  ["calendar", "read"],
  ["calendar", "free"],
  ["calendar", "create"],
  ["calendar", "create_reminder"],
  ["calendar-draft", "create_draft"],
  ["companion.diary", "create"],
  ["companion.selfie", "create"],
];
for (const [capabilityId, operation] of requiredCovered) {
  assert.ok(getCapabilityOperation(capabilityId, operation), `missing required ${capabilityId}.${operation}`);
}
for (const { capabilityId, operation } of allOps) {
  const desc = getCapabilityOperation(capabilityId, operation);
  assert.ok(desc, `missing catalogue descriptor ${capabilityId}.${operation}`);
  assert.equal(validateCapabilityOperationV2(desc).ok, true);
}
assert.equal(allOps.length, listCapabilityOperations().length);
pass("required product operations are registered");

const src = readFileSync(join(root, "src/capabilities/operation-registry-v2.js"), "utf8");
assert.doesNotMatch(src, /panels\/chat\.js|prompt\/assemble\.js/);
assert.doesNotMatch(src, /from\s+["'][^"']*\/(chat|assemble)\.js["']/);
pass("operation-registry-v2.js does not import chat.js or assemble.js");

const manifest = capabilityOperationManifest({ featureFlags: { webRetrievalV1: true } }, "zh");
assert.match(manifest, /web\.weather\.lookup/);
assert.match(manifest, /可请求能力操作/);
assert.doesNotMatch(manifest, /messaging\.external/);
pass("capabilityOperationManifest lists requestable operations only");

console.log(`\nAll ${passCount} capability-operations-v2 checks passed (${listCapabilityOperations().length} operations).`);
