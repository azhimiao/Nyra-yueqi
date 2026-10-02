import assert from "node:assert/strict";
import fs from "node:fs";

import {
  finalizeModelRequest,
  prepareModelRequestV1,
} from "../src/prompt/finalize.js";
import {
  validatePreparedModelRequestV1,
} from "../src/contracts/prepared-model-request-v1.js";

function prepare(messages, overrides = {}) {
  return prepareModelRequestV1({
    messages,
    totalContextTokens: 2048,
    outputReserveTokens: 512,
    safetyMarginTokens: 96,
    ...overrides,
  });
}

const minimal = prepare([
  { role: "system", content: "PLATFORM_MARKER identity", blockId: "platform_safety" },
  { role: "user", content: "USER_MARKER hello", blockId: "user_input" },
]);
assert.equal(validatePreparedModelRequestV1(minimal).ok, true);
assert.deepEqual(minimal.tools, []);
assert.ok(minimal.messages.every((message) => message.provenance));

const pressureMessages = [
  { role: "system", content: "PLATFORM_SAFETY_MARKER immutable", blockId: "platform_safety", protected: true },
  { role: "system", content: "IDENTITY_MARKER kind companion", blockId: "character_package", protected: true },
  ...Array.from({ length: 30 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: `OLD_HISTORY_${index} ${"history ".repeat(350)}`,
    blockId: `history_${index}`,
  })),
  { role: "tool", content: "TOOL_RECEIPT_MARKER trusted result" },
  { role: "user", content: "CURRENT_USER_MARKER stay protected", blockId: "user_input", protected: true },
];
assert.throws(() => prepare(pressureMessages), { code: "PROMPT_RECENT_EXCHANGE_TOO_LARGE" });
const historyPressure = prepare(pressureMessages, { totalContextTokens: 2560 });
assert.ok(historyPressure.messages.some((message) => String(message.content).includes("PLATFORM_SAFETY_MARKER")));
assert.ok(historyPressure.messages.some((message) => String(message.content).includes("IDENTITY_MARKER")));
assert.ok(historyPressure.messages.some((message) => String(message.content).includes("CURRENT_USER_MARKER")));
assert.ok(historyPressure.messages.some((message) => String(message.content).includes("TOOL_RECEIPT_MARKER")));
assert.ok(historyPressure.messages.some((message) => String(message.content).startsWith("OLD_HISTORY_28 ")));
assert.ok(historyPressure.messages.some((message) => String(message.content).startsWith("OLD_HISTORY_29 ")));
assert.ok(historyPressure.budgetLedger.some((item) => (
  item.blockId.startsWith("history_") && item.truncated && item.omittedReason
)));

const lorePressure = prepare([
  { role: "system", content: `LORE_MARKER ${"lore ".repeat(6000)}`, blockId: "world_info" },
  { role: "system", content: "IDENTITY_SURVIVES protected", blockId: "character_package", protected: true },
  { role: "user", content: "USER_SURVIVES protected", blockId: "user_input", protected: true },
]);
assert.ok(lorePressure.messages.some((message) => String(message.content).includes("IDENTITY_SURVIVES")));
assert.ok(lorePressure.budgetLedger.some((item) => item.blockId === "world_info" && item.omittedReason));

const deterministicInput = {
  messages: [
    { role: "system", content: "stable system" },
    { role: "user", content: "stable user" },
  ],
  tools: [],
  totalContextTokens: 4096,
  outputReserveTokens: 768,
};
const deterministicA = prepareModelRequestV1(deterministicInput);
const deterministicB = prepareModelRequestV1(deterministicInput);
assert.equal(deterministicA.snapshotHash, deterministicB.snapshotHash);
assert.deepEqual(
  { ...deterministicA, requestId: "<ignored>" },
  { ...deterministicB, requestId: "<ignored>" },
);

assert.throws(() => prepare([
  { role: "system", content: "bad", element: {} },
  { role: "user", content: "input" },
]), /DOM/i);
assert.throws(() => prepare([
  { role: "system", content: "bad", textarea: {} },
  { role: "user", content: "input" },
]), /DOM/i);

const reserve = finalizeModelRequest([
  { role: "system", content: "system" },
  { role: "user", content: "user" },
], {
  totalContextTokens: 4096,
  outputReserveTokens: 700,
  safetyMarginTokens: 100,
});
assert.ok(reserve.maxOutputTokens > 0);
assert.equal(reserve.ledger.inputLimit, 4096 - 700 - 100);

const source = fs.readFileSync(new URL("../src/prompt/finalize.js", import.meta.url), "utf8");
assert.equal(source.includes("querySelector"), false);

console.log("verify-prepared-model-request: ok");
