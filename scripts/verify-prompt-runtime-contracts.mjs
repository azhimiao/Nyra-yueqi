/** Prompt/runtime contracts for truth provenance, feature knowledge and tools. */
import assert from "node:assert/strict";
import {
  buildCapabilityRuntimeSnapshot,
  formatCapabilityRuntimeSnapshot,
} from "../src/capabilities/runtime-snapshot.js";
import { requestableOpenAiTools } from "../src/tools/openai-tools.js";
import { claimsCompletionWithoutReceipt } from "../src/tools/companion-tool-loop.js";
import { assembleCanonical, buildModelMessages } from "../src/prompt/assemble.js";
import {
  buildChatOutputContract,
  buildDeveloperEvidencePolicy,
  buildOpeningSceneState,
} from "../src/prompt/companion-contract-v2.js";
import { formatDailyStatusBlock } from "../src/prompt/assemble.js";
import { fetchWeather } from "../src/status/weather.js";
import {
  canSupersedeTruthEnvelope,
  createTruthEnvelopeV1,
  promoteInferredTruth,
  validateTruthEnvelopeV1,
} from "../src/contracts/truth-envelope-v1.js";
import {
  featureKnowledgeOperationIds,
  formatFeatureKnowledge,
  selectFeatureKnowledge,
} from "../src/world/feature-knowledge-registry.js";
import { buildExternalContext } from "../src/integrations/context.js";
import { buildModeContribution } from "../src/prompt/mode-contributions.js";

const origin = createTruthEnvelopeV1({
  truthDomain: "character_canon",
  status: "active",
  characterId: "char-1",
  provenance: {
    sourceType: "authored_origin_memory",
    sourceId: "origin-1",
    authoredBy: "character_author",
    confidence: 1,
  },
});
assert.equal(validateTruthEnvelopeV1(origin).ok, true);
assert.equal(origin.truthDomain, "character_canon");
assert.equal(origin.status, "active");

const inference = createTruthEnvelopeV1({
  truthDomain: "inferred_candidate",
  characterId: "char-1",
  provenance: { sourceType: "inference", sourceId: "candidate-1", authoredBy: "system" },
});
assert.equal(inference.status, "candidate");
const promoted = promoteInferredTruth(inference, ["turn-1"]);
assert.equal(promoted.truthDomain, "lived_product_fact");
assert.equal(promoted.status, "active");
assert.equal(canSupersedeTruthEnvelope(promoted, origin), true);

const featureRows = selectFeatureKnowledge({ query: "请帮我写今天的日记", appId: "pop" });
assert.equal(featureRows.some((row) => row.featureId === "diary"), true);
assert.equal(featureRows.some((row) => row.featureId === "games"), false);
const operationIds = featureKnowledgeOperationIds(featureRows);
const snapshot = buildCapabilityRuntimeSnapshot({
  networkOnline: true,
  foreground: true,
  featureFlags: { webRetrievalV1: false },
}, { snapshotId: "cap-test" });
const diaryState = snapshot.operations.find((row) => row.operationId === "companion.diary.create");
assert.equal(diaryState?.known, true);
assert.equal(diaryState?.requestable, true);
assert.equal(diaryState?.executable, true);

const tools = requestableOpenAiTools({ capabilityRuntimeSnapshot: snapshot });
assert.equal(tools.some((tool) => tool.function.name === "companion_diary__create"), true);
const idleTools = requestableOpenAiTools({ capabilityRuntimeSnapshot: snapshot, operationIds: [] });
assert.equal(idleTools.length, 0);
const diaryTools = requestableOpenAiTools({ capabilityRuntimeSnapshot: snapshot, operationIds });
assert.deepEqual(diaryTools.map((tool) => tool.function.name), ["companion_diary__create"]);
const relevantText = formatCapabilityRuntimeSnapshot(snapshot, "zh-CN", operationIds);
assert.match(relevantText, /companion\.diary\.create/);
assert.doesNotMatch(relevantText, /calendar\.create/);
const featureText = formatFeatureKnowledge(featureRows, "zh-CN");
assert.match(featureText, /requestable=true/);
assert.match(featureText, /write=DiaryRepository/);

const canonical = assembleCanonical({
  semantic: true,
  platformSafety: "PLATFORM",
  characterPackage: "CHARACTER_ONLY",
  userPersona: "RELATIONSHIP_ONLY",
  worldInfo: "WORLD_BEFORE",
  worldInfoAfter: "WORLD_AFTER",
  longTermMemory: "MEMORY_ONLY",
  postHistoryContract: "REPLY_CONTRACT",
  userInput: "LATEST_USER",
});
assert.equal(canonical.blocks.some((block) => block.id === "character_package"), false);
assert.equal(canonical.legacyBlocks.some((block) => block.id === "character_package"), true);
assert.equal(canonical.totalUsed, canonical.blocks.reduce((sum, block) => sum + Number(block.tokens || 0), 0));
const messages = await buildModelMessages({
  canonical,
  historyMessages: [
    { role: "user", content: "HISTORY_USER" },
    { role: "assistant", content: "HISTORY_ASSISTANT" },
  ],
  turnIntent: "user_message",
}, "LATEST_USER", "verify-semantic");
const beforeIndex = messages.findIndex((item) => String(item.content).includes("WORLD_BEFORE"));
const historyIndex = messages.findIndex((item) => String(item.content).includes("HISTORY_ASSISTANT"));
const afterIndex = messages.findIndex((item) => String(item.content).includes("WORLD_AFTER"));
const latestIndex = messages.findIndex((item) => String(item.content).includes("LATEST_USER"));
assert.ok(beforeIndex >= 0 && beforeIndex < historyIndex);
assert.ok(afterIndex > historyIndex && afterIndex < latestIndex);
assert.equal(messages.filter((item) => String(item.content).includes("CHARACTER_ONLY")).length, 1);
assert.equal(messages.at(-1).role, "user");

const chatOutputContract = buildChatOutputContract({ conversationLanguage: "zh-CN" });
assert.match(chatOutputContract, /回合机制/);
assert.match(chatOutputContract, /篇幅与形式不限/);
assert.match(chatOutputContract, /不得先声称完成/);
assert.doesNotMatch(chatOutputContract, /即时消息气泡/);

assert.equal(claimsCompletionWithoutReceipt("写好啦，你看看", [{ status: "failed" }]), true);
assert.equal(claimsCompletionWithoutReceipt("还没有写入档案", [{ status: "failed" }]), false);

const catalogTrack = { title: "Chopin - Nocturne", artist: "Chopin" };
const unrelatedCatalog = buildExternalContext({
  grants: { music: true },
  library: { tracks: [catalogTrack] },
  query: "what do you remember",
  recentPlays: [],
  coReadAnchor: null,
});
assert.deepEqual(unrelatedCatalog, []);
const relatedCatalog = buildExternalContext({
  grants: { music: true },
  library: { tracks: [catalogTrack] },
  query: "Chopin music",
  recentPlays: [],
  coReadAnchor: null,
});
assert.match(relatedCatalog[0] || "", /not a shared experience|共同经历|长期记忆/i);

const unreadShelf = buildExternalContext({
  grants: { music: true },
  library: { books: [] },
  query: "刚忙完，你在干嘛？",
  recentPlays: [],
  coReadAnchor: {
    title: "那里怎么样",
    chapter: "梦境短篇",
    progress: "未读",
    excerpt: "一个从黑暗中的女人与孩童开始，随后转向集市。",
  },
});
assert.equal(
  unreadShelf.some((line) => /一起看|那里怎么样/.test(line)),
  false,
  "unread builtin shelf must not become 一起看",
);
const livedRead = buildExternalContext({
  grants: { music: true },
  library: { books: [] },
  query: "刚忙完，你在干嘛？",
  recentPlays: [],
  coReadAnchor: {
    title: "挪威的森林",
    chapter: "第 12 章",
    progress: "12%",
    excerpt: "我在深夜的电车上想起了那片森林。",
    lived: true,
  },
});
assert.match(livedRead[0] || "", /一起看|Reading together/);

const firstTurnMode = buildModeContribution("chat", { firstSpokenTurn: true }).text;
assert.match(firstTurnMode, /第一句/);
assert.doesNotMatch(firstTurnMode, /延续真实历史/);
const laterMode = buildModeContribution("chat", { firstSpokenTurn: false }).text;
assert.doesNotMatch(laterMode, /第一句/);
assert.doesNotMatch(laterMode, /未完成/);
assert.match(laterMode, /日常聊天/);
const laterPopMode = buildModeContribution("pop", { firstSpokenTurn: false }).text;
assert.doesNotMatch(laterPopMode, /第一句/);
assert.doesNotMatch(laterPopMode, /未完成事项/);
assert.match(laterPopMode, /Pop 私密即时通讯/);
assert.match(buildModeContribution("deskpet").text, /桌宠在场回应/);

const idleGrants = buildExternalContext({
  grants: { calendar: true, location: true, album: true, notification: true },
  library: {
    events: [],
    photos: [{ title: "雨夜窗边", summary: "雨夜里靠窗的暖光" }],
    notificationSettings: { dndStart: "22:00", dndEnd: "08:00" },
  },
  query: "刚忙完，你在干嘛？",
  locationLabel: "用户当前位置",
});
assert.equal(
  idleGrants.some((line) => /日历|今日空闲|相册|通知：已授权|位置：/.test(line)),
  false,
  "empty calendar/album/location/notification must not leak into ordinary turns",
);

const albumAsk = buildExternalContext({
  grants: { album: true },
  library: { photos: [{ title: "雨夜窗边", summary: "雨夜里靠窗的暖光" }] },
  query: "看看相册",
});
assert.match(albumAsk[0] || "", /设备相册目录|不是共同经历/);

const idleDaily = formatDailyStatusBlock({
  mood: "平静",
  asleep: false,
  sleepAt: "03:00",
  wakeAt: "10:30",
  location: "用户当前位置",
  weather: { available: false, label: "天气不可用", source: "unavailable" },
  yesterdayTone: "",
});
assert.doesNotMatch(idleDaily, /用户环境|雨|用户当前位置|昨日对话基调/);
const livedDaily = formatDailyStatusBlock({
  mood: "安静",
  asleep: false,
  sleepAt: "23:00",
  wakeAt: "07:00",
  location: "杭州",
  weather: { available: true, label: "小雨 18°", source: "open-meteo" },
  yesterdayTone: "温和",
});
assert.match(livedDaily, /用户环境：杭州 小雨 18°/);
assert.match(livedDaily, /昨日对话基调：温和/);

const factoryWeather = await fetchWeather("用户当前位置", "手动天气", "雨 20°");
assert.equal(factoryWeather.available, false, "factory rain placeholder is not lived weather");
const emptyManual = await fetchWeather("杭州", "手动天气", "");
assert.equal(emptyManual.available, false, "empty manual weather is not invented cloudy");

const opening = buildOpeningSceneState({ conversationLanguage: "zh-CN" }, true);
assert.match(opening, /没有活动记录时，不要声称/);
assert.match(opening, /书架、相册、默认日常状态、开场白都不是已经发生的活动证据/);
assert.match(opening, /明确的作者虚构场景仍可扮演/);
assert.equal(buildOpeningSceneState({ conversationLanguage: "zh-CN" }, false), "");
const evidencePolicy = buildDeveloperEvidencePolicy({ conversationLanguage: "zh-CN" });
assert.match(evidencePolicy, /设备目录与默认日常占位不(?:能)?证明正在听、正在读或周围天气/);
assert.match(evidencePolicy, /不把虚构世界补成真实聊天前情|作者设定属于约定的虚构世界，不补成用户没聊过的前情/);

const alreadyAte = selectFeatureKnowledge({ query: "I already ate", appId: "pop" });
assert.equal(
  alreadyAte.some((row) => row.featureId === "co-read"),
  false,
  "English 'already' must not match the 'read' tool trigger",
);

const pausedIdle = buildExternalContext({
  grants: { music: true },
  library: { tracks: [] },
  query: "刚忙完，你在干嘛？",
  nowPlaying: { title: "雨后低频", playlist: "睡前", coListen: true, paused: true },
  recentPlays: [],
});
assert.equal(
  pausedIdle.some((line) => /一起听|雨后低频/.test(line)),
  false,
  "a paused leftover track is not current activity on an ordinary turn",
);
const pausedAsk = buildExternalContext({
  grants: { music: true },
  library: { tracks: [] },
  query: "还在听这首吗",
  nowPlaying: { title: "雨后低频", playlist: "睡前", coListen: true, paused: true },
  recentPlays: [],
});
assert.equal(
  pausedAsk.some((line) => /雨后低频/.test(line)),
  true,
  "an explicit music question may still see the paused track",
);

console.log("verify-prompt-runtime-contracts: PASS");
