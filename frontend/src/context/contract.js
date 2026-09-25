import { estimatePromptTokens } from "../prompt/budget.js";
import { applyPurposePolicy } from "./purpose-policy.js";
import { relationshipIdFor } from "../memory/companion-scope.js";

export const CONTEXT_CONTRACT_VERSION = 1;

export const CONTEXT_BUDGET_PROFILES = Object.freeze({
  compact: Object.freeze({ id: "compact", totalInputTokens: 6000, outputReserveTokens: 1400, soulRatio: 0.25, implicitRatio: 0.15, historyRatio: 0.55 }),
  balanced: Object.freeze({ id: "balanced", totalInputTokens: 8000, outputReserveTokens: 1800, soulRatio: 0.24, implicitRatio: 0.16, historyRatio: 0.55 }),
  deep: Object.freeze({ id: "deep", totalInputTokens: 12000, outputReserveTokens: 2400, soulRatio: 0.22, implicitRatio: 0.18, historyRatio: 0.55 }),
});

export const CONTEXT_PURPOSES = Object.freeze([
  "chat",
  "deskpet",
  "proactive",
  "diary",
  "scenario",
  "adventure",
  "cocreate",
  "reading",
  "listening",
  "calendar",
  "skill",
  "agent",
]);

export const CONTEXT_TURN_INTENTS = Object.freeze([
  "user_message",
  "continue",
  "regenerate",
  "empty_generate",
]);

export function resolveContextBudgetProfile(value = "balanced") {
  if (typeof value === "object" && value?.totalInputTokens) {
    const total = Math.max(2048, Number(value.totalInputTokens) || 8000);
    return {
      ...CONTEXT_BUDGET_PROFILES.balanced,
      ...value,
      id: String(value.id || "custom"),
      totalInputTokens: total,
    };
  }
  const raw = String(value || "balanced").toLowerCase();
  if (raw === "6k" || raw === "6000") return CONTEXT_BUDGET_PROFILES.compact;
  if (raw === "12k" || raw === "12000") return CONTEXT_BUDGET_PROFILES.deep;
  if (raw === "8k" || raw === "8000") return CONTEXT_BUDGET_PROFILES.balanced;
  return CONTEXT_BUDGET_PROFILES[raw] || CONTEXT_BUDGET_PROFILES.balanced;
}

export function normalizeContextRequest(input = {}) {
  const purpose = CONTEXT_PURPOSES.includes(input.purpose) ? input.purpose : "chat";
  const profile = resolveContextBudgetProfile(input.budgetProfile || input.totalInputTokens || "balanced");
  const characterId = String(input.activeCompanionId || input.companionId || input.characterId || "").trim();
  const userId = String(input.userId || "local-user").trim() || "local-user";
  const relationshipId = String(input.relationshipId || "").trim()
    || (characterId ? relationshipIdFor(userId, characterId) : "");
  const currentInput = String(input.currentInput || input.query || "").trim();
  const turnIntent = CONTEXT_TURN_INTENTS.includes(input.turnIntent)
    ? input.turnIntent
    : (currentInput ? "user_message" : "continue");
  const conversationKind = ["dm", "group", "scenario", "project"].includes(input.conversationKind)
    ? input.conversationKind
    : undefined;
  const base = {
    contractVersion: CONTEXT_CONTRACT_VERSION,
    requestId: String(input.requestId || `ctxreq-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`),
    appId: String(input.appId || purpose || "pop").trim() || "pop",
    purpose,
    turnIntent,
    userId,
    workspaceId: String(input.workspaceId || characterId || "local"),
    characterId,
    activeCompanionId: characterId,
    companionId: characterId,
    relationshipId,
    chatSessionId: String(input.chatSessionId || input.sessionId || "").trim(),
    conversationSessionId: String(input.conversationSessionId || input.conversationId || "").trim(),
    conversationId: String(input.conversationId || input.conversationSessionId || "").trim(),
    conversationKind,
    participantIds: Array.isArray(input.participantIds)
      ? [...new Set(input.participantIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : [],
    branchId: String(input.branchId || "").trim(),
    agentId: String(input.agentId || "").trim(),
    skillId: String(input.skillId || "").trim(),
    realityNamespace: ["reality", "shared_fiction", "simulation", "creative_work"].includes(input.realityNamespace)
      ? input.realityNamespace
      : (purpose === "scenario" || purpose === "adventure" || purpose === "cocreate" ? "shared_fiction" : "reality"),
    analysisPhase: input.analysisPhase === "post_reply" ? "post_reply" : "pre_reply",
    currentInput,
    locale: String(input.locale || "zh-CN"),
    profile,
    forProactive: purpose === "proactive" || input.forProactive === true,
    allowedPrivacyLevels: Array.isArray(input.allowedPrivacyLevels)
      ? input.allowedPrivacyLevels.map(String)
      : ["shared"],
    createdAt: new Date().toISOString(),
    includeHistory: input.includeHistory,
    includeBranchSummary: input.includeBranchSummary,
    includeCohabit: input.includeCohabit,
    includeMoments: input.includeMoments,
    includeContextGraph: input.includeContextGraph,
    includeWorldbook: input.includeWorldbook,
    includeExternal: input.includeExternal,
    includePalace: input.includePalace,
    includeStable: input.includeStable,
    historyMaxMessages: input.historyMaxMessages,
    historyStyle: input.historyStyle,
    // W2 optional — non-breaking; ignored when temporalContextV1 is off
    temporalSnapshot: input.temporalSnapshot && typeof input.temporalSnapshot === "object"
      ? input.temporalSnapshot
      : null,
    todayContext: input.todayContext && typeof input.todayContext === "object"
      ? input.todayContext
      : (typeof input.todayContext === "string" ? { text: input.todayContext } : null),
  };
  return applyPurposePolicy(base);
}

export function createContextEnvelope(request, partial = {}) {
  const req = normalizeContextRequest(request);
  const historyMessages = Array.isArray(partial.historyMessages) ? partial.historyMessages : [];
  const blocks = Array.isArray(partial.blocks) ? partial.blocks.filter((block) => block?.text) : [];
  const blockTokens = blocks.reduce((sum, block) => sum + (Number(block.tokens) || estimatePromptTokens(block.text)), 0);
  const historyTokens = historyMessages.reduce((sum, message) => sum + estimatePromptTokens(message.content) + 4, 0);
  const currentTokens = estimatePromptTokens(req.currentInput);
  const worldbookTokens = estimatePromptTokens(partial.worldbook?.before || "")
    + estimatePromptTokens(partial.worldbook?.after || "");
  const totalManagedTokens = historyTokens + blockTokens + currentTokens + worldbookTokens;
  const managedCapacity = Math.max(0, req.profile.totalInputTokens - req.profile.outputReserveTokens);
  return {
    contractVersion: CONTEXT_CONTRACT_VERSION,
    request: req,
    authority: partial.authority || { history: "conversation_v2" },
    historyMessages,
    blocks,
    branchSummary: partial.branchSummary || null,
    worldbook: partial.worldbook || { before: "", after: "", activated: [], trace: null },
    provenance: Array.isArray(partial.provenance) ? partial.provenance : [],
    redactions: Array.isArray(partial.redactions) ? partial.redactions : [],
    turnIntent: req.turnIntent,
    temporalSnapshot: partial.temporalSnapshot || req.temporalSnapshot || null,
    todayContext: partial.todayContext || req.todayContext || null,
    relationshipContinuity: partial.relationshipContinuity || null,
    relationshipContinuityText: String(partial.relationshipContinuityText || ""),
    trace: {
      requestId: req.requestId,
      purpose: req.purpose,
      totalBudget: req.profile.totalInputTokens,
      outputReserve: req.profile.outputReserveTokens,
      historyTokens,
      blockTokens,
      currentTokens,
      worldbookTokens,
      managedCapacity,
      totalManagedTokens,
      withinBudget: totalManagedTokens <= managedCapacity,
      ...(partial.trace || {}),
    },
    createdAt: new Date().toISOString(),
  };
}

export function validateContextRequest(input) {
  const value = normalizeContextRequest(input);
  const errors = [];
  const companionPurposes = ["chat", "deskpet", "proactive", "scenario", "diary"];
  if (companionPurposes.includes(value.purpose)) {
    if (!value.characterId && !value.activeCompanionId) {
      errors.push("activeCompanionId required for companion context");
    }
    if (!value.relationshipId) {
      errors.push("relationshipId required for companion context");
    }
  }
  if (value.purpose === "chat" && value.conversationKind === "group" && !value.chatSessionId) {
    errors.push("chatSessionId required for group conversation");
  }
  if (value.profile.totalInputTokens <= value.profile.outputReserveTokens) {
    errors.push("input budget must exceed output reserve");
  }
  const maxCurrent = Math.floor(value.profile.totalInputTokens * 0.45);
  if (value.currentInput && estimatePromptTokens(value.currentInput) > maxCurrent) {
    errors.push("CURRENT_INPUT_TOO_LARGE");
  }
  if (value.turnIntent === "user_message" && !value.currentInput) {
    errors.push("currentInput required for user_message turnIntent");
  }
  return { ok: errors.length === 0, errors, value };
}
