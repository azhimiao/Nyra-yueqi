import {
  CHAT_HISTORY_LIMIT,
  CHAT_TOKEN_BUDGET,
  DEFAULT_INJECTION_ORDER,
  DEFAULT_PROMPT_DEVELOPER,
  DEFAULT_PROMPT_SYSTEM,
  DEFAULT_SESSION_ID,
} from "../constants.js";
import { isFeatureEnabled } from "../features/flags.js";
import { t } from "../i18n/index.js";
import { escapeHtml, estimateTextTokens } from "../lib/utils.js";
import { trimMemoriesToBudget, budgetFromSetting } from "../memory/tiers.js";
import { formatKgBlock } from "../memory/palace/kg.js";
import { relationshipIdFor, rowMatchesCompanionScope } from "../memory/companion-scope.js";
import { getPalaceSettings, getPromptSettings, getRagSettings } from "../settings/preferences.js";
import { getMessagesBySession } from "../storage/db.js";
import { filterInjectionOrder, normalizeSceneAppId, sceneAppLabel, shouldInjectCohabit } from "./scene-tags.js";
import { formatCohabitTimelineBlock } from "../memory/cohabit-timeline.js";
import { formatLifePromptSummary } from "../life/prompt.js";
import { formatScenarioExperiencePromptBlock } from "../companion/scenario-memory-bridge.js";
import { formatSidewriteTimelineBlock } from "../sidewrite/projection-format.js";
import { matchWorldbookEntries } from "../worldbook/match.js";
import { activateWorldInfo, formatLoreActivationTexts } from "../worldbook/activation.js";
import {
  adaptAuthoredNyraThirdPerson,
  genderVoiceFromCharacter,
  isNyraInitialWorldbook,
  isNyraOriginMemory,
} from "../characters/gender-identity.js";
import { loadContextGraphPromptBlock } from "../context/hot-path.js";
import { applyBudget } from "./budget.js";
import { inspectPromptBlocks } from "./inspector.js";
import { buildModeContribution, normalizePromptMode } from "./mode-contributions.js";
import { isFirstSpokenTurn, splitTurnHistory } from "./first-spoken-turn.js";
import { buildContextEnvelope } from "../context/broker.js";
import { parseTokenMessage } from "../chat/token-message.js";
import { buildLanguageContext, formatLanguageDirective, outputLanguageRule } from "../i18n/language-context.js";
import { companionDefaultSystem, companionDefaultDeveloper } from "../prompts/registry.js";
import { ensureLanguagePrefsMigrated } from "../i18n/language-prefs.js";
import { createTemporalSnapshotV1 } from "../contracts/temporal-snapshot-v1.js";
import { buildTodayContext } from "../temporal/today-context.js";
import { listTimelineEvents } from "../timeline/repository.js";
import {
  formatContinuityPromptBlock,
  getOrProjectContinuity,
  refreshRelationshipContinuity,
} from "../relationship/index.js";
import {
  COMPANION_PROMPT_VERSION,
  PROMPT_AUTHORITY_ORDER,
  buildDeveloperEvidencePolicy,
  buildOpeningSceneState,
  buildCharacterRelationshipContract,
  buildChatOutputContract,
  buildPlatformCompanionContract,
} from "./companion-contract-v2.js";
import {
  isLivedDailyWeather,
  isPlaceholderStatusLocation,
} from "../status/weather.js";
import {
  buildDeviceCapabilitySnapshot,
  formatDeviceCapabilitySnapshot,
} from "../capabilities/device-snapshot.js";
import {
  buildCapabilityRuntimeSnapshot,
  formatCapabilityRuntimeSnapshot,
} from "../capabilities/runtime-snapshot.js";
import {
  featureKnowledgeOperationIds,
  formatFeatureKnowledge,
  selectFeatureKnowledge,
} from "../world/feature-knowledge-registry.js";
import {
  formatGameObservationBlock,
  getGameContextExtension,
} from "../games/adapters/context-slot.js";
import { ensurePopDuoObservation } from "../games/adapters/pop-duo.js";
import {
  resolveCharacterIdentityFromRecord,
  resolvePromptTextsFromCharacter,
} from "./prompt-source.js";
import { compileCharacterCore } from "./character-identity-v2.js";
import { buildRelationshipContractV2 } from "./relationship-contract-v2.js";
import { buildNyraBaseWorld, buildYueqiHabitat } from "../world/base-world.js";
import { createTruthEnvelopeV1 } from "../contracts/truth-envelope-v1.js";

ensureLanguagePrefsMigrated();

/**
 * Prompt Authority (). Slot IDs stay 16-canonical; semantics follow:
 * Kernel (platform_safety) → Identity (character_package) → Reality →
 * Retrieved/History → Runtime Capabilities (near-turn, not in Kernel).
 * @see PROMPT_AUTHORITY_ORDER
 */
void PROMPT_AUTHORITY_ORDER;

async function loadCalendarEventsForTodayContext() {
  try {
    if (typeof globalThis.__YUEQI_LIST_EVENTS__ === "function") {
      return globalThis.__YUEQI_LIST_EVENTS__() || [];
    }
    const mod = await import("../phone-shell/phone-data.js");
    return mod.listEvents?.() || [];
  } catch {
    return [];
  }
}


function localizedBaseSystem() {
  const lang = buildLanguageContext();
  return companionDefaultSystem(lang);
}

function localizedBaseDeveloper() {
  return companionDefaultDeveloper(buildLanguageContext());
}

function resolveBaseSystem() {
  return localizedBaseSystem() || DEFAULT_PROMPT_SYSTEM;
}

function isCanonicalStoredPrompt(kind, value) {
  const raw = String(value || "").trim();
  if (!raw) return true;
  const zh = kind === "system"
    ? companionDefaultSystem({ conversationLanguage: "zh-CN" })
    : companionDefaultDeveloper({ conversationLanguage: "zh-CN" });
  const en = kind === "system"
    ? companionDefaultSystem({ conversationLanguage: "en-US" })
    : companionDefaultDeveloper({ conversationLanguage: "en-US" });
  const constant = kind === "system" ? DEFAULT_PROMPT_SYSTEM : DEFAULT_PROMPT_DEVELOPER;
  return raw === zh || raw === en || raw === constant;
}

/** Stock / empty character prompts stay empty — the kernel lives in platform_safety. */
function resolveStoredPrompt(kind, stored) {
  if (isCanonicalStoredPrompt(kind, stored)) return "";
  return String(stored || "").trim();
}

function languageSystemSuffix() {
  const lang = buildLanguageContext();
  return `${formatLanguageDirective(lang)}\n${outputLanguageRule(lang)}`;
}

/**
 * Fixed assembly order — contract §6.1. Unit-tested; do not reorder casually.
 */
export const CANONICAL_BLOCK_ORDER = Object.freeze([
  "platform_safety",
  "character_package",
  "user_persona",
  "temporal_context",
  "relationship_continuity",
  "relationship_state",
  "mode_context",
  "experience_package",
  "opening_scene_state",
  "world_info",
  "long_term_memory",
  "branch_summary",
  "branch_history",
  "world_info_after",
  "user_input",
  "post_history_contract",
]);

/**
 * Model-facing semantic order. The legacy 16 slots remain available for
 * compatibility, inspection, and source attribution; this is the shape that
 * the companion model actually receives.
 */
export const SEMANTIC_BLOCK_ORDER = Object.freeze([
  "platform_safety",
  "character",
  "relationship_context",
  "world_context",
  "relevant_memories",
  "runtime_context",
  "branch_summary",
  "world_context_after",
  "post_history_contract",
  "user_input",
]);

function experiencePostHistoryContract(lang) {
  if (lang?.conversationLanguage === "en-US") {
    return [
      "Output contract: return the agreed JSON only; suggestedActions 0–3 natural suggestions, never node IDs.",
      "scenePatch whitelist fields only; memorySignals are candidates and must not write permanent memory directly.",
      "One structure repair is allowed on parse failure; if still invalid, enter an explicit error state — never advance with canned dialogue.",
    ].join("\n");
  }
  return [
    "输出契约：只返回约定 JSON；suggestedActions 0–3 条自然建议，禁止节点 ID。",
    "scenePatch 仅白名单字段；memorySignals 只是候选，不得直接写永久记忆。",
    "解析失败时允许一次结构修复；仍失败则进入显式错误态，禁止固定台词兜底推进。",
  ].join("\n");
}

/** Pop / daily chat: turn mechanics only (style owned by Character Identity). */
function chatPostHistoryContract(lang) {
  return buildChatOutputContract(lang);
}

const EXPERIENCE_POST_HISTORY_CONTRACT = experiencePostHistoryContract({ conversationLanguage: "zh-CN" });
const CHAT_POST_HISTORY_CONTRACT = chatPostHistoryContract({ conversationLanguage: "zh-CN" });

/** @deprecated 旧名指向情景契约；日常聊天请用 CHAT_POST_HISTORY_CONTRACT */
const DEFAULT_POST_HISTORY_CONTRACT = EXPERIENCE_POST_HISTORY_CONTRACT;

function truthLabelForMemory(memory = {}) {
  const source = String(memory.source || "").trim();
  const authoredOrigin = source === "character.history"
    || memory.sourceType === "authored_origin_memory"
    || memory.sourceRef?.truthDomain === "character_canon";
  const truthDomain = authoredOrigin
    ? "character_canon"
    : (source === "diary.memory" || source === "chat.memory"
      ? "lived_product_fact"
      : (source === "character.canon" ? "character_canon" : "inferred_candidate"));
  const sourceType = authoredOrigin
    ? "authored_origin_memory"
    : (source === "diary.memory"
      ? "diary"
      : (source === "chat.memory" ? "conversation" : "inference"));
  const envelope = createTruthEnvelopeV1({
    truthDomain,
    status: truthDomain === "inferred_candidate" ? "candidate" : "active",
    characterId: memory.characterId || memory.companionId || "",
    relationshipId: memory.relationshipId || "",
    salience: memory.pinned ? "high" : "normal",
    provenance: {
      sourceType,
      sourceId: memory.id || source,
      authoredBy: authoredOrigin
        ? "character_author"
        : (sourceType === "inference" ? "system" : "product"),
      createdAt: memory.createdAt || new Date().toISOString(),
      confidence: truthDomain === "inferred_candidate" ? 0.4 : 1,
    },
  });
  return `${envelope.truthDomain}/${envelope.status}`;
}

function adaptNyraSeededWorldbook(entries, characterRecord) {
  const voice = genderVoiceFromCharacter(characterRecord);
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    if (!isNyraInitialWorldbook(entry)) return entry;
    return { ...entry, content: adaptAuthoredNyraThirdPerson(entry.content, voice) };
  });
}

function adaptNyraOriginMemories(memories, characterRecord) {
  const voice = genderVoiceFromCharacter(characterRecord);
  return (Array.isArray(memories) ? memories : []).map((memory) => {
    if (!isNyraOriginMemory(memory)) return memory;
    return { ...memory, rawText: adaptAuthoredNyraThirdPerson(memory.rawText, voice) };
  });
}

function buildMemoryBlock(memories, { palaceSkipped = false, kgBlock = "", wakeUpBlock = "" } = {}) {
  // Global palaceSessionDiary must not be injected as companion memory (CPE W4).
  const sessionDiary = "";
  const header = palaceSkipped
    ? "本轮未触发宫殿检索（Recall Protocol）。"
    : "宫殿检索（原文 verbatim）：";
  const parts = [];

  if (wakeUpBlock) {
    parts.push(wakeUpBlock);
    parts.push("");
  }

  if (!memories.length) {
    parts.push(
      palaceSkipped
        ? header
        : "本轮没有检索到可核实的过去。若角色被问到经历或共同回忆，必须明确说不知道或没有记录，不得把推测、模型常识或新编内容说成已经发生。",
    );
  } else {
    parts.push(header);
    parts.push(
      memories
        .map(
          (memory, index) => {
            const chunkHint =
              memory.chunkTotal > 1
                ? ` · chunk ${(memory.chunkIndex ?? 0) + 1}/${memory.chunkTotal}`
                : "";
            return `${index + 1}. [${memory.wing || "?"}.${memory.room || "?"} / ${memory.source}${chunkHint}; truth=${truthLabelForMemory(memory)}] ${memory.rawText}`;
          }
        )
        .join("\n")
    );
  }

  if (kgBlock) {
    parts.push("");
    parts.push(kgBlock);
  }
  if (sessionDiary) {
    parts.push("");
    parts.push(sessionDiary);
  }
  return parts.join("\n");
}

function asksForPastMemory(query = "") {
  return /(记得|记忆|回忆|以前|之前|过去|经历|聊天记录|共同发生|remember|memory|past|before)/i.test(
    String(query || ""),
  );
}

function buildWorldBlock(worldbook) {
  if (!worldbook.length) return "无命中世界书。";
  return worldbook
    .map(
      (entry, index) =>
        `${index + 1}. [${entry.category} / ${entry.injectSlot} / priority ${entry.priority}] ${entry.title}: ${entry.content}`
    )
    .join("\n");
}

export function formatDailyStatusBlock(dailyStatus) {
  if (!dailyStatus) return "今日状态注入关闭。";
  const parts = [
    `AI状态：${dailyStatus.mood || "平静"}`,
    `睡眠：${dailyStatus.asleep ? "睡眠中/被叫醒" : "清醒"}`,
    `作息：${dailyStatus.sleepAt}-${dailyStatus.wakeAt}`,
  ];
  const location = String(dailyStatus.location || "").trim();
  const livedLocation = Boolean(location) && !isPlaceholderStatusLocation(location);
  const livedWeather = isLivedDailyWeather(dailyStatus.weather);
  if (livedWeather || livedLocation) {
    const env = [
      livedLocation ? location : "",
      livedWeather ? String(dailyStatus.weather?.label || "").trim() : "",
    ].filter(Boolean).join(" ");
    if (env) parts.push(`用户环境：${env}`);
  }
  const tone = String(dailyStatus.yesterdayTone || "").trim();
  if (tone) parts.push(`昨日对话基调：${tone}`);
  return parts.join("；");
}

function buildDailyBlock(dailyStatus) {
  return formatDailyStatusBlock(dailyStatus);
}

function buildCharacterBlock(character) {
  return buildCharacterRelationshipContract(character, buildLanguageContext());
}

function mergeUniqueText(parts = []) {
  const seen = new Set();
  const output = [];
  for (const part of Array.isArray(parts) ? parts : []) {
    const text = String(part || "").trim();
    if (!text) continue;
    const key = text.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }
  return output.join("\n\n");
}

function semanticSection(label, text) {
  const value = String(text || "").trim();
  return value ? `[${label}]\n${value}` : "";
}

/**
 * Collapse the legacy slot bag into the small semantic surface used by the
 * model. This is a prompt projection only; source stores and legacy slots do
 * not move or change.
 */
export function buildSemanticPromptBlocks(bag = {}) {
  const relationship = mergeUniqueText([
    bag.userPersona,
    bag.temporalContext,
    bag.relationshipContinuity,
    bag.relationshipState,
    bag.modeContext,
    bag.experiencePackage,
    bag.openingSceneState,
    bag.currentSituation,
  ]);
  const world = mergeUniqueText([bag.worldInfo]);
  const worldAfter = semanticSection("World (after conversation history)", bag.worldInfoAfter);
  const memories = String(
    String(bag.relevantMemories ?? "").trim()
      || String(bag.longTermMemory ?? "").trim(),
  );
  const runtime = String(bag.runtimeContext ?? "").trim();

  const texts = {
    platform_safety: String(bag.platformSafety ?? "").trim(),
    character: semanticSection("Character", bag.characterPackage),
    relationship_context: semanticSection("Relationship & Current Situation", relationship),
    world_context: semanticSection("World", world),
    relevant_memories: semanticSection("Relevant Memories", memories),
    runtime_context: semanticSection("Runtime Context", runtime),
    branch_summary: semanticSection("Branch Summary", bag.branchSummary),
    world_context_after: worldAfter,
    post_history_contract: String(bag.postHistoryContract ?? DEFAULT_POST_HISTORY_CONTRACT).trim(),
    user_input: String(bag.userInput ?? "").trim(),
  };

  return SEMANTIC_BLOCK_ORDER.map((id) => ({
    id,
    text: texts[id] || "",
    source: bag.semanticSources?.[id] || `semantic.${id}`,
  }));
}

function semanticSystemText(blocks = []) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block?.text && !["runtime_context", "world_context_after", "post_history_contract", "user_input"].includes(block.id))
    .map((block) => block.text)
    .join("\n\n");
}

function semanticBlockText(blocks = [], id) {
  return (Array.isArray(blocks) ? blocks : []).find((block) => block?.id === id)?.text || "";
}

function buildGroupRosterSection(compiled) {
  return compiled?.groupRoster ? String(compiled.groupRoster) : "";
}

function buildExternalBlock(externalContext) {
  if (!externalContext.length) return "外部能力授权：无";
  return [
    "外部设备与服务事实（只描述当前授权数据或可用资源；不是角色记忆，也不是用户与角色共同经历）:",
    ...externalContext.map((item) => `- ${item}`),
    "除非聊天历史或成功工具回执明确证明，否则不要把这些目录、候选资源或当前设备状态说成曾经发生过的共同事件。",
  ].join("\n");
}

const MEMORY_CONTEXT_BLOCK_IDS = new Set(["stable_memory", "context_graph", "palace_memory"]);

function isMemoryContextBlock(block) {
  const id = String(block?.id || "");
  const source = String(block?.source || "");
  return MEMORY_CONTEXT_BLOCK_IDS.has(id) || source.startsWith("memory.");
}

function formatEnvelopeSubset(envelope, predicate) {
  const values = (Array.isArray(envelope?.blocks) ? envelope.blocks : [])
    .filter((block) => block?.id !== "branch_summary" && predicate(block))
    .map((block) => String(block.text || "").trim())
    .filter(Boolean);
  const merged = mergeUniqueText(values);
  return merged;
}

const SECTION_BUILDERS = {
  character: (compiled) => {
    const base = buildCharacterBlock(compiled.character);
    const roster = buildGroupRosterSection(compiled);
    return roster ? `${base}\n\n${roster}` : base;
  },
  worldbook: (compiled) => (isFeatureEnabled("worldbook") ? `命中的世界书：\n${buildWorldBlock(compiled.worldbook)}` : ""),
  memory: (compiled) =>
    isFeatureEnabled("memoryRag")
      ? `检索到的可用记忆：\n${buildMemoryBlock(compiled.memories, {
          palaceSkipped: compiled.palaceSkipped,
          kgBlock: compiled.kgBlock,
          wakeUpBlock: compiled.wakeUpBlock,
        })}`
      : "",
  daily: (compiled) => buildDailyBlock(compiled.dailyStatus),
  external: (compiled) => (isFeatureEnabled("external") ? buildExternalBlock(compiled.externalContext) : ""),
};

export function formatCompiledPreview(compiled) {
  return `system: ${compiled.promptSystem || compiled.system}
developer: ${compiled.promptDeveloper || "-"}
character: ${compiled.character?.name || "-"} · call_user_as: ${compiled.character?.alias || "-"}
daily_status: ${
    compiled.dailyStatus
      ? `${compiled.dailyStatus.mood}, ${compiled.dailyStatus.asleep ? "asleep" : "awake"}, ${compiled.dailyStatus.weather?.label || ""}, ${compiled.dailyStatus.sleepAt}-${compiled.dailyStatus.wakeAt}`
      : "off"
  }
history_turns: ${compiled.historyTurns ?? 0}`;
}

/**
 * Build ordered canonical blocks from a contribution bag (pure).
 * @param {{
 *   platformSafety?: string,
 *   characterPackage?: string,
 *   userPersona?: string,
 *   temporalContext?: string,
 *   relationshipContinuity?: string,
 *   relationshipState?: string,
 *   modeContext?: string,
 *   experiencePackage?: string,
 *   openingSceneState?: string,
 *   worldInfo?: string,
 *   longTermMemory?: string,
 *   branchSummary?: string,
 *   branchHistory?: string,
 *   worldInfoAfter?: string,
 *   userInput?: string,
 *   postHistoryContract?: string,
 *   sources?: Record<string, string>,
 * }} bag
 * @returns {Array<{ id: string, text: string, source: string }>}
 */
export function buildCanonicalBlocks(bag = {}) {
  const sources = bag.sources || {};
  /** @type {Record<string, string>} */
  const texts = {
    platform_safety: String(bag.platformSafety ?? ""),
    character_package: String(bag.characterPackage ?? ""),
    user_persona: String(bag.userPersona ?? ""),
    temporal_context: String(bag.temporalContext ?? ""),
    relationship_continuity: String(bag.relationshipContinuity ?? ""),
    relationship_state: String(bag.relationshipState ?? ""),
    mode_context: String(bag.modeContext ?? ""),
    experience_package: String(bag.experiencePackage ?? ""),
    opening_scene_state: String(bag.openingSceneState ?? ""),
    world_info: String(bag.worldInfo ?? ""),
    long_term_memory: String(bag.longTermMemory ?? ""),
    branch_summary: String(bag.branchSummary ?? ""),
    branch_history: String(bag.branchHistory ?? ""),
    world_info_after: String(bag.worldInfoAfter ?? ""),
    user_input: String(bag.userInput ?? ""),
    post_history_contract: String(bag.postHistoryContract ?? DEFAULT_POST_HISTORY_CONTRACT),
  };

  return CANONICAL_BLOCK_ORDER.map((id) => ({
    id,
    text: texts[id] || "",
    source: sources[id] || "canonical",
  }));
}

/**
 * Canonical Assembler entry — fixed order + budget + inspector (§6.1 / §6.2).
 * @param {Parameters<typeof buildCanonicalBlocks>[0] & {
 *   totalBudget?: number,
 *   mode?: string,
 *   loreTrace?: object|null,
 * }} input
 */
export function assembleCanonical(input = {}) {
  const semantic = input.semantic === true;
  const legacyBlocks = buildCanonicalBlocks(input);
  const rawBlocks = semantic ? buildSemanticPromptBlocks(input) : legacyBlocks;
  const budgeted = applyBudget(rawBlocks, { totalBudget: input.totalBudget });
  const inspector = inspectPromptBlocks(budgeted.blocks, {
    order: semantic ? [...SEMANTIC_BLOCK_ORDER] : [...CANONICAL_BLOCK_ORDER],
  });

  const systemParts = [];
  const runtimeParts = [];
  const historyMessages = [];
  const afterHistoryParts = [];
  let userContent = "";

  for (const block of budgeted.blocks) {
    if (!block.text) continue;
    if (block.id === "branch_history") {
      // History lines: "user: …" / "assistant: …" → chat messages when possible
      const lines = block.text.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const m = /^(user|assistant)\s*[:：]\s*(.*)$/i.exec(line);
        if (m) {
          historyMessages.push({ role: m[1].toLowerCase(), content: m[2] });
        } else {
          systemParts.push(line);
        }
      }
      continue;
    }
    if (block.id === "world_info_after" || block.id === "post_history_contract") {
      afterHistoryParts.push(block.text);
      continue;
    }
    if (block.id === "world_context_after") {
      afterHistoryParts.push(block.text);
      continue;
    }
    if (block.id === "runtime_context") {
      runtimeParts.push(block.text);
      continue;
    }
    if (block.id === "user_input") {
      userContent = block.text;
      continue;
    }
    systemParts.push(block.text);
  }

  const messages = [{
    role: "system",
    content: systemParts.join("\n\n"),
    blockId: "platform_safety",
    provenance: semantic ? "prompt.semantic" : "prompt.canonical",
  }];
  runtimeParts.forEach((content) => messages.push({
    role: "system",
    content,
    blockId: "runtime_context",
    provenance: "runtime.context",
  }));
  historyMessages.forEach((item) => messages.push({ ...item, provenance: "conversation.history" }));
  if (afterHistoryParts.length) messages.push({
    role: "system",
    content: afterHistoryParts.join("\n\n"),
    blockId: "post_history_contract",
    provenance: "prompt.post_history_contract",
  });
  if (userContent) messages.push({
    role: "user",
    content: userContent,
    blockId: "user_input",
    provenance: "turn_input",
  });

  return {
    order: semantic ? [...SEMANTIC_BLOCK_ORDER] : [...CANONICAL_BLOCK_ORDER],
    blocks: budgeted.blocks,
    legacyBlocks: semantic ? legacyBlocks : undefined,
    semantic,
    messages,
    inspector,
    tierBudgets: budgeted.tierBudgets,
    totalUsed: budgeted.totalUsed,
    loreTrace: input.loreTrace || null,
    mode: normalizePromptMode(input.mode || "chat"),
  };
}

/**
 * Join budgeted canonical blocks into a single system string (tests / spy).
 * @param {ReturnType<typeof assembleCanonical>} assembled
 */
export function flattenCanonicalSystem(assembled) {
  if (assembled?.semantic) return semanticSystemText(assembled.blocks);
  return (assembled?.blocks || [])
    .filter((b) => !["user_input", "branch_history", "world_info_after", "post_history_contract"].includes(b.id) && b.text)
    .map((b) => b.text)
    .join("\n\n");
}

export function buildSystemContent(compiled) {
  if (compiled?.canonical?.blocks?.length) {
    return flattenCanonicalSystem(compiled.canonical);
  }

  if (!isFeatureEnabled("promptAssembly")) {
    const lang = buildLanguageContext();
    const name = compiled.character?.name || "";
    const line = lang.conversationLanguage === "en-US"
      ? `You are playing: ${name}. Reply in natural spoken language and explain fully when the user's question needs depth.`
      : `你正在扮演：${name}。使用自然口语；用户的问题需要深度时，应当充分解释。`;
    return `${compiled.promptSystem || resolveBaseSystem()}\n\n${line}\n\n${languageSystemSuffix()}`;
  }

  const appId = normalizeSceneAppId(compiled.appId);
  const order = filterInjectionOrder(
    compiled.injectionOrder?.length ? compiled.injectionOrder : DEFAULT_INJECTION_ORDER,
    appId,
  );
  const parts = [compiled.promptSystem || resolveBaseSystem(), languageSystemSuffix()];
  if (compiled.promptDeveloper) {
    const en = buildLanguageContext().conversationLanguage === "en-US";
    parts.push("", en ? "Developer instructions:" : "开发者指令：", compiled.promptDeveloper);
  }

  parts.push("", `场景标签：${sceneAppLabel(appId)}（appId=${appId}）`);

  order.forEach((section) => {
    const block = SECTION_BUILDERS[section]?.(compiled);
    if (block) parts.push("", block);
    if (section === "memory" && compiled.livingTimelineBlock) {
      parts.push("", compiled.livingTimelineBlock);
    }
  });

  // C6: prefer permission-filtered life summary; raw cohabit only as fallback
  if (compiled.lifeSummaryBlock) {
    parts.push("", compiled.lifeSummaryBlock);
  } else if (compiled.cohabitTimelineBlock && shouldInjectCohabit(appId)) {
    parts.push("", compiled.cohabitTimelineBlock);
  }

  // V0.5: Context Graph hot path (character-isolated; omit when empty) — folded into canonical long_term_memory
  if (compiled.contextGraphBlock) {
    parts.push("", compiled.contextGraphBlock);
  }

  // Games Launch v1: optional duo/group observation slot (never full engine state).
  if (compiled.gameContextBlock) {
    parts.push("", compiled.gameContextBlock);
  }

  return parts.join("\n");
}

export async function selectHistoryMessages(sessionId = DEFAULT_SESSION_ID) {
  const messages = await getMessagesBySession(sessionId, CHAT_HISTORY_LIMIT * 2);
  const history = messages.filter((item) => item.role === "user" || item.role === "assistant");
  const selected = [];
  let tokens = 0;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    const cost = estimateTextTokens(item.content);
    if (selected.length >= CHAT_HISTORY_LIMIT) break;
    if (tokens + cost > CHAT_TOKEN_BUDGET && selected.length) break;
    selected.unshift({ role: item.role, content: item.content });
    tokens += cost;
  }

  return selected;
}

export async function buildModelMessages(compiled, userText, sessionId = DEFAULT_SESSION_ID) {
  const messages = [{
    role: "system",
    content: buildSystemContent(compiled),
    blockId: compiled?.canonical?.semantic ? "platform_safety" : undefined,
    provenance: compiled?.canonical?.semantic ? "prompt.semantic" : undefined,
  }];
  const history = Array.isArray(compiled?.historyMessages) ? compiled.historyMessages : [];
  compiled.historyTurns = history.length;

  // Auxiliary system blocks must not sit between the latest user message and
  // generation. Providers receive tools separately; the natural-language
  // order is system prerequisites -> history -> current user.
  const afterHistory = compiled?.canonical?.semantic
    ? [
      semanticBlockText(compiled.canonical.blocks, "world_context_after"),
      semanticBlockText(compiled.canonical.blocks, "post_history_contract"),
    ].filter(Boolean).join("\n\n")
    : compiled?.canonical?.blocks
      ?.filter((block) => ["world_info_after", "post_history_contract"].includes(block.id) && block.text)
      .map((block) => block.text)
      .join("\n\n");
  // Runtime Capabilities sit near the turn, before conversation text.
  const runtimeCapabilities = compiled?.canonical?.semantic
    ? semanticBlockText(compiled.canonical.blocks, "runtime_context")
    : String(compiled?.runtimeCapabilities || "").trim();
  if (runtimeCapabilities) {
    messages.push({
      role: "system",
      content: runtimeCapabilities,
      blockId: "runtime_context",
      provenance: "runtime.context",
    });
  }

  history.forEach((item, index) => messages.push({
    role: item.role,
    content: formatHistoryMessageForModel(item, index),
    provenance: "conversation.history",
  }));

  if (afterHistory) {
    const afterParts = compiled?.canonical?.semantic
      ? [
        { id: "world_context_after", text: semanticBlockText(compiled.canonical.blocks, "world_context_after"), provenance: "prompt.world_context_after" },
        { id: "post_history_contract", text: semanticBlockText(compiled.canonical.blocks, "post_history_contract"), provenance: "prompt.post_history_contract" },
      ]
      : [{ id: "post_history_contract", text: afterHistory, provenance: "prompt.post_history_contract" }];
    afterParts.filter((part) => part.text).forEach((part) => messages.push({
      role: "system",
      content: part.text,
      blockId: part.id,
      provenance: part.provenance,
    }));
  }

  const turnIntent = compiled?.turnIntent || compiled?.contextEnvelope?.turnIntent || "user_message";
  // continue / regenerate must not invent a fake user node
  if (turnIntent === "continue" || turnIntent === "regenerate" || turnIntent === "empty_generate") {
    return messages;
  }

  const trimmed = String(userText || "").trim();
  if (!trimmed) return messages;

  // Persist-then-assemble already put this sentence in history. Append once only.
  const { currentAlreadyInHistory } = splitTurnHistory(history, trimmed);
  if (!currentAlreadyInHistory) {
    messages.push({
      role: "user",
      content: trimmed,
      blockId: "user_input",
      provenance: "turn_input",
    });
  }
  return messages;
}

/**
 * Render transport cards as immutable chat facts before they reach the model.
 *
 * The UI remains free to render the original card.  The model, however, must
 * not be asked to infer the meaning or number of transactions from a compact
 * wire string such as `[转账|1.00|...]`.  This formatter gives each event a
 * stable identity and explicitly says that it happened once, so consecutive
 * character messages can naturally continue the chat without re-playing it.
 */
export function formatHistoryMessageForModel(item = {}, index = 0) {
  const raw = String(item.content || "").trim();
  const parsed = parseTokenMessage(raw, item.meta || {});
  if (!parsed.ok || !parsed.token) return raw;

  const token = parsed.token;
  const eventId = String(item.messageId || item.id || item.meta?.legacyMessageId || `history-${index + 1}`);
  const en = buildLanguageContext().conversationLanguage === "en-US";
  const sender = item.role === "assistant"
    ? (en ? "Companion" : "角色")
    : (en ? "User" : "用户");
  const receiver = item.role === "assistant"
    ? (en ? "User" : "用户")
    : (en ? "Companion" : "角色");
  const kind = token.kind === "transfer"
    ? (en ? "transfer" : "转账")
    : (en ? "payment request" : "收款请求");
  const amount = Number(token.amount || 0).toFixed(2);
  const note = String(token.note || "").trim();
  const settlement = token.status === "opened" || token.status === "completed"
    ? (en ? "completed" : "已完成")
    : (en ? "pending" : "待确认");

  if (en) {
    return [
      `[Platform event #${eventId}] ${sender} sent a ${kind} of ${amount} Nyra coins to ${receiver}; status: ${settlement}${note ? `; note: ${note}` : ""}.`,
      "This is the only occurrence of that event in history. Do not rewrite it as another send, and do not invent extra transfers or payment requests.",
    ].join("\n");
  }

  return [
    `【平台事件 #${eventId}】${sender}向${receiver}发送${kind}，金额 ${amount} 栖币，状态：${settlement}${note ? `，附言：${note}` : ""}。`,
    "这是历史中唯一的一笔该事件，已经发生；不得把它改写成用户又发送了一笔，也不得虚构额外的转账或收款。",
  ].join("\n");
}

export function formatSummaryPanel(status, compiled, segment = null) {
  const topMemory = compiled?.memories?.[0];
  const memoryHint = isFeatureEnabled("memoryRag")
    ? (compiled?.palaceSkipped ? t("chat.basis.palaceOff") : t("chat.basis.palaceHits", { count: compiled?.memories?.length || 0 }))
    : t("chat.basis.ragOff");
  const topHint = topMemory ? `，${topMemory.wing}.${topMemory.room}` : "";
  const segmentLine = segment?.segmentTotal > 1
    ? `<span>${escapeHtml(t("capability.summarySegment", {
      index: segment.segmentIndex + 1,
      total: segment.segmentTotal,
    }))}${segment.segmentText ? ` · ${escapeHtml(String(segment.segmentText).slice(0, 48))}` : ""}</span>`
    : "";
  const replyLine = segment?.segmentText
    ? t("chat.basis.segmentPreview", { text: String(segment.segmentText).slice(0, 64) })
    : (status.asleep ? t("chat.basis.replySleep") : t("chat.basis.replyDefault"));
  const awakeState = status.asleep ? t("chat.basis.wokenFromSleep") : t("chat.basis.awake");
  const settingState = compiled?.worldbook?.length ? t("chat.basis.worldbookHit") : t("chat.basis.worldbookDefault");
  return `
    <summary>${escapeHtml(t("chat.basis.title"))}</summary>
    <div>
      <span>${escapeHtml(t("chat.basis.todayStatus", {
        mood: status.mood,
        weather: status.weather?.label || "",
        awakeState,
      }))}</span>
      <span>${escapeHtml(t("chat.basis.memoryLine", { hint: memoryHint, top: topHint }))}</span>
      <span>${escapeHtml(t("chat.basis.settingLine", { state: settingState }))}</span>
      <span>${escapeHtml(t("chat.basis.contextLine", { turns: Number(compiled?.historyTurns ?? 0) }))}</span>
      ${segmentLine}
      <span>${escapeHtml(t("chat.basis.replyLine", { line: replyLine }))}</span>
    </div>
  `;
}

/**
 * Preview projects continuity without refreshing its persisted daily cache.
 */
export async function projectContinuityForPrompt(input = {}, deps = {}) {
  const refresh = deps.refresh || refreshRelationshipContinuity;
  const project = deps.project || getOrProjectContinuity;
  if (!input.preview) {
    try {
      await refresh(input);
    } catch {
      /* best-effort */
    }
  }
  return project({
    ...input,
    persist: !input.preview,
  });
}

export async function assemblePrompt({
  query,
  refreshDailyStatus,
  searchMemories,
  searchPalace,
  getAllRecords,
  characterRecord = null,
  collectExternalContext,
  sessionId = DEFAULT_SESSION_ID,
  groupRoster = "",
  appId = "pop",
  characterId = "",
  purpose = "chat",
  preview = false,
  presetId = "",
  turnIntent = "user_message",
  conversationKind = "",
  participantIds = [],
  companionPreference = null,
  capabilityRuntimeSnapshot = null,
  wakeUpBlock = "",
}) {
  const dailyStatus = await refreshDailyStatus();
  const flags = {
    memoryRag: isFeatureEnabled("memoryRag"),
    worldbook: isFeatureEnabled("worldbook"),
    external: isFeatureEnabled("external"),
  };
  const promptSettings = getPromptSettings();
  const profile = resolveCharacterIdentityFromRecord(characterRecord);
  const baseTexts = resolvePromptTextsFromCharacter(characterRecord);
  const promptTexts = {
    promptSystem: resolveStoredPrompt("system", baseTexts.promptSystem),
    promptDeveloper: resolveStoredPrompt("developer", baseTexts.promptDeveloper),
  };
  const palaceSettings = getPalaceSettings();
  const sceneId = normalizeSceneAppId(appId);
  const suppress = filterInjectionOrder(
    promptSettings.order?.length ? promptSettings.order : DEFAULT_INJECTION_ORDER,
    sceneId,
  );
  const allowMemory = suppress.includes("memory");
  const allowWorldbook = suppress.includes("worldbook") && flags.worldbook;
  const allowExternal = suppress.includes("external") && flags.external;

  const rag = getRagSettings();
  let rawMemories = [];
  let palaceSkipped = false;
  let palaceBackend = "none";
  let kgBlock = "";
  /** M8: when on, Context Broker (+ retrieval-coordinator) is the sole Prompt retrieval entry. */
  const singleBrokerRetrieval = isFeatureEnabled("singleBrokerRetrievalV1");

  const cohabitCharacterId = String(characterId || profile?.id || "").trim();
  let resolvedPreference = companionPreference;
  if (!resolvedPreference && typeof getAllRecords === "function" && cohabitCharacterId) {
    try {
      const rows = await getAllRecords("preferences");
      resolvedPreference = (rows || []).find((row) => String(row?.characterId || "") === cohabitCharacterId) || null;
    } catch {
      resolvedPreference = null;
    }
  }

  const diaryIntent = /日记|今天写|昨天.*日记|昨晚.*日记|diary/i.test(String(query || ""));
  const palaceSearchOpts = {
    topK: rag.topK,
    scope: diaryIntent ? "diary" : rag.scope,
    diaryStyle: rag.diaryStyle,
    force: diaryIntent,
    characterId: cohabitCharacterId,
    companionId: cohabitCharacterId,
  };

  // Flag OFF: legacy dual path — assemble searches palace then injects as additional block.
  // Flag ON: skip direct searchPalace/searchMemories; broker retrieves via coordinator.
  if (!singleBrokerRetrieval && allowMemory && flags.memoryRag && palaceSettings.enabled !== false) {
    if (searchPalace) {
      const palaceResult = await searchPalace(query, palaceSearchOpts);
      rawMemories = palaceResult.results || [];
      palaceSkipped = Boolean(palaceResult.skipped);
      palaceBackend = palaceResult.backend || "local";
      kgBlock = palaceResult.kgBlock || "";
    } else {
      rawMemories = await searchMemories(query, palaceSearchOpts);
      palaceBackend = "legacy";
    }
    // P0: never inject legacy_unscoped palace rows or KG into companion prompts.
    if (cohabitCharacterId) {
      rawMemories = rawMemories.filter((row) => rowMatchesCompanionScope(row, {
        companionId: cohabitCharacterId,
        userId: "local",
        allowGlobal: false,
      }));
    } else {
      rawMemories = [];
      palaceSkipped = true;
    }
    // KG blocks are historically global — keep out of Pop until scoped.
    kgBlock = "";
  }

  const memories = allowMemory && !singleBrokerRetrieval
    ? adaptNyraOriginMemories(
      trimMemoriesToBudget(rawMemories, budgetFromSetting(promptSettings.budget)),
      characterRecord,
    )
    : [];
  const resolvedWakeUpBlock = preview ? "" : String(wakeUpBlock || "");
  const mode = normalizePromptMode(sceneId);

  const worldbookAll = allowWorldbook ? (await getAllRecords("worldbook")) || [] : [];
  // Pass the current query through so device catalogs can be activated only
  // when relevant. A catalog item is not a lived memory or a relationship
  // fact, and must never be presented as one by default.
  const externalContext = allowExternal ? collectExternalContext(query) : [];
  const resolvedPurpose = purpose || (mode === "deskpet" ? "deskpet" : "chat");
  const resolvedTurnIntent = turnIntent || (String(query || "").trim() ? "user_message" : "continue");
  const langCtx = buildLanguageContext();
  const chatContract = buildChatOutputContract(langCtx, { turnIntent: resolvedTurnIntent });
  const continueHint = langCtx.conversationLanguage === "en-US"
    ? `${chatContract}\n\n[Continue intent] The user did not send a new message. Do not invent or replay new user actions. Continue naturally from the last few lines like instant messaging, and finish reading existing companion replies. Platform events marked “#...” happened once: you may acknowledge them, but must not claim another transfer/payment arrived, and must not invent new user actions.`
    : `${chatContract}\n\n【连续聊天意图】用户没有发来新的消息；这不是让你重演或续写新的用户行为。可基于最后几句自然补充、解释、接话，且应读完已有角色回复。历史中的“平台事件 #...”是一次性的已发生事实：可自然回应它，但不得声称又收到/确认了另一笔转账或收款，也不得杜撰用户的新操作。`;
  const continueContract = resolvedTurnIntent === "continue" || resolvedTurnIntent === "regenerate"
    ? continueHint
    : chatContract;

  const temporalOn = isFeatureEnabled("temporalContextV1");
  const continuityOn = isFeatureEnabled("relationshipContinuityV1");
  let temporalSnapshot = null;
  let todayContext = null;
  let temporalContextText = "";
  let relationshipContinuityText = "";
  let relationshipContinuity = null;
  const snapLocale = langCtx.conversationLanguage === "en-US" ? "en" : "zh-CN";
  if (temporalOn || continuityOn) {
    temporalSnapshot = createTemporalSnapshotV1({ locale: snapLocale });
  }
  if (temporalOn) {
    const calendarEvents = await loadCalendarEventsForTodayContext();
    const timelineEvents = cohabitCharacterId
      ? listTimelineEvents({
        companionId: cohabitCharacterId,
        limit: 40,
        statusFilter: "today_context",
      })
      : [];
    todayContext = buildTodayContext({
      snapshot: temporalSnapshot,
      calendarEvents,
      timelineEvents,
    });
    temporalContextText = todayContext.text || "";
  }
  // Continuity may inject even when temporalContextV1 is off (plan W6).
  if (continuityOn && cohabitCharacterId) {
    relationshipContinuity = await projectContinuityForPrompt({
      preview,
      companionId: cohabitCharacterId,
      userId: "local",
      snapshot: temporalSnapshot || createTemporalSnapshotV1({ locale: snapLocale }),
      locale: snapLocale,
    });
    relationshipContinuityText = formatContinuityPromptBlock(relationshipContinuity, {
      locale: snapLocale,
    });
  }

  const contextEnvelope = await buildContextEnvelope({
    purpose: resolvedPurpose,
    appId: sceneId,
    userId: "local",
    characterId: cohabitCharacterId,
    relationshipId: relationshipIdFor("local", cohabitCharacterId),
    chatSessionId: sessionId,
    conversationKind: conversationKind || undefined,
    participantIds,
    turnIntent: resolvedTurnIntent,
    currentInput: resolvedTurnIntent === "user_message" ? query : "",
    budgetProfile: promptSettings.contextBudgetProfile || "balanced",
    includeHistory: true,
    readOnlyHistory: preview,
    reconcileLegacy: !preview,
    markMemoryUsed: !preview,
    includeCohabit: allowMemory && shouldInjectCohabit(sceneId),
    includeMoments: allowMemory,
    includeContextGraph: allowMemory,
    includeWorldbook: allowWorldbook,
    includeExternal: allowExternal,
    includePalace: singleBrokerRetrieval
      ? (allowMemory && flags.memoryRag && palaceSettings.enabled !== false)
      : undefined,
    externalContext,
    worldbookEntries: worldbookAll,
    worldbookTokenBudget: Math.min(800, budgetFromSetting(promptSettings.budget) || 800),
    temporalSnapshot,
    todayContext,
    // M8: search options for broker coordinator only — assemble must not invoke searchPalace.
    ...(singleBrokerRetrieval ? { palaceSearchOpts } : {}),
    additionalImplicitBlocks: [
      // Dual path only: palace block from assemble-side search.
      !singleBrokerRetrieval && allowMemory ? {
        id: "palace_memory",
        text: buildMemoryBlock(memories, {
          palaceSkipped,
          kgBlock: "",
          wakeUpBlock: resolvedWakeUpBlock,
        }),
        source: "memory.palace",
        priority: 85,
        companionId: cohabitCharacterId,
      } : null,
      allowMemory ? {
        id: "sidewrite_life",
        text: [
          formatSidewriteTimelineBlock(cohabitCharacterId),
          formatLifePromptSummary({ characterId: cohabitCharacterId }),
        ].filter(Boolean).join("\n\n"),
        source: "life.permission_filtered",
        priority: 75,
      } : null,
      allowMemory ? {
        id: "scenario_shared_experience",
        text: formatScenarioExperiencePromptBlock(cohabitCharacterId),
        source: "companion.scenario_finale",
        priority: 78,
      } : null,
    ].filter(Boolean),
  });
  const history = contextEnvelope.historyMessages || [];
  const firstSpokenTurn = isFirstSpokenTurn(
    history,
    resolvedTurnIntent === "user_message" ? query : "",
  );
  const modeBlock = buildModeContribution(mode, {
    appId: sceneId,
    sceneLabel: sceneAppLabel(sceneId),
    characterId: cohabitCharacterId,
    firstSpokenTurn,
  });
  const adaptedWorldbook = adaptNyraSeededWorldbook(
    contextEnvelope.worldbook.activated || [],
    characterRecord,
  );
  const loreTexts = formatLoreActivationTexts(adaptedWorldbook);
  const loreActivation = {
    activated: adaptedWorldbook,
    trimmed: contextEnvelope.worldbook.trimmed || [],
    trace: contextEnvelope.worldbook.trace || null,
    beforeText: loreTexts.beforeText,
    afterText: loreTexts.afterText,
  };
  const matchedWorldbook = loreActivation.activated;
  const contextGraphBlock = contextEnvelope.blocks.find((item) => item.id === "context_graph")?.text || "";
  const memoryText = formatEnvelopeSubset(contextEnvelope, isMemoryContextBlock);
  // A retrieval miss must be explicit when the user asks about the past. This
  // keeps the model from filling an empty memory result with plausible fiction.
  const relevantMemoryText = memoryText || (asksForPastMemory(query)
    ? "本轮没有检索到可核实的长期记忆。只能依据当前可见聊天历史；不要把推测或新编内容说成已经发生。角色自己的出生史只能回答角色自身过去，不能改写成与用户共同经历。"
    : "");
  const currentSituationText = formatEnvelopeSubset(
    contextEnvelope,
    (block) => !isMemoryContextBlock(block),
  );
  const branchSummaryText = contextEnvelope.blocks.find((item) => item.id === "branch_summary")?.text || "";

  const characterText = (() => {
    const structured = compileCharacterCore(characterRecord, langCtx);
    const roster = groupRoster ? String(groupRoster) : "";
    return [structured, roster].filter(Boolean).join("\n\n");
  })();

  // History is single-channel via historyMessages — never also flatten into system branch_history.
  const dailyBlockText = dailyStatus.injectionEnabled === false ? "" : buildDailyBlock(dailyStatus);
  // Flag on: stop stuffing daily into relationship_state; use temporal_context instead.
  // Flag off: preserve legacy relationship_state = daily block.
  const relationshipStateText = temporalOn ? "" : dailyBlockText;

  const featureKnowledge = selectFeatureKnowledge({
    query,
    appId: sceneId,
    userId: "local",
    characterId: cohabitCharacterId,
    relationshipId: relationshipIdFor("local", cohabitCharacterId),
    sessionId,
  });
  const relevantOperationIds = featureKnowledgeOperationIds(featureKnowledge);
  const runtimeSnapshot = capabilityRuntimeSnapshot || buildCapabilityRuntimeSnapshot({
    networkOnline: typeof navigator === "undefined" ? true : navigator.onLine !== false,
    foreground: true,
    featureFlags: {
      webRetrievalV1: isFeatureEnabled("webRetrievalV1"),
    },
  });
  const needsDeviceSnapshot = featureKnowledge.some((row) => (
    row.featureId.startsWith("device.")
    || row.featureId === "voice"
    || row.featureId === "system-calendar"
  ));
  const deviceCapabilitySnapshot = needsDeviceSnapshot
    ? await buildDeviceCapabilitySnapshot()
    : null;
  const runtimeKnowledge = [
    formatFeatureKnowledge(featureKnowledge, langCtx.conversationLanguage),
    deviceCapabilitySnapshot
      ? formatDeviceCapabilitySnapshot(deviceCapabilitySnapshot, langCtx.conversationLanguage)
      : "",
  ].filter(Boolean);
  const runtimeCapabilities = runtimeKnowledge.length
    ? [
      ...runtimeKnowledge,
      formatCapabilityRuntimeSnapshot(runtimeSnapshot, langCtx.conversationLanguage, relevantOperationIds),
    ].filter(Boolean).join("\n\n")
    : "";

  const canonical = assembleCanonical({
    semantic: true,
    platformSafety: [
      buildPlatformCompanionContract(langCtx),
      buildDeveloperEvidencePolicy(langCtx),
      languageSystemSuffix(),
    ].filter(Boolean).join("\n\n"),
    characterPackage: characterText,
    userPersona: buildRelationshipContractV2(resolvedPreference, langCtx),
    temporalContext: temporalContextText,
    relationshipContinuity: relationshipContinuityText,
    relationshipState: relationshipStateText,
    modeContext: modeBlock.text,
    experiencePackage: "",
    openingSceneState: buildOpeningSceneState(langCtx, firstSpokenTurn),
    currentSituation: currentSituationText,
    worldInfo: [buildYueqiHabitat(langCtx), buildNyraBaseWorld(langCtx), loreActivation.beforeText].filter(Boolean).join("\n\n"),
    longTermMemory: relevantMemoryText,
    relevantMemories: relevantMemoryText,
    runtimeContext: runtimeCapabilities,
    branchSummary: branchSummaryText,
    branchHistory: "",
    worldInfoAfter: loreActivation.afterText,
    userInput: resolvedTurnIntent === "user_message" ? String(query || "") : "",
    postHistoryContract: continueContract,
    totalBudget: Math.max(
      1024,
      Number(contextEnvelope?.trace?.managedCapacity || contextEnvelope.request.profile.totalInputTokens)
        - Number(contextEnvelope?.trace?.historyTokens || 0)
        - 640,
    ),
    mode,
    loreTrace: loreActivation.trace,
    sources: {
      temporal_context: temporalOn ? "temporal.today_context" : "canonical",
      relationship_continuity: continuityOn ? "relationship.continuity" : "canonical",
      mode_context: modeBlock.source,
      world_info: "worldbook:activation",
      world_info_after: "worldbook:activation",
      long_term_memory: "memory+hot-path",
      relevant_memories: "memory+context-broker",
      relationship_context: "relationship+current-state",
      world_context: "world.base+worldbook",
      world_context_after: "worldbook:activation.after_history",
      runtime_context: "feature-knowledge+capability-snapshot",
      branch_summary: "conversation:branch-summary",
      branch_history: "conversation:v2",
    },
  });

  if (singleBrokerRetrieval) {
    const coord = contextEnvelope?.trace?.retrievalCoordinator;
    if (coord) {
      palaceBackend = coord.palaceBackend || palaceBackend;
      palaceSkipped = Boolean(coord.palaceSkipped);
    }
  }

  return {
    system: resolveBaseSystem(),
    promptSystem: resolveStoredPrompt("system", promptTexts.promptSystem),
    promptDeveloper: resolveStoredPrompt("developer", promptTexts.promptDeveloper),
    injectionOrder: promptSettings.order,
    memoryBudget: budgetFromSetting(promptSettings.budget),
    contractVersion: COMPANION_PROMPT_VERSION,
    authorityOrder: PROMPT_AUTHORITY_ORDER,
    runtimeCapabilities,
    capabilityRuntimeSnapshot: runtimeSnapshot,
    featureKnowledge,
    character: profile,
    groupRoster: groupRoster || "",
    dailyStatus: dailyStatus.injectionEnabled === false ? null : dailyStatus,
    temporalSnapshot,
    todayContext,
    relationshipContinuity,
    worldbook: matchedWorldbook,
    memories,
    palaceSkipped,
    palaceBackend,
    kgBlock,
    wakeUpBlock: resolvedWakeUpBlock,
    externalContext,
    historyTurns: history.length,
    appId: sceneId,
    turnIntent: resolvedTurnIntent,
    cohabitTimelineBlock: shouldInjectCohabit(sceneId)
      ? formatCohabitTimelineBlock({ characterId: cohabitCharacterId })
      : "",
    lifeSummaryBlock: allowMemory
      ? formatLifePromptSummary({ characterId: cohabitCharacterId })
      : "",
    scenarioExperienceBlock: allowMemory
      ? formatScenarioExperiencePromptBlock(cohabitCharacterId)
      : "",
    livingTimelineBlock: allowMemory ? formatSidewriteTimelineBlock(cohabitCharacterId) : "",
    contextGraphBlock,
    gameContextBlock: formatGameObservationBlock(ensurePopDuoObservation(sessionId) || getGameContextExtension(sessionId)),
    activePresetId: String(presetId || ""),
    canonical,
    inspector: canonical.inspector,
    loreTrace: loreActivation.trace,
    historyMessages: history,
    contextEnvelope,
  };
}
