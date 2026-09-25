import { estimatePromptTokens } from "../prompt/budget.js";

/**
 * Token-aware recent history selection.  Messages are atomic: no content is
 * cut mid-message.  The current user input is excluded when it already exists
 * as the newest user message so callers cannot accidentally send it twice.
 */
export function prepareShortTermContext(messages = [], opts = {}) {
  const tokenBudget = Math.max(128, Number(opts.tokenBudget) || 4400);
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
  let tokens = 0;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const item = rows[index];
    if (selected.length >= maxMessages) {
      omitted.unshift(item);
      continue;
    }
    const cost = estimatePromptTokens(item.content) + 4;
    if (tokens + cost > tokenBudget && selected.length) {
      omitted.unshift(item);
      continue;
    }
    if (cost > tokenBudget && !selected.length) {
      omitted.unshift(item);
      continue;
    }
    selected.unshift(item);
    tokens += cost;
  }

  const last = selected[selected.length - 1];
  const currentInputAlreadyPresent = Boolean(
    currentInput
      && last?.role === "user"
      && last.content.trim() === currentInput,
  );
  return {
    messages: selected.map(({ role, content, ...meta }) => ({ role, content, ...meta })),
    tokens,
    omitted,
    omittedMessageIds: omitted.map((item) => item.messageId).filter(Boolean),
    currentInputAlreadyPresent,
    sourceMessageIds: selected.map((item) => item.messageId).filter(Boolean),
  };
}
