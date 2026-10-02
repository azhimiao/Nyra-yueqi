/**
 * Runtime harden checks — Final messages[] pollution + recall whyRecall + life provenance.
 * No live model; proves authority split is visible in the assembled request shell.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCharacterRelationshipContract,
  buildChatOutputContract,
  buildDeveloperEvidencePolicy,
  buildPlatformCompanionContract,
} from "../src/prompt/companion-contract-v2.js";
import { capabilityPromptManifest } from "../src/capabilities/registry.js";
import { formatContinuityPromptBlock } from "../src/relationship/index.js";
import { formatTodayContextText } from "../src/temporal/today-context.js";
import { formatCompanionLifeSnapshotBlock } from "../src/companion/life-snapshot.js";
import { classifyRecall } from "../src/memory/palace/recall.js";
import { finalizeModelRequest } from "../src/prompt/finalize.js";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const zh = { conversationLanguage: "zh-CN" };

function ok(name) {
  console.log(`PASS ${name}`);
}

const POLLUTION_RE = /主动关心|表达在意|维持关系|陪你把今天过好|陪你轻松|关心用户|关注用户|宝宝我一直/;

const coldIdentitySrc = "你是冷淡陌生人。保持距离，不撒娇，不叫宝宝，不主动安慰套路。回复克制短促。";
const cold = buildCharacterRelationshipContract({
  name: "陌客",
  promptSystem: coldIdentitySrc,
}, zh);
const kernel = buildPlatformCompanionContract(zh);
const developer = buildDeveloperEvidencePolicy(zh);
const output = buildChatOutputContract(zh, { turnIntent: "user_message" });
const caps = capabilityPromptManifest(zh);
const life = formatCompanionLifeSnapshotBlock({
  companionId: "cold-1",
  mood: "warm",
  focus: "",
  projects: [],
  unresolved: [],
  recentEvents: ["user viewed diary: rain"],
  provenance: [{ kind: "artifact", source: "life.prompt_summary", text: "user viewed diary: rain" }],
});
const temporal = formatTodayContextText({
  snapshot: { localDate: "2026-08-10", localTime: "21:00", weekday: "Mon", timezone: "Asia/Shanghai" },
  confirmedItems: [],
  followUpItems: [{ title: "open promise", source: "timeline" }],
  observationItems: [],
});
const continuityEmpty = formatContinuityPromptBlock(null);
const continuitySoft = formatContinuityPromptBlock({
  recentSharedMoment: null,
  currentCareFocus: null,
  unresolvedMatter: null,
  characterIntentionToday: { text: "今天我想陪你轻松一点。" },
  openLoops: [],
  userBoundaries: [],
});

assert.doesNotMatch(kernel, POLLUTION_RE);
assert.doesNotMatch(developer, POLLUTION_RE);
assert.ok(cold.includes("冷淡陌生人"));
assert.ok(cold.includes(coldIdentitySrc.slice(0, 8)));
assert.ok(!cold.includes("温柔恋人"));
assert.equal(continuityEmpty, "");
assert.equal(continuitySoft, "");
assert.ok(temporal.includes("待跟进事项"));
assert.ok(!temporal.includes("需要后续关心"));
assert.ok(/作品事实|artifact/.test(life));
assert.ok(!life.includes("心情：warm"));
ok("Reality / Kernel / Identity reject director pollution");

const userText = "我今天有点难受。";
const messages = finalizeModelRequest([
  { role: "system", content: [kernel, developer].join("\n\n") },
  { role: "system", content: cold },
  { role: "system", content: [temporal, life].filter(Boolean).join("\n\n") },
  { role: "system", content: ["【运行时能力】", caps].join("\n") },
  { role: "system", content: output },
  { role: "user", content: userText },
], { totalContextTokens: 8000, outputReserveTokens: 1800 }).messages;

const joined = messages.map((m) => m.content).join("\n---\n");
assert.ok(joined.includes("冷淡陌生人"));
assert.ok(joined.includes("月栖运行内核"));
assert.doesNotMatch(joined, POLLUTION_RE);
assert.ok(messages.some((m) => m.role === "user" && m.content === userText));
console.log("\n--- Final messages[] snapshot (cold / 我今天有点难受。) ---\n");
messages.forEach((m, i) => {
  const preview = String(m.content || "").slice(0, 240).replace(/\n/g, " | ");
  console.log(`#${i + 1} ${m.role}: ${preview}${String(m.content || "").length > 240 ? "..." : ""}`);
});
ok("cold Final messages[] keep Identity; no platform warmth");

assert.equal(classifyRecall("想你了").whyRecall, "continuous_context_only");
assert.equal(classifyRecall("还是那里").whyRecall, "semantic_history_dependency");
assert.equal(classifyRecall("你不是说过你讨厌这个吗").whyRecall, "explicit_reference");
assert.equal(classifyRecall("今天天气不错我们随便聊聊日常啊哈哈哈哈哈哈哈哈").whyRecall, "continuous_context_only");
ok("whyRecall is structured");

const appSrc = readFileSync(join(root, "src/app.js"), "utf8");
assert.ok(appSrc.includes("frozenCharacterId"));
assert.ok(appSrc.includes("collectCharacterProfile(frozenCharacterId)"));
const chatSrc = readFileSync(join(root, "src/panels/chat.js"), "utf8");
assert.ok(chatSrc.includes("completedUserTurnIds"));
assert.ok(chatSrc.includes("schedulePendingReplyChain"));
assert.ok(chatSrc.includes("turnExecutionId"));
ok("frozen prompt texts + reply chain + turnExecutionId wired");

console.log("\nAll runtime-harden checks passed.");
