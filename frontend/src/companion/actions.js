/**
 * Companion Action Layer (narrow Pop capabilities).
 *
 * Love-chat / Pop uses this narrow surface + Turn Understanding prose results.
 * OpenClaw / unified_task / agent_session stay for multi-step / pack / dev tasks.
 * Native tools[] can later map onto the same capability ids without moving Identity.
 */

export {
  COMPANION_NARROW_CAPABILITIES,
  createCompanionTurnResult,
  turnResultFromDirectAction,
  isNarrowCompanionCapability,
} from "./turn-result.js";

/** Routes that stay outside the narrow companion action layer. */
export const OPENCLAW_TASK_ROUTES = Object.freeze([
  "unified_task",
  "agent_session",
]);

export function isOpenClawTaskRoute(route) {
  const id = String(route?.route || route || "").trim();
  return OPENCLAW_TASK_ROUTES.includes(id);
}

/**
 * Pop companion action kinds that may short-circuit before callModel,
 * but must still surface as CompanionTurnResult (speech + optional artifact).
 */
export const DIRECT_COMPANION_ACTIONS = Object.freeze(["selfie", "diary", "listen", "capability"]);

export function isDirectCompanionAction(route) {
  return route?.route === "direct_action"
    && DIRECT_COMPANION_ACTIONS.includes(String(route?.action || ""));
}
