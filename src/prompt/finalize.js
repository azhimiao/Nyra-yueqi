import {
  estimatePromptTokens,
  PERMANENT_BLOCK_IDS,
  requiredContextBudgetError,
} from "./budget.js";
import { stableHash } from "../contracts/companion-v2-shared.js";
import {
  createPreparedModelRequestV1,
  validatePreparedModelRequestV1,
} from "../contracts/prepared-model-request-v1.js";

const DEFAULT_PROTECTED_BLOCK_IDS = Object.freeze([...PERMANENT_BLOCK_IDS]);
const FORBIDDEN_DOM_FIELDS = new Set(["element", "textarea", "innerHTML"]);

function assertDomFree(value, path = "request") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_DOM_FIELDS.has(key)) {
      throw new TypeError(`DOM field is forbidden in PreparedModelRequestV1: ${path}.${key}`);
    }
    assertDomFree(child, `${path}.${key}`);
  }
}

function inferBlockId(item, index, firstSystemIndex, latestUserIndex) {
  const explicit = String(item?.blockId || "").trim();
  if (explicit) return explicit;
  if (item?.role === "tool") return `tool_receipt_${index}`;
  if (index === latestUserIndex) return "user_input";
  if (index === firstSystemIndex) return "platform_safety";
  if (item?.role === "user" || item?.role === "assistant") return `history_${index}`;
  if (item?.role === "system" || item?.role === "developer") return `aux_system_${index}`;
  return `message_${index}`;
}

function inferProvenance(item, blockId, index, latestUserIndex) {
  const explicit = String(item?.provenance || "").trim();
  if (explicit) return explicit;
  if (item?.role === "tool") return "tool";
  if (index === latestUserIndex) return "turn_input";
  if (item?.role === "user" || item?.role === "assistant") return "history";
  return blockId || "system";
}

function omissionPriority(item) {
  const id = item._blockId.toLowerCase();
  if (/world|lore/.test(id)) return 0;
  if (/example|dialogue/.test(id)) return 1;
  if (item.role === "user" || item.role === "assistant") return 2;
  if (/memory|retrieval/.test(id)) return 3;
  if (/scenario/.test(id)) return 4;
  if (item.role === "system" || item.role === "developer") return 5;
  return 6;
}

function omissionReason(item) {
  const priority = omissionPriority(item);
  if (priority === 0) return "lore_omitted_before_protected";
  if (priority === 1) return "examples_omitted_before_protected";
  if (priority === 2) return "history_omitted_before_protected";
  if (priority === 3) return "memory_omitted_before_protected";
  if (priority === 4) return "scenario_omitted_before_protected";
  if (priority === 5) return "aux_system_omitted_before_protected";
  return "non_protected_omitted_before_protected";
}

function normalizedHashInput(messages, tools, toolChoice, providerMode) {
  return {
    messages: messages.map(({ role, content, provenance }) => ({ role, content, provenance })),
    tools,
    ...(toolChoice === undefined ? {} : { toolChoice }),
    providerMode,
  };
}

/**
 * Final transport budget.  This is intentionally the last gate, after history,
 * attachment context, capability results and runtime instructions are present.
 */
export function finalizeModelRequest(messages = [], options = {}) {
  const totalContextTokens = Math.max(2048, Number(options.totalContextTokens) || 8000);
  const outputReserveTokens = Math.max(256, Math.min(
    totalContextTokens - 512,
    Number(options.outputReserveTokens) || 1800,
  ));
  const safetyMarginTokens = Math.max(32, Number(options.safetyMarginTokens) || 96);
  const inputLimit = Math.max(512, totalContextTokens - outputReserveTokens - safetyMarginTokens);
  assertDomFree(messages, "messages");
  assertDomFree(options.tools, "tools");
  assertDomFree(options.toolChoice, "toolChoice");
  const tools = Array.isArray(options.tools) ? [...options.tools] : [];
  const toolTokens = tools.length ? estimatePromptTokens(JSON.stringify(tools)) : 0;
  const toolChoiceTokens = options.toolChoice === undefined ? 0 : estimatePromptTokens(JSON.stringify(options.toolChoice));
  const schemaTokens = toolTokens + toolChoiceTokens;

  const sourceMessages = Array.isArray(messages) ? messages : [];
  const firstSystemIndex = sourceMessages.findIndex((item) => item?.role === "system");
  const latestUserIndex = (() => {
    for (let i = sourceMessages.length - 1; i >= 0; i -= 1) {
      if (sourceMessages[i]?.role === "user") return i;
    }
    return -1;
  })();
  const configuredProtectedBlockIds = Array.isArray(options.protectedBlockIds)
    ? options.protectedBlockIds.map((item) => String(item))
    : [...DEFAULT_PROTECTED_BLOCK_IDS];
  const protectedSet = new Set(configuredProtectedBlockIds);
  const list = sourceMessages
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item && String(item.content || "").trim())
    .map(({ item, index }) => ({
      role: String(item.role || ""),
      content: String(item.content || ""),
      _index: index,
      _blockId: inferBlockId(item, index, firstSystemIndex, latestUserIndex),
      _hasExplicitBlockId: Boolean(String(item.blockId || "").trim()),
      _source: String(item.source || item.provenance || item.role || "message"),
      _provenance: String(item.provenance || "").trim(),
      _protected: false,
      _originalChars: String(item.content || "").length,
      _originalTokens: estimatePromptTokens(item.content) + 4,
      _reason: "",
      _explicitProtected: item.protected === true,
      _messageId: String(item.messageId || item.id || ""),
    }))
    .map((item) => {
      item._provenance = item._provenance
        || inferProvenance(item, item._blockId, item._index, latestUserIndex);
      item._protected = item._explicitProtected
        || protectedSet.has(item._blockId)
        || (item._index === firstSystemIndex && !item._hasExplicitBlockId)
        || item._index === latestUserIndex
        || item.role === "tool";
      return item;
    });
  let required = list.filter((item) => item._protected);
  let requiredTokens = tokenTotal(required) + schemaTokens;
  if (requiredTokens > inputLimit) {
    throw requiredContextBudgetError(requiredTokens, inputLimit, required.map((item) => ({
      id: item._blockId, tokens: item._originalTokens,
    })));
  }
  const historyGroups = new Map();
  const exchanges = [];
  let exchange = [];
  for (const item of list) {
    const isHistory = /^(?:conversation\.)?history$/.test(item._provenance)
      || /^history_/.test(item._blockId);
    if (!isHistory || !["user", "assistant"].includes(item.role)) continue;
    if (item.role === "user" || !exchange.length) {
      exchange = [];
      exchanges.push(exchange);
    }
    exchange.push(item);
    historyGroups.set(item, exchange);
  }
  // Attachments/tool receipts may only become known after the broker ran.
  // Keep the most recent causal exchange even in this final fallback gate.
  const recentExchange = exchanges.findLast(group => group[0]?.role === "user") || [];
  const additionalRecentTokens = tokenTotal(recentExchange.filter(item => !item._protected));
  if (requiredTokens + additionalRecentTokens > inputLimit) {
    const error = new Error(`当前消息、附件或工具结果与完整角色及最近一轮对话合计约 ${requiredTokens + additionalRecentTokens} tokens，超过本轮 ${inputLimit} tokens 的输入额度。请减少附件或工具结果，或选择更大的上下文预算；本轮没有静默丢弃对话后发送。`);
    error.code = "PROMPT_RECENT_EXCHANGE_TOO_LARGE";
    error.details = { stage: "final_transport", inputLimit, requiredTokens, minimumHistoryTokens: tokenTotal(recentExchange) };
    throw error;
  }
  for (const item of recentExchange) item._protected = true;
  required = list.filter(item => item._protected);
  requiredTokens = tokenTotal(required) + schemaTokens;
  const protectedBlockIds = [...new Set([
    ...configuredProtectedBlockIds,
    ...required.map(item => item._blockId),
  ])];
  let used = tokenTotal(list) + schemaTokens;
  const candidates = list
    .filter((item) => !item._protected)
    .sort((a, b) => omissionPriority(a) - omissionPriority(b) || a._index - b._index);
  for (const item of candidates) {
    if (used <= inputLimit) break;
    for (const member of historyGroups.get(item) || [item]) {
      if (!member.content) continue;
      used -= estimatePromptTokens(member.content) + 4;
      member.content = "";
      member._reason = omissionReason(member);
    }
  }

  const transportMessages = list
    .filter((item) => item.content)
    .map((item) => ({
      role: item.role,
      content: item.content,
      provenance: item._provenance,
    }));
  const finalInputTokens = tokenTotal(transportMessages) + schemaTokens;
  const ledgerItems = list.map((item) => ({
    index: item._index,
    role: item.role,
    blockId: item._blockId,
    ...(item._messageId ? { messageId: item._messageId } : {}),
    source: item._source,
    chars: item._originalChars,
    estimatedTokens: item._originalTokens,
    truncated: Boolean(item._reason),
    ...(item._reason ? { omittedReason: item._reason } : {}),
    originalTokens: item._originalTokens,
    finalTokens: item.content ? estimatePromptTokens(item.content) + 4 : 0,
    reason: item._reason,
    preview: String(item.content || "").slice(0, 180),
  }));
  const providerMode = String(options.providerMode || "chat");
  const prepared = createPreparedModelRequestV1({
    requestId: options.requestId,
    snapshotHash: String(options.snapshotHash || "").trim() || stableHash(
      normalizedHashInput(transportMessages, tools, options.toolChoice, providerMode),
    ),
    messages: transportMessages,
    tools,
    ...(options.toolChoice === undefined ? {} : { toolChoice: options.toolChoice }),
    budgetLedger: ledgerItems.map((item) => ({
      blockId: item.blockId,
      source: item.source,
      chars: item.chars,
      estimatedTokens: item.estimatedTokens,
      truncated: item.truncated,
      ...(item.omittedReason ? { omittedReason: item.omittedReason } : {}),
    })),
    protectedBlockIds,
    outputReserveTokens,
    providerMode,
  });
  const validation = validatePreparedModelRequestV1(prepared);
  if (!validation.ok) {
    throw new TypeError(`Invalid PreparedModelRequestV1: ${JSON.stringify(validation.errors)}`);
  }

  return {
    messages: prepared.messages,
    maxOutputTokens: outputReserveTokens,
    prepared,
    ledger: {
      version: 1,
      totalContextTokens,
      outputReserveTokens,
      safetyMarginTokens,
      inputLimit,
      originalInputTokens: list.reduce((sum, item) => sum + item._originalTokens, 0) + schemaTokens,
      requiredTokens,
      schemaTokens,
      finalInputTokens,
      remainingInputTokens: Math.max(0, inputLimit - finalInputTokens),
      withinBudget: finalInputTokens <= inputLimit,
      droppedMessages: ledgerItems.filter((item) => item.reason && !item.finalTokens).length,
      trimmedMessages: ledgerItems.filter((item) => item.reason && item.finalTokens).length,
      items: ledgerItems,
    },
  };
}

export function prepareModelRequestV1(input = {}) {
  return finalizeModelRequest(input.messages, input).prepared;
}

function tokenTotal(messages) {
  return messages.reduce((sum, item) => sum + estimatePromptTokens(item.content) + 4, 0);
}
