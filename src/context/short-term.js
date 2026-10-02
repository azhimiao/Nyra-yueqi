import { estimatePromptTokens } from "../prompt/budget.js";
import { splitTurnHistory } from "../prompt/first-spoken-turn.js";

/**
 * Token-aware recent history selection. User-led exchanges are atomic: never
 * leave a reply without the message it answered, or skip a non-fitting exchange
 * to pick older rows. The current input uses its separate protected allocation.
 */
export function prepareShortTermContext(messages = [], opts = {}) {
  const tokenBudget = Math.max(0, Number.isFinite(Number(opts.tokenBudget)) ? Number(opts.tokenBudget) : 4400);
  const maxMessages = Math.max(2, Number(opts.maxMessages) || 80);
  const currentInput = String(opts.currentInput || "").trim();
  const rows = (Array.isArray(messages) ? messages : [])
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({
      id: String(item.id || item.messageId || ""),
      messageId: String(item.messageId || item.id || ""),
      candidateId: String(item.candidateId || item.meta?.candidateId || ""),
      branchId: String(item.branchId || ""),
      role: item.role,
      content: String(item.content ?? item.text ?? ""),
      // Preserve transport metadata for the final model-history formatter.
      // A red-packet card is not ordinary prose: without its metadata the
      // model only sees a terse wire string and can incorrectly invent a
      // second transaction while naturally continuing the conversation.
      meta: item.meta && typeof item.meta === "object" ? { ...item.meta } : {},
      createdAt: item.createdAt || "",
    }))
    .filter((item) => item.content.trim());

  const selected = [];
  const omitted = [];
  const split = splitTurnHistory(rows, currentInput, { currentUserMessageId: opts.currentUserMessageId });
  const currentInputAlreadyPresent = split.currentAlreadyInHistory;
  // The current input has its own protected allocation. Keep its metadata for
  // event formatting without spending the history budget a second time.
  const priorRows = split.priorMessages;
  const exchanges = [];
  for (const item of priorRows) {
    if (item.role === "user" || !exchanges.length) exchanges.push([]);
    exchanges.at(-1).push(item);
  }
  let exhausted = false;
  let tokens = 0;
  for (let index = exchanges.length - 1; index >= 0; index -= 1) {
    const exchange = exchanges[index];
    const cost = exchange.reduce((sum, item) => sum + estimatePromptTokens(item.content) + 4, 0);
    if (exhausted || selected.length + exchange.length > maxMessages || tokens + cost > tokenBudget) {
      // Stop at the first non-fitting exchange. Its full IDs are the exact
      // evidence set handed to the branch summary, without holes or overlap.
      exhausted = true;
      omitted.unshift(...exchange);
      continue;
    }
    selected.unshift(...exchange);
    tokens += cost;
  }

  if (currentInputAlreadyPresent) selected.push(split.currentMessage);
  return {
    messages: selected.map(({ role, content, ...meta }) => ({ role, content, ...meta })),
    tokens,
    omitted,
    omittedMessageIds: omitted.map((item) => item.messageId).filter(Boolean),
    currentInputAlreadyPresent,
    sourceMessageIds: selected.map((item) => item.messageId).filter(Boolean),
  };
}
