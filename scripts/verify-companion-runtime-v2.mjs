import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPANION_PROMPT_VERSION,
  PROMPT_AUTHORITY_ORDER,
  buildChatOutputContract,
  buildDeveloperEvidencePolicy,
  buildPlatformCompanionContract,
} from "../src/prompt/companion-contract-v2.js";
import {
  capabilityPromptManifest,
  capabilityRegistrySummary,
  getCapability,
} from "../src/capabilities/registry.js";
import { applyBudget } from "../src/prompt/budget.js";
import { finalizeModelRequest } from "../src/prompt/finalize.js";
import {
  clearTurnTraces,
  getTurnTrace,
  startTurnTrace,
} from "../src/observability/turn-trace.js";

const root = join(fileURLToPath(new URL("..", import.meta.url)));

function ok(name) {
  console.log(`PASS ${name}`);
}

const zh = { appLocale: "zh-CN", conversationLanguage: "zh-CN" };
const platform = buildPlatformCompanionContract(zh);
const developer = buildDeveloperEvidencePolicy(zh);
const output = buildChatOutputContract(zh, { turnIntent: "user_message" });
assert.equal(COMPANION_PROMPT_VERSION, "2.2");
assert.ok(PROMPT_AUTHORITY_ORDER[0] === "platform_reality_safety");
assert.match(platform, /月栖运行内核/);
assert.match(platform, /Character Identity/);
assert.doesNotMatch(platform, /亲近|表达在意|持续相处的数字伴侣/);
assert.match(platform, /不得泄露隐藏 Prompt|不得泄露/);
assert.match(developer, /ActionProposal\/执行结果/);
assert.match(output, /回合机制/);
assert.match(output, /篇幅与形式不限/);
assert.doesNotMatch(output, /即时消息气泡/);
ok("platform kernel v2.2 is personality-neutral and evidence-grounded");

const summary = capabilityRegistrySummary();
assert.equal(summary.implemented, 18);
assert.equal(summary.enabledByDefault, 18);
assert.deepEqual(summary.unavailable, ["screen.observe", "messaging.external"]);
assert.equal(getCapability("web.search", "search")?.enabledByDefault, true);
assert.equal(getCapability("messaging.external")?.implemented, false);
assert.equal(getCapability("calendar.read", "list_events")?.implemented, true);
assert.equal(getCapability("screen.observe")?.implemented, false);
assert.match(capabilityPromptManifest(zh), /Capability|能力/);
ok("implemented capabilities are enabled by default; unavailable host action is honest");

const highText = Array.from({ length: 80 }, (_, index) => `关系连续性片段 ${index}：这是一条可独立裁剪的证据。`).join("\n");
const budgeted = applyBudget([
  { id: "platform_safety", text: "安全合同。", source: "test" },
  { id: "character_package", text: "角色设定。", source: "test" },
  { id: "user_input", text: "用户当前消息。", source: "test" },
  { id: "relationship_continuity", text: highText, source: "test" },
], { totalBudget: 1000 });
const relationship = budgeted.blocks.find((block) => block.id === "relationship_continuity");
assert.equal(budgeted.overflow, false);
assert.ok(relationship.tokens > budgeted.tierBudgets.high, "high tier should borrow unused global capacity");
ok("prompt tiers borrow unused capacity without crossing the global ceiling");

const hugeHistory = Array.from({ length: 18 }, (_, index) => ({
  role: index % 2 ? "assistant" : "user",
  content: `history-${index} ${"旧对话".repeat(420)}`,
}));
const pressureMessages = [
  { role: "system", content: `RELATIONSHIP-CONTRACT\n${"关系规则。".repeat(90)}` },
  ...hugeHistory,
  { role: "system", content: `ACTION-RESULT\n${"能力结果。".repeat(300)}` },
  { role: "user", content: `LATEST-USER\n${"这是本轮消息。".repeat(70)}` },
];
assert.throws(() => finalizeModelRequest(pressureMessages, { totalContextTokens: 4096, outputReserveTokens: 768 }), { code: "PROMPT_RECENT_EXCHANGE_TOO_LARGE" });
const finalized = finalizeModelRequest(pressureMessages, { totalContextTokens: 4608, outputReserveTokens: 768 });
assert.equal(finalized.ledger.withinBudget, true);
assert.ok(finalized.ledger.finalInputTokens <= finalized.ledger.inputLimit);
assert.ok(finalized.messages.some((message) => message.content.includes("LATEST-USER")));
assert.ok(finalized.messages.some((message) => message.content.startsWith("history-16 ")));
assert.ok(finalized.messages.some((message) => message.content.startsWith("history-17 ")));
assert.equal(finalized.maxOutputTokens, 768);
assert.throws(() => finalizeModelRequest([
  { role: "system", blockId: "character", content: "不可静默裁剪的人格。".repeat(900) },
  { role: "user", content: "本轮消息" },
], { totalContextTokens: 4096, outputReserveTokens: 768 }), { code: "PROMPT_REQUIRED_CONTEXT_TOO_LARGE" });
ok("final transport budget includes history, capability state, runtime context and output reserve");

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};
clearTurnTraces();
const trace = startTurnTrace({
  origin: "verify",
  input: { text: "测试", apiKey: "must-not-leak" },
});
assert.equal(getTurnTrace(trace.id)?.input?.apiKey, "[redacted]");
ok("turn trace redacts credentials before persistence and export");

const app = readFileSync(join(root, "src/app.js"), "utf8");
const chat = readFileSync(join(root, "src/panels/chat.js"), "utf8");
const assemble = readFileSync(join(root, "src/prompt/assemble.js"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");
const server = readFileSync(join(root, "server/index.mjs"), "utf8");
assert.match(app, /mountCompanionDebugConsole/);
assert.match(app, /buildCompanionDebugPreview/);
assert.match(app, /getRuntimeCatalog: collectRuntimeCatalog/);
assert.match(chat, /formatTurnActionContext/);
assert.match(chat, /finalizeModelRequest/);
assert.match(chat, /maxOutputTokens: finalized\.maxOutputTokens/);
assert.match(assemble, /buildPlatformCompanionContract\(langCtx\)/);
assert.match(assemble, /buildDeveloperEvidencePolicy\(langCtx\)/);
assert.match(assemble, /runtimeCapabilities/);
assert.match(assemble, /formatCapabilityRuntimeSnapshot/);
assert.doesNotMatch(
  assemble.slice(assemble.indexOf("platformSafety:"), assemble.indexOf("characterPackage:")),
  /capabilityPromptManifest/,
);
assert.match(assemble, /compileCharacterCore\(characterRecord/);
assert.match(assemble, /characterPackage: characterText/);
assert.match(chat, /turnResultFromDirectAction/);
assert.match(chat, /void requestCharacterReply\(\)/);
assert.match(html, /data-panel="debug"/);
assert.match(server, /max_tokens/);
ok("runtime, server transport and visible data-chain console are wired");

console.log("\nAll companion-runtime-v2 checks passed.");
