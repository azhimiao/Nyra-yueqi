/**
 * 栖机助手 public API.
 */

import {
  registerStudioAssist as registerStudioAssistApi,
  registerPhoneStudioAssist as registerPhoneStudioAssistApi,
  openStudioAssist as openStudioAssistApi,
} from "./api-registry.js";

export { mountStudioAssist } from "./assist-ui.js";
export { createAssistChatStore } from "./chat-store.js";
export { runAssistTurn, parseAssistActions } from "./engine.js";
export {
  executeAssistTool,
  expandPackGuide,
  getAssistRegistrySummary,
  ASSIST_PACKS,
} from "./tools.js";
export {
  ASSIST_CAPABILITY_PACKS,
  ASSIST_TOOL_MAP,
  capabilitySummary,
  listCapabilityPacks,
} from "./registry.js";
export { listAssistAudit } from "./audit-store.js";
export {
  matchAssistRoute,
  executeAssistRoute,
  tryAssistRoute,
  buildAttachSkillSummary,
  dispatchAssistRouteAction,
} from "../agents/assist-routes.js";

/** Phone-shell instance — preferred while appMode === phone. */

/**
 * @param {{ open: Function, refresh?: Function }} api
 */
export function registerStudioAssist(api) {
  registerStudioAssistApi(api);
}

/**
 * @param {{ open: Function, refresh?: Function }} api
 */
export function registerPhoneStudioAssist(api) {
  registerPhoneStudioAssistApi(api);
}

/**
 * @param {{ context?: string, seed?: string }} [opts]
 */
export function openStudioAssist(opts = {}) {
  return openStudioAssistApi(opts);
}
