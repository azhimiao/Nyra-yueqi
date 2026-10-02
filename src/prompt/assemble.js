/**
 * Open-source tree: palace retrieval, continuity projection, and the
 * multi-block prompt compiler are removed. Chat sends the character card
 * plus recent visible messages.
 */

import { DEFAULT_PROMPT_SYSTEM, DEFAULT_SESSION_ID } from "../constants.js";
import { getMessagesBySession } from "../storage/db.js";

export const CANONICAL_BLOCK_ORDER = Object.freeze([
  "character_package",
  "user_input",
]);

export const SEMANTIC_BLOCK_ORDER = Object.freeze([
  "character",
  "user_input",
]);

function characterSystem(record) {
  const text = String(record?.promptSystem || record?.profile?.promptSystem || "").trim();
  return text || DEFAULT_PROMPT_SYSTEM;
}

export function formatDailyStatusBlock() {
  return "";
}

export function buildSemanticPromptBlocks() {
  return [];
}

export function formatCompiledPreview(compiled) {
  return String(compiled?.system || compiled?.promptSystem || "");
}

export function buildCanonicalBlocks(bag = {}) {
  const text = String(bag.characterPackage || bag.character || "").trim();
  return [{ id: "character", text, originalTokens: 0, tokens: 0, trimReason: "" }];
}

export function assembleCanonical(input = {}) {
  const blocks = buildCanonicalBlocks(input);
  return {
    semantic: true,
    blocks,
    totalUsed: 0,
    totalBudget: 0,
    inspector: null,
    promptLayout: null,
  };
}

export function flattenCanonicalSystem(assembled) {
  return (assembled?.blocks || []).map((block) => block.text).filter(Boolean).join("\n\n");
}

export function buildSystemContent(compiled) {
  return String(compiled?.system || compiled?.promptSystem || "");
}

export async function selectHistoryMessages(sessionId = DEFAULT_SESSION_ID) {
  try {
    const rows = await getMessagesBySession(sessionId, 24);
    return (rows || []).filter((item) => item.role === "user" || item.role === "assistant");
  } catch {
    return [];
  }
}

export function formatHistoryMessageForModel(item = {}) {
  return String(item.content || "");
}

export async function buildModelMessages(compiled, userText) {
  const history = Array.isArray(compiled?.historyMessages) ? compiled.historyMessages : [];
  const system = buildSystemContent(compiled);
  const messages = [];
  if (system) {
    messages.push({ role: "system", content: system, blockId: "character", provenance: "character" });
  }
  for (const item of history) {
    if (item?.role !== "user" && item?.role !== "assistant") continue;
    messages.push({
      role: item.role,
      content: formatHistoryMessageForModel(item),
      provenance: "conversation.history",
    });
  }
  const current = String(userText || "").trim();
  if (current && compiled?.turnIntent !== "continue") {
    messages.push({ role: "user", content: current, blockId: "user_input", provenance: "turn_input" });
  }
  return messages;
}

export function formatSummaryPanel() {
  return "";
}

export async function projectContinuityForPrompt() {
  return null;
}

export async function assemblePrompt(input = {}) {
  const sessionId = input.sessionId || DEFAULT_SESSION_ID;
  const history = await selectHistoryMessages(sessionId);
  const system = characterSystem(input.characterRecord);
  const canonical = assembleCanonical({ characterPackage: system });
  return {
    system,
    promptSystem: system,
    promptDeveloper: "",
    injectionOrder: [],
    promptLayout: null,
    platformAdditionsEnabled: false,
    currentUserMessageId: String(input.currentUserMessageId || ""),
    firstSpokenTurn: history.length === 0,
    memoryBudget: 0,
    contractVersion: "open",
    authorityOrder: [],
    runtimeCapabilities: "",
    runtimeInstruction: String(input.runtimeInstruction || ""),
    promptBudget: {},
    capabilityRuntimeSnapshot: null,
    featureKnowledge: [],
    character: input.characterRecord || null,
    groupRoster: input.groupRoster || "",
    dailyStatus: null,
    temporalSnapshot: null,
    todayContext: null,
    relationshipContinuity: null,
    worldbook: [],
    memories: [],
    palaceSkipped: true,
    palaceBackend: "removed",
    kgBlock: "",
    wakeUpBlock: "",
    externalContext: "",
    historyTurns: history.length,
    appId: input.appId || "pop",
    turnIntent: input.turnIntent || "user_message",
    cohabitTimelineBlock: "",
    lifeSummaryBlock: "",
    scenarioExperienceBlock: "",
    livingTimelineBlock: "",
    contextGraphBlock: "",
    gameContextBlock: "",
    activePresetId: "",
    canonical,
    inspector: null,
    loreTrace: null,
    historyMessages: history,
    contextEnvelope: { request: { profile: { totalInputTokens: 8000, outputReserveTokens: 1800 } } },
  };
}
