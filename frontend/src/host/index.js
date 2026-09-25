/**
 * shared host bridge API.
 */

export {
  HOST_SCHEMA_VERSION,
  SCREEN_CAPTURE_GRANT_KEY,
  CAPTURE_SURFACES,
  GRANT_SCOPES,
  HOST_TASK_STATES,
  HOST_PLATFORMS,
} from "./constants.js";

export {
  createScreenCaptureGate,
  getScreenCaptureGate,
  parseGrant,
  isGrantActive,
  __setScreenCaptureStorageForTests,
  __memoryStorageForTests,
} from "./screen-capture-gate.js";

export {
  AGENT_TO_HOST_STATE,
  mapAgentStateToHost,
  projectTaskState,
  projectTaskList,
  buildBubbleText,
  isHostTaskState,
} from "./task-state-projection.js";

export { createDeskPetHostAdapter, DeskPetHostAdapter } from "./desk-pet-host-adapter.js";
export { createOverlayHostAdapter, OverlayHostAdapter } from "./overlay-host-adapter.js";

export {
  WINDOWS_ISOLATION,
  ANDROID_ISOLATION,
  listIsolationRules,
  detectIsolationViolation,
  assertNoAgentExecution,
} from "./isolation.js";

export {
  createCompanionOverlayPluginStub,
  createAndroidOverlayStubAdapter,
  ANDROID_FGS_CHECKLIST,
} from "./android-permission-stubs.js";
