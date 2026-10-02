import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FEATURE_AUDIT_ROWS } from "../src/audit/feature-audit-registry.js";
import { buildCharacterIdentityV2 } from "../src/prompt/character-identity-v2.js";
import {
  buildChatOutputContract,
  buildCharacterRelationshipContract,
  buildDeveloperEvidencePolicy,
  buildPlatformCompanionContract,
} from "../src/prompt/companion-contract-v2.js";
import { buildRelationshipContractV2 } from "../src/prompt/relationship-contract-v2.js";
import {
  assembleCanonical,
  buildModelMessages,
  CANONICAL_BLOCK_ORDER,
  SEMANTIC_BLOCK_ORDER,
} from "../src/prompt/assemble.js";
import { estimatePromptTokens } from "../src/prompt/budget.js";
import { finalizeModelRequest } from "../src/prompt/finalize.js";
import { buildCapabilityRuntimeSnapshot } from "../src/capabilities/runtime-snapshot.js";
import { requestableOpenAiTools } from "../src/tools/openai-tools.js";
import { buildRuntimeInstruction } from "../src/runtime/protocol.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lang = { conversationLanguage: "zh-CN" };
const character = {
  id: "fixture-character",
  name: "",
  alias: "",
  profile: { promptSystem: "", promptDeveloper: "" },
};
const userText = "你好";
const history = [
  { role: "user", content: "这是历史用户消息。" },
  { role: "assistant", content: "这是历史角色消息。" },
];

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    args[key] = argv[i + 1]?.startsWith("--") ? true : (argv[i + 1] ?? true);
    if (args[key] !== true) i += 1;
  }
  return args;
}

function systemFor(mode) {
  const core = buildCharacterIdentityV2(character, lang);
  const legacy = buildCharacterRelationshipContract({ name: "", alias: "", promptSystem: "", promptDeveloper: "" }, lang);
  const characterPackage = mode === "baseline" ? [core, legacy].join("\n\n") : core;
  const runtimeText = "Runtime capability snapshot: no requestable Companion Operation; continue the current conversation only.";
  const baseWorld = "【月栖产品事实】角色身份使用 activeCharacterId；桌宠外观使用 selectedPetId；Conversation V2 是聊天事实来源；未成功的产品动作不算已经发生。";
  const afterWorld = "本轮激活的 World Book 条目位于历史消息之后，靠近当前回合。";
  const consolidationBefore = mode === "semantic-before";
  const canonical = assembleCanonical({
    semantic: mode !== "baseline",
    platformSafety: [buildPlatformCompanionContract(lang), buildDeveloperEvidencePolicy(lang)].join("\n\n"),
    characterPackage,
    userPersona: buildRelationshipContractV2(null, lang),
    worldInfo: consolidationBefore ? `${baseWorld}\n\n${afterWorld}` : baseWorld,
    // The hello fixture does not mention a feature or action, so the final
    // semantic request intentionally has no Runtime Context block.
    runtimeContext: "",
    worldInfoAfter: !consolidationBefore && mode !== "baseline" ? afterWorld : "",
    branchHistory: history.map((item) => `${item.role}: ${item.content}`).join("\n"),
    userInput: userText,
    postHistoryContract: buildChatOutputContract(lang),
    totalBudget: 8000,
    mode: "chat",
  });
  return {
    canonical,
    historyMessages: history,
    runtimeCapabilities: mode === "baseline" ? runtimeText : "",
    turnIntent: "user_message",
    character,
  };
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (/key|token|secret|authorization|credential/i.test(key)) continue;
    result[key] = sanitize(child);
  }
  return result;
}

function writeJson(target, value) {
  const absolute = path.resolve(ROOT, target);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return absolute;
}

function diffMessages(before, after) {
  const max = Math.max(before.length, after.length);
  return Array.from({ length: max }, (_, index) => {
    const left = before[index] || null;
    const right = after[index] || null;
    return {
      index,
      status: !left ? "added" : !right ? "removed" : JSON.stringify(left) === JSON.stringify(right) ? "unchanged" : "changed",
      before: left,
      after: right,
    };
  });
}

function messageTokenTotal(messages = []) {
  return (Array.isArray(messages) ? messages : []).reduce(
    (sum, item) => sum + estimatePromptTokens(item?.content || "") + 4,
    0,
  );
}

function auditOnlyLegacyTransportIds(messages = []) {
  const legacyOnly = new Set(CANONICAL_BLOCK_ORDER.filter((id) => !SEMANTIC_BLOCK_ORDER.includes(id)));
  return messages.map((item) => item?.blockId).filter((id) => legacyOnly.has(id));
}

const args = parseArgs(process.argv);
const mode = ["final", "semantic-before"].includes(args.mode) ? args.mode : "baseline";
const compiled = systemFor(mode);
const messages = await buildModelMessages(compiled, userText, "char:fixture-character");
const runtimeInstruction = buildRuntimeInstruction({
  actionIds: ["talking_default", "idle_default"],
  expressionIds: [],
});
const finalUserIndex = messages.findLastIndex((item) => item.role === "user");
messages.splice(finalUserIndex >= 0 ? finalUserIndex : messages.length, 0, {
  role: "system",
  content: runtimeInstruction,
  blockId: mode === "semantic-before" ? "runtime_context" : "runtime_protocol",
  provenance: "runtime.protocol",
});
const capabilitySnapshot = buildCapabilityRuntimeSnapshot({
  networkOnline: true,
  foreground: true,
  featureFlags: { webRetrievalV1: false },
}, { snapshotId: "semantic-consolidation-fixture" });
const tools = mode === "final"
  ? requestableOpenAiTools({ capabilityRuntimeSnapshot: capabilitySnapshot, operationIds: [] })
  : requestableOpenAiTools({ capabilityRuntimeSnapshot: capabilitySnapshot });
const finalized = finalizeModelRequest(messages, {
  totalContextTokens: 8000,
  outputReserveTokens: 1200,
  safetyMarginTokens: 96,
  tools,
  providerMode: "chat",
});
assert.ok(finalized.prepared);
assert.ok(finalized.prepared.messages.length > 0);

const snapshot = {
  schemaVersion: 1,
  fixture: {
    name: "cold-start-first-light-undefined-first-user-hello",
    mode,
    characterId: character.id,
    selectedPetId: "fixture-pet",
    activeCharacterId: character.id,
    userText,
    history,
  },
  messages: sanitize(messages),
  tools: sanitize(tools),
  prepared: sanitize(finalized.prepared),
  budgetLedger: sanitize(finalized.ledger),
  promptBlocks: sanitize(mode === "semantic-before"
    ? compiled.canonical.blocks.filter((block) => block.id !== "world_context_after")
    : compiled.canonical.blocks),
  semanticPromptBlocks: sanitize(compiled.canonical.semantic
    ? (mode === "semantic-before"
      ? compiled.canonical.blocks.filter((block) => block.id !== "world_context_after")
      : compiled.canonical.blocks)
    : []),
  legacyPromptBlocks: sanitize(compiled.canonical.legacyBlocks || []),
  semantic: Boolean(compiled.canonical.semantic),
  semanticOrder: sanitize(mode === "semantic-before"
    ? (compiled.canonical.order || []).filter((id) => id !== "world_context_after")
    : (compiled.canonical.order || [])),
  modelMessageTokens: messageTokenTotal(messages),
  legacyAuditTokens: (compiled.canonical.legacyBlocks || []).reduce((sum, block) => sum + estimatePromptTokens(block.text || ""), 0),
  semanticBudgetTokens: Number(compiled.canonical.totalUsed || 0),
  legacyOnlyTransportIds: auditOnlyLegacyTransportIds(messages),
  legacyBlocksAuditOnly: Boolean(compiled.canonical.semantic)
    && auditOnlyLegacyTransportIds(messages).length === 0,
  featureAuditRows: FEATURE_AUDIT_ROWS,
};

const out = String(args.out || (
  mode === "baseline"
    ? "docs/qa/prompt/wave0-old-baseline.json"
    : mode === "semantic-before"
      ? "docs/qa/prompt/semantic-consolidation-before.json"
      : "docs/qa/prompt/semantic-consolidation-after.json"
));
const outputPath = writeJson(out, snapshot);

if (args.diff) {
  const before = JSON.parse(fs.readFileSync(path.resolve(ROOT, String(args.diff)), "utf8"));
  const diff = {
    schemaVersion: 1,
    fixture: snapshot.fixture,
    before: String(args.diff),
    after: out,
    messageDiff: diffMessages(before.messages || [], snapshot.messages || []),
    blockDiff: diffMessages(before.promptBlocks || [], snapshot.promptBlocks || []),
    semanticBlockDiff: diffMessages(before.semanticPromptBlocks || [], snapshot.semanticPromptBlocks || []),
    toolDiff: diffMessages(before.tools || [], snapshot.tools || []),
    summary: {
      messageChanges: diffMessages(before.messages || [], snapshot.messages || []).filter((item) => item.status !== "unchanged").length,
      blockChanges: diffMessages(before.promptBlocks || [], snapshot.promptBlocks || []).filter((item) => item.status !== "unchanged").length,
      semanticBlockChanges: diffMessages(before.semanticPromptBlocks || [], snapshot.semanticPromptBlocks || []).filter((item) => item.status !== "unchanged").length,
      beforeModelMessageTokens: Number(before.modelMessageTokens || 0),
      afterModelMessageTokens: Number(snapshot.modelMessageTokens || 0),
      modelMessageTokenDelta: Number(snapshot.modelMessageTokens || 0) - Number(before.modelMessageTokens || 0),
      toolsChanged: JSON.stringify(before.tools || []) !== JSON.stringify(snapshot.tools || []),
    },
  };
  const diffPath = writeJson(String(args.diffOut || "docs/qa/prompt/wave1-vs-wave0.diff.json"), diff);
  console.log(`cold-start-request: wrote ${outputPath}`);
  console.log(`cold-start-request: wrote ${diffPath}`);
} else {
  console.log(`cold-start-request: wrote ${outputPath}`);
}
