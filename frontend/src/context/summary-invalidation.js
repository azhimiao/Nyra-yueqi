/**
 * Invalidate branch summaries when Conversation V2 mutates the active branch.
 */
import { onConversationEvent, CONVERSATION_EVENTS } from "../conversation/events.js";
import { invalidateBranchSummary } from "./branch-summary.js";
import { getSession } from "../conversation/index.js";

const INVALIDATING = [
  CONVERSATION_EVENTS.USER_EDITED,
  CONVERSATION_EVENTS.MESSAGE_EDITED,
  CONVERSATION_EVENTS.MESSAGE_DELETED,
  CONVERSATION_EVENTS.REGENERATED,
  CONVERSATION_EVENTS.CANDIDATE_SWITCHED,
  CONVERSATION_EVENTS.FORKED,
  CONVERSATION_EVENTS.HEAD_ROLLED_BACK,
  CONVERSATION_EVENTS.BRANCH_ARCHIVED,
  CONVERSATION_EVENTS.BRANCH_SWITCHED,
  CONVERSATION_EVENTS.CANDIDATE_ARCHIVED,
];

let wired = false;

export function wireBranchSummaryInvalidation() {
  if (wired) return;
  wired = true;
  for (const type of INVALIDATING) {
    onConversationEvent(type, (payload) => {
      try {
        const sessionId = String(payload?.sessionId || payload?.conversationSessionId || "").trim();
        const session = sessionId ? getSession(sessionId) : null;
        const characterId = String(
          session?.meta?.productCharacterId
          || session?.characterId
          || payload?.characterId
          || "",
        ).trim();
        const branchId = String(
          payload?.branchId
          || session?.activeBranchId
          || "",
        ).trim();
        if (!characterId || !sessionId || !branchId) return;
        invalidateBranchSummary({
          characterId,
          conversationSessionId: sessionId,
          branchId,
          reason: String(type || "branch_changed"),
        });
      } catch {
        /* never block chat */
      }
    });
  }
}
