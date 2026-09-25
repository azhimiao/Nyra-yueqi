/**
 * Shared Task Runtime barrel — Explore and Assistant share one stack.
 * Light exports only; OpenClaw runners load via lazy-runners.js ().
 */

export {
  routeAssistantIntent,
  ASSISTANT_EXECUTION_MODES,
} from "../studio-assist/agent/intent-router.js";
export {
  createAssistantTask,
  getAssistantTask,
  updateAssistantTask,
  listAssistantTasks,
  clearAssistantTasksForTests,
} from "../studio-assist/agent/task-store.js";
export {
  mapNyraEventToAssistant,
  toolStepSummary,
  eventToSpeech,
  sanitizeUserMessage,
} from "../studio-assist/agent/events.js";
export {
  buildCommitIdempotencyKey,
  clearCommitIdempotencyForTests,
  lookupCommitIdempotency,
  recordCommitIdempotency,
} from "../studio-assist/agent/commit-idempotency.js";

export { routeExploreIntent } from "./explore-intent.js";
export { commitWorldbookMergeCandidateOnce } from "./worldbook-commit.js";
export { EXTERNAL_REQUIRED_USER_MESSAGE } from "./external-required.js";

export {
  runWorldbookMergeTask,
  approveWorldbookMergeTask,
  rejectWorldbookMergeTask,
} from "./lazy-runners.js";
