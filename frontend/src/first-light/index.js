/**
 * First Light public entry — mount after product onboarding ().
 */

export {
  FIRST_LIGHT_KEY,
  FL_STAGES,
  FL_TRACK,
  ensureFirstLightMigration,
  hasFirstLightDone,
  loadFirstLightState,
  resetFirstLight,
  saveFirstLightState,
} from "./state.js";

export { mountFirstLight, startFirstLightIfNeeded } from "./ui.js";
export { renderFirstLightV2 } from "./ui-v2.js";
export {
  mountFirstLightV2Production,
  startFirstLightV2IfNeeded,
} from "./production-v2.js";
export {
  hasFirstLightDoneV2,
  resetFirstLightV2,
} from "./controller-v2.js";
export { commitFirstLightDraft } from "./commit.js";
export { commitFirstLightV2 } from "./commit-v2.js";
export { previewFirstLightV2 } from "./preview-v2.js";
export { FL_MOTION, applyMotionTokens, prefersReducedMotion } from "./motion-tokens.js";
