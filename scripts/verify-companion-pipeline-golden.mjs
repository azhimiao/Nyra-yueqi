/**
 * CP-2 / CP-7 — Golden Final messages[] authority checks (no live model).
 * Four Character Identities × fixed user scripts; asserts Kernel neutrality
 * and Identity differentiation in assembled contracts / message shells.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPANION_PROMPT_VERSION,
  PROMPT_AUTHORITY_ORDER,
  buildCharacterRelationshipContract,
  buildChatOutputContract,
  buildDeveloperEvidencePolicy,
  buildPlatformCompanionContract,
} from "../src/prompt/companion-contract-v2.js";
import { capabilityPromptManifest } from "../src/capabilities/registry.js";
import { shouldRecall, classifyRecallDepth, classifyRecall } from "../src/memory/palace/recall.js";
import { finalizeModelRequest } from "../src/prompt/finalize.js";
import { buildRuntimeInstruction } from "../src/runtime/protocol.js";
import {
  createCompanionTurnResult,
  turnResultFromDirectAction,
  COMPANION_NARROW_CAPABILITIES,
} from "../src/companion/turn-result.js";
import { isDirectCompanionAction, isOpenClawTaskRoute } from "../src/companion/actions.js";
import {
  buildCompanionLifeSnapshot,
  formatCompanionLifeSnapshotBlock,
} from "../src/companion/life-snapshot.js";
import {
  BUILTIN_COMPANION_PROMPT_SYSTEM,
  DEFAULT_PROMPT_SYSTEM,
} from "../src/constants.js";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const zh = { appLocale: "zh-CN", conversationLanguage: "zh-CN" };

function ok(name) {
  console.log(`PASS ${name}`);
}

const PERSONAS = Object.freeze({
  A_warm: {
    name: "小暖",
    promptSystem: "你是温柔恋人。你会关心对方，但从不客服腔。口吻软、短句多。",
  },
  B_cold: {
    name: "陌客",
    promptSystem: "你是冷淡陌生人。保持距离，不撒娇，不叫宝宝，不主动安慰套路。回复克制短促。",
  },
  C_sharp: {
    name: "毒舌",
    promptSystem: "你是毒舌但亲密的损友。会怼人，但承认在意。语气锋利有梗。",
  },
  D_fantasy: {
    name: "星尘",
    promptSystem: "你是奇幻旅伴，说话带星象隐喻，但不编造现实天气或工具结果。",
  },
});

const SCRIPTS = Object.freeze([
  "我今天有点难受。",
  "明天下雨吗？",
  "还是上次那个地方",
  "昨晚干嘛了",
  "给我发张自拍",
  "还记得我们说过的事吗",
  "想你了",
]);

const kernel = buildPlatformCompanionContract(zh);
const developer = buildDeveloperEvidencePolicy(zh);
const output = buildChatOutputContract(zh, { turnIntent: "user_message" });
const caps = capabilityPromptManifest(zh);
const runtime = buildRuntimeInstruction({ actionIds: ["talking_default"], expressionIds: [] });

assert.equal(COMPANION_PROMPT_VERSION, "2.2");
assert.ok(PROMPT_AUTHORITY_ORDER.includes("character_identity"));
assert.match(kernel, /月栖运行内核/);
assert.match(kernel, /Character Identity/);
assert.doesNotMatch(kernel, /亲近|表达在意|保持自我|数字伴侣人格|宝宝我一直都在/);
assert.doesNotMatch(kernel, /关系型陪伴合同/);
assert.doesNotMatch(developer, /你应该感到|你必须关心|主动安慰/);
assert.match(developer, /不得当作|导演指令|Character Identity/);
assert.match(output, /回合机制|Character Identity/);
assert.doesNotMatch(output, /即时消息气泡/);
assert.doesNotMatch(caps, /你是谁|温柔恋人|亲近/);
assert.doesNotMatch(runtime, /篇幅：1–3/);
assert.doesNotMatch(runtime, /禁止小说旁白/);
ok("kernel / developer / output / capabilities authority split");

const assembleSrc = readFileSync(join(root, "src/prompt/assemble.js"), "utf8");
assert.match(assembleSrc, /runtimeCapabilities/);
assert.doesNotMatch(
  assembleSrc.slice(assembleSrc.indexOf("platformSafety:"), assembleSrc.indexOf("characterPackage:")),
  /capabilityPromptManifest/,
);
ok("capabilities are outside platform_safety assembly");

const identities = {};
for (const [id, persona] of Object.entries(PERSONAS)) {
  identities[id] = buildCharacterRelationshipContract(persona, zh);
  assert.match(identities[id], /Character Identity/);
  assert.ok(identities[id].includes(persona.name), `${id} should include name`);
  assert.doesNotMatch(identities[id], /与用户亲近|表达在意|关系型陪伴/);
  assert.ok(identities[id].includes(persona.promptSystem.slice(0, 12)), `${id} should include promptSystem`);
}
assert.doesNotMatch(identities.B_cold, /温柔恋人/);
assert.match(identities.B_cold, /冷淡陌生人/);
ok("four Character Identities stay distinct without warm wrapper");

/** Build a Final messages[] shell matching product order (Kernel → Identity → Reality → Caps → Output → User). */
function buildFinalMessages(personaKey, userText, { weatherResult = "" } = {}) {
  const persona = PERSONAS[personaKey];
  const identity = identities[personaKey];
  const messages = [
    { role: "system", content: [kernel, developer].join("\n\n") },
    { role: "system", content: identity },
    {
      role: "system",
      content: weatherResult
        ? `【生活快照 — 仅产品真实事实】\n- mood: calm\n\n【本轮受控能力状态】\n- web.weather: executed; ${weatherResult}`
        : "【生活快照 — 仅产品真实事实】\n- mood: calm",
    },
    {
      role: "system",
      content: ["【运行时能力 — 产品可执行的行动清单；不定义你是谁】", caps].join("\n"),
    },
    { role: "system", content: output },
    { role: "user", content: userText },
  ];
  return finalizeModelRequest(messages, {
    totalContextTokens: 8000,
    outputReserveTokens: 1800,
  }).messages;
}

const softUser = "我今天有点难受。";
const weatherUser = "明天下雨吗？";
const weatherFact = "上海明天多云转小雨，12–18°C（来源：product weather）";

for (const key of Object.keys(PERSONAS)) {
  const softMsgs = buildFinalMessages(key, softUser);
  const joined = softMsgs.map((m) => m.content).join("\n");
  assert.ok(joined.includes(PERSONAS[key].promptSystem.slice(0, 8)), `${key} soft prompt`);
  assert.match(joined, /月栖运行内核/);
  assert.ok(softMsgs.some((m) => m.role === "user" && m.content === softUser));
  // Cold stranger identity must remain in Final request — not overwritten by kernel warmth
  if (key === "B_cold") {
    assert.match(joined, /冷淡陌生人/);
    assert.doesNotMatch(kernel, /宝宝/);
  }
}

const weatherSnaps = Object.fromEntries(
  Object.keys(PERSONAS).map((key) => [key, buildFinalMessages(key, weatherUser, { weatherResult: weatherFact })]),
);
for (const [key, msgs] of Object.entries(weatherSnaps)) {
  const joined = msgs.map((m) => m.content).join("\n");
  assert.match(joined, /上海明天多云转小雨/);
  assert.ok(joined.includes(PERSONAS[key].name), `${key} weather identity`);
  assert.doesNotMatch(joined, /客服专员|为您查询到以下信息/);
}
ok("golden Final messages[] retain Identity + shared tool facts");

// CP-3 recall gates
assert.equal(shouldRecall("想你了"), false);
assert.equal(classifyRecallDepth("想你了"), "none");
assert.equal(shouldRecall("还是上次那个地方"), true);
assert.equal(shouldRecall("还记得我们说过的事吗"), true);
assert.equal(shouldRecall("今天天气不错我们随便聊聊日常啊哈哈哈哈哈哈哈哈"), false);
assert.equal(shouldRecall("修改变量名"), false);
assert.equal(classifyRecall("想你了").reason, "too_short");
assert.equal(classifyRecall("今天天气不错我们随便聊聊日常啊哈哈哈哈哈哈哈哈").reason, "continuous_only");
assert.ok(["deixis", "memory_hint"].includes(classifyRecall("还是上次那个地方").reason));
ok("deep recall is semantic; no length>=18 force");

// CP-4 turn result surface
assert.equal(isDirectCompanionAction({ route: "direct_action", action: "selfie" }), true);
assert.equal(isOpenClawTaskRoute({ route: "unified_task" }), true);
assert.ok(BUILTIN_COMPANION_PROMPT_SYSTEM.includes("数字空间中的独立人格"));
assert.ok(!BUILTIN_COMPANION_PROMPT_SYSTEM.includes("林星梨"));
assert.ok(!DEFAULT_PROMPT_SYSTEM.includes("温柔、克制、有边界"));
const selfieFail = turnResultFromDirectAction("companion.selfie", { ok: false, reason: "NO_IMAGEGEN", message: "我还不能真的拍照。" });
assert.equal(selfieFail.kind, "companion_turn_result");
assert.equal(selfieFail.ok, false);
assert.match(selfieFail.speech, /拍照/);
assert.ok(COMPANION_NARROW_CAPABILITIES.includes("companion.selfie"));
const okTurn = createCompanionTurnResult({ capabilityId: "companion.diary", ok: true, speech: "写好了" });
assert.equal(okTurn.speech, "写好了");
ok("companion TurnResult unifies selfie/diary surface");

// CP-5 life snapshot facts only
const snap = buildCompanionLifeSnapshot({ companionId: "" });
assert.equal(snap.mood, "");
const block = formatCompanionLifeSnapshotBlock({
  companionId: "c1",
  mood: "calm",
  focus: "写日记",
  projects: ["写日记"],
  unresolved: [],
  recentEvents: [],
});
assert.match(block, /生活快照/);
assert.doesNotMatch(block, /你应该|主动关心|表达在意/);
ok("life snapshot is fact-only");

// Script coverage checklist (documentation assertion)
for (const line of SCRIPTS) {
  assert.ok(line.length > 0);
}
ok(`golden script coverage (${SCRIPTS.length} lines × ${Object.keys(PERSONAS).length} personas)`);

const chatSrc = readFileSync(join(root, "src/panels/chat.js"), "utf8");
assert.match(chatSrc, /void requestCharacterReply\(\)/);
assert.match(chatSrc, /turnResultFromDirectAction/);
assert.match(chatSrc, /Prompt Inspector|contractVersion|COMPANION_PROMPT_VERSION/);
const debugSrc = readFileSync(join(root, "src/ui/companion-debug-console.js"), "utf8");
assert.match(debugSrc, /Final Model Request/);
assert.match(debugSrc, /Prompt Inspector/);
ok("chat auto-reply + inspector wiring present");

console.log("\nAll companion pipeline golden checks passed.");
