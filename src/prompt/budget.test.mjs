import assert from "node:assert/strict";
import { test } from "node:test";
import { applyBudget, estimatePromptTokens } from "./budget.js";
import { finalizeModelRequest } from "./finalize.js";
import { normalizeContextRequest, createContextEnvelope } from "../context/contract.js";
import { prepareShortTermContext } from "../context/short-term.js";

test("deep and custom profiles survive validation/broker/envelope normalization", () => {
  for (const budgetProfile of ["deep", { id: "custom", totalInputTokens: 16384, outputReserveTokens: 3100 }]) {
    const once = normalizeContextRequest({ budgetProfile, characterId: "c", currentInput: "hello" });
    const twice = normalizeContextRequest(once);
    const envelope = createContextEnvelope(twice);
    assert.deepEqual(twice.profile, once.profile);
    assert.deepEqual(envelope.request.profile, once.profile);
  }
  assert.equal(normalizeContextRequest({ totalInputTokens: 6000 }).profile.id, "compact");
  assert.equal(normalizeContextRequest({ totalInputTokens: 12000 }).profile.outputReserveTokens, 2400);
  assert.equal(normalizeContextRequest({ totalInputTokens: 16384 }).profile.totalInputTokens, 16384);
  assert.equal(normalizeContextRequest({ totalInputTokens: 6000, outputReserveTokens: 0 }).profile.outputReserveTokens, 0);
});

test("semantic and legacy persona are atomic, preserve the tail and reject impossible budgets", () => {
  for (const id of ["character", "character_package"]) {
    const persona = `BEGIN\n${"完整的人物设定。\n".repeat(30)}TAIL-IDENTITY`;
    const required = [ { id, text: persona }, { id: "platform_safety", text: "规则。" }, { id: "user_input", text: "本轮输入。" } ];
    const tokens = required.reduce((n, b) => n + estimatePromptTokens(b.text), 0);
    const result = applyBudget([...required, { id: "world_context", text: "可裁世界资料。".repeat(100) }], { totalBudget: tokens });
    assert.equal(result.blocks.find(b => b.id === id).text, persona);
    assert.equal(result.totalUsed, tokens);
    assert.throws(() => applyBudget(required, { totalBudget: tokens - 1 }), { code: "PROMPT_REQUIRED_CONTEXT_TOO_LARGE" });
  }
});

test("history is a contiguous suffix; large middle rows cannot be skipped", () => {
  const rows = [
    { id: "u1", role: "user", content: "old" },
    { id: "a1", role: "assistant", content: "长".repeat(200) },
    { id: "u2", role: "user", content: "recent" },
    { id: "a2", role: "assistant", content: "reply" },
    { id: "current", role: "user", content: "current" },
  ];
  const short = prepareShortTermContext(rows, { tokenBudget: 50, currentInput: "current" });
  assert.deepEqual(short.sourceMessageIds, ["u2", "a2", "current"]);
  assert.deepEqual(short.omittedMessageIds, ["u1", "a1"]);
  assert.equal(short.tokens, estimatePromptTokens("recent") + estimatePromptTokens("reply") + 8);
  const zero = prepareShortTermContext(rows, { tokenBudget: 0, currentInput: "current" });
  assert.deepEqual(zero.sourceMessageIds, ["current"]);
  assert.equal(zero.tokens, 0);
  assert.deepEqual(zero.omittedMessageIds, ["u1", "a1", "u2", "a2"]);
  const noOrphan = prepareShortTermContext(rows, { tokenBudget: estimatePromptTokens("reply") + 4, currentInput: "current" });
  assert.deepEqual(noOrphan.sourceMessageIds, ["current"], "a reply cannot survive without its initiating user message");
  const repeatIsNew = prepareShortTermContext([{ id: "old", role: "user", content: "current" }], { tokenBudget: 50, currentInput: "current", currentUserMessageId: "new" });
  assert.equal(repeatIsNew.currentInputAlreadyPresent, false);
  assert.ok(repeatIsNew.tokens > 0, "equal text from another durable turn is history, not the current input");
});

test("final transport never shortens required text and accounts for tool schema", () => {
  const messages = [
    { role: "system", blockId: "character", content: "PERSONA-END" },
    { role: "user", content: "old".repeat(1000), messageId: "u-old" },
    { role: "assistant", content: "old-reply".repeat(1000), messageId: "a-old" },
    { role: "user", content: "RECENT-USER", messageId: "u-recent" },
    { role: "assistant", content: "RECENT-REPLY", messageId: "a-recent" },
    { role: "system", blockId: "runtime_protocol", content: "RUNTIME-END" },
    { role: "user", blockId: "user_input", content: "CURRENT-END" },
  ];
  const tools = [{ type: "function", function: { name: "calendar", parameters: { type: "object", properties: {} } } }];
  const result = finalizeModelRequest(messages, { totalContextTokens: 2048, outputReserveTokens: 768, tools });
  assert.deepEqual(result.messages.map(row => row.content), ["PERSONA-END", "RECENT-USER", "RECENT-REPLY", "RUNTIME-END", "CURRENT-END"]);
  assert.ok(result.ledger.schemaTokens > 0);
  assert.equal(result.ledger.trimmedMessages, 0);
  assert.equal(result.ledger.withinBudget, true);
  assert.throws(() => finalizeModelRequest([{ role: "system", blockId: "character", content: "设定".repeat(2000) }, ...messages.slice(-2)], { totalContextTokens: 2048 }), { code: "PROMPT_REQUIRED_CONTEXT_TOO_LARGE" });
  assert.throws(() => finalizeModelRequest(messages, { totalContextTokens: 2048, tools: [{ description: "工具".repeat(2000) }] }), { code: "PROMPT_REQUIRED_CONTEXT_TOO_LARGE" });
  assert.equal(messages[1].content.length, 3000, "finalizer does not mutate its input");
});

test("a late large tool receipt cannot silently remove the last exchange", () => {
  const messages = [
    { role: "system", blockId: "character", content: "PERSONA" },
    { role: "user", content: "L".repeat(2000), provenance: "conversation.history" },
    { role: "assistant", content: "RECENT-REPLY", provenance: "conversation.history" },
    { role: "tool", content: "T".repeat(3200) },
    { role: "user", blockId: "user_input", content: "CURRENT" },
  ];
  assert.throws(() => finalizeModelRequest(messages, { totalContextTokens: 2048, outputReserveTokens: 768 }), error => {
    assert.equal(error.code, "PROMPT_RECENT_EXCHANGE_TOO_LARGE");
    assert.equal(error.details.stage, "final_transport");
    assert.ok(error.details.requiredTokens < error.details.inputLimit, "required input fits, but keeping causal history needs more room");
    return true;
  });
  const larger = finalizeModelRequest(messages, { totalContextTokens: 4096, outputReserveTokens: 768 });
  assert.equal(larger.messages.length, messages.length);
});
