/** Live companion-turn progress. App DOM and Pop both consume this. */

export const CHAT_TURN_PROGRESS_EVENT = "yueqi:chat-turn-progress";

/**
 * @param {{
 *   sessionId?: string,
 *   characterId?: string,
 *   messageId: string,
 *   phase: "start"|"thinking"|"stream"|"done"|"fail"|"awaiting_approval",
 *   stage?: string,
 *   statusCopy?: string,
 *   operation?: string,
 *   innerState?: string,
 *   visibleText?: string,
 * }} detail
 */
export function emitChatTurnProgress(detail = {}) {
  if (typeof document === "undefined") return;
  const messageId = String(detail.messageId || "").trim();
  if (!messageId) return;
  document.dispatchEvent(new CustomEvent(CHAT_TURN_PROGRESS_EVENT, {
    detail: {
      sessionId: String(detail.sessionId || ""),
      characterId: String(detail.characterId || ""),
      messageId,
      phase: detail.phase || "stream",
      stage: String(detail.stage || "").trim(),
      statusCopy: String(detail.statusCopy || detail.detail || "").trim(),
      operation: String(detail.operation || "").trim(),
      innerState: String(detail.innerState || ""),
      visibleText: String(detail.visibleText || ""),
    },
  }));
}
