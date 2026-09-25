/**
 * Companion runtime layers (lover chat path).
 *
 * Three layers, intentionally separate from Operational Agent Memory:
 *
 * 1. **Immediate** — existing Pop chat + short-term context (`prepareShortTermContext`,
 *    branch summaries). Handles the live turn; no OpenClaw loop.
 *
 * 2. **Relationship planner** — runs on important events (conflict, promise, offline
 *    return, anniversary, strong emotion) or periodic sampling after N turns.
 *    Outputs relationshipDelta, goals, proactiveCandidates, diaryHint, feedHint.
 *
 * 3. **Memory consolidator** — on session end / idle: extract facts, dedupe, merge,
 *    write compact session summary into context graph. Never dumps full chat into
 *    long-term prompts.
 *
 * **Boundary:** studio-assist / OpenClaw agent tool logs and task checkpoints must
 * NOT flow into lover chat prompts or companion consolidation.
 */

export const COMPANION_LAYER_IDS = Object.freeze({
  IMMEDIATE: "immediate",
  RELATIONSHIP: "relationship",
  MEMORY: "memory",
});

export const COMPANION_LAYER_DOCS = Object.freeze({
  [COMPANION_LAYER_IDS.IMMEDIATE]: {
    id: COMPANION_LAYER_IDS.IMMEDIATE,
    label: "即时对话层",
    scope: "当前会话短历史 + 分支摘要",
    triggers: ["每轮聊天", "compilePrompt"],
    excludes: ["OpenClaw tool logs", "assistant agent checkpoints"],
  },
  [COMPANION_LAYER_IDS.RELATIONSHIP]: {
    id: COMPANION_LAYER_IDS.RELATIONSHIP,
    label: "关系规划层",
    scope: "亲密度/信任/张力 + 主动话题候选",
    triggers: ["conflict", "promise", "offline_return", "anniversary", "strong_emotion", "every N turns"],
    excludes: ["ordinary small talk", "per-token agent loop"],
  },
  [COMPANION_LAYER_IDS.MEMORY]: {
    id: COMPANION_LAYER_IDS.MEMORY,
    label: "记忆整理层",
    scope: "事实抽取 + 去重 + 会话摘要",
    triggers: ["session end", "idle / leave thread"],
    excludes: ["full chat transcript in long-term prompt"],
  },
});

export {
  detectImportantEvent,
  planRelationship,
  planRelationshipWithModel,
  allowsNumericRelationshipDeltas,
  IMPORTANT_EVENT_TYPES,
} from "./relationship-planner.js";

export {
  getLifeState,
  saveLifeState,
  ingestRelationshipPlanIntoLifeState,
  checkEmitBudget,
  violatesContentGuardrails,
  DEFAULT_LIFE_LIMITS,
  BLOCKED_CONTENT_PATTERNS,
} from "./life-state.js";

export {
  runCompanionLifeTick,
  simulateOfflineCatchUp,
  compressOfflineElapsed,
  enrichCandidatesWithModelStub,
  WAKE_SOURCES,
} from "./life-tick.js";

export {
  wakeCompanionLife,
  bindCompanionLifeWakeListeners,
} from "./life-wake.js";

export {
  consolidateSessionMemory,
  formatConsolidatedPromptBlock,
  getSessionConsolidation,
} from "./memory-consolidator.js";

export {
  onCompanionChatTurn,
  onCompanionImportantEvent,
  onCompanionSessionEnd,
  DEFAULT_PLAN_EVERY_N_TURNS,
  DEFAULT_CONSOLIDATE_EVERY_N_TURNS,
} from "./session-hooks.js";

export {
  bindScenarioMemoryBridgeListeners,
  buildScenarioExperienceRecord,
  deriveImportantFactCandidates,
  deriveRelationshipDeltaFromRun,
  formatScenarioExperiencePromptBlock,
  getCommittedScenarioExperience,
  ingestScenarioFinaleToCompanion,
  onScenarioEventCompleted,
  scenarioFinaleIdempotentKey,
} from "./scenario-memory-bridge.js";

/**
 * @param {string} layerId
 */
export function describeCompanionLayer(layerId) {
  return COMPANION_LAYER_DOCS[layerId] || null;
}

/**
 * Guard: reject operational agent payloads from companion layers.
 * @param {object} payload
 */
export function isOperationalAgentPayload(payload = {}) {
  const source = String(payload.source || payload.origin || "").toLowerCase();
  if (/openclaw|studio-assist|agent-task|tool-log|checkpoint/.test(source)) return true;
  if (payload.agentTaskId || payload.toolCallId || payload.openClawSession) return true;
  return false;
}
