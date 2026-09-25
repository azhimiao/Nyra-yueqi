/**
 *  Qiji assistant agent surface.
 * Heavy OpenClaw runners re-export through lazy-agent.js ().
 */

export { routeAssistantIntent, ASSISTANT_EXECUTION_MODES } from "./intent-router.js";
export {
  createAssistantTask,
  getAssistantTask,
  updateAssistantTask,
  listAssistantTasks,
  clearAssistantTasksForTests,
} from "./task-store.js";
export {
  mapNyraEventToAssistant,
  toolStepSummary,
  eventToSpeech,
  sanitizeUserMessage,
} from "./events.js";
export {
  createQijiControlledTools,
  buildCharacterDiff,
} from "./controlled-tools.js";
export {
  commitCharacterCandidate,
  commitCharacterCandidateOnce,
} from "./character-commit.js";
export {
  runCharacterFixAgentTask,
  approveAssistantTask,
  rejectAssistantTask,
  pauseAssistantTask,
  resumeAssistantTask,
  runThemeDraftAgentTask,
  approveThemeDraftTask,
  runScenarioAuditAgentTask,
  CHARACTER_FIX_FIXTURE,
} from "./lazy-agent.js";
export {
  commitThemeCandidate,
  commitThemeCandidateOnce,
  buildThemeDiff,
} from "./theme-commit.js";
export {
  SCENARIO_AUDIT_FIXTURE,
} from "./fixtures.js";
export {
  buildCommitIdempotencyKey,
  clearCommitIdempotencyForTests,
  lookupCommitIdempotency,
} from "./commit-idempotency.js";
export {
  createByokStreamFn,
  createGatewayStreamFn,
  mapByokError,
  redactBaseUrl,
  openClawMessagesToOpenAI,
  openAIResponseToAssistant,
} from "./byok-stream.js";
