import { estimatePromptTokens, truncateTextToTokenBudget } from "../prompt/budget.js";
import { getSession, getSharedHistory } from "../conversation/index.js";

export const BRANCH_SUMMARY_KEY = "yueqi.context.branchSummaries.v1";
const MAX_VERSIONS_PER_BRANCH = 5;
const RECENT_MESSAGES_TO_KEEP = 8;

let testStorage = null;

export function __setBranchSummaryStorageForTests(storage) {
  testStorage = storage;
}

function storage() {
  if (testStorage) return testStorage;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readBag() {
  try {
    const parsed = JSON.parse(storage()?.getItem(BRANCH_SUMMARY_KEY) || "null");
    return parsed && typeof parsed === "object"
      ? { schemaVersion: 1, branches: parsed.branches || {} }
      : { schemaVersion: 1, branches: {} };
  } catch {
    return { schemaVersion: 1, branches: {} };
  }
}

function writeBag(bag) {
  try {
    storage()?.setItem(BRANCH_SUMMARY_KEY, JSON.stringify(bag));
  } catch {
    /* quota: summary is an optimization, never block chat */
  }
  return bag;
}

function branchKey(characterId, sessionId, branchId) {
  // Primary identity is conversation+branch; characterId is retained for audit only.
  return `${String(sessionId)}::${String(branchId)}::${String(characterId || "")}`;
}

function hashText(text) {
  let hash = 2166136261;
  const seed = String(text || "");
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/** Content-aware fingerprint — length-only collisions are rejected. */
export function sourceFingerprint(messages) {
  return messages
    .map((item) => {
      const id = item.messageId || item.id || "";
      const candidate = item.candidateId || "";
      const body = String(item.content || "").trim();
      return `${id}:${candidate}:${hashText(body)}:${body.length}`;
    })
    .join("|");
}

function extractiveSummary(messages, tokenBudget = 500) {
  const meaningful = messages
    .map((item) => `${item.role === "user" ? "用户" : "角色"}：${String(item.content || "").trim()}`)
    .filter((line) => line.length > 3);
  const picked = meaningful.filter((line) => /喜欢|讨厌|决定|约定|记得|今天|昨天|一起|完成|计划|边界|希望|需要/.test(line));
  const source = (picked.length ? picked : meaningful).slice(-12).join("\n");
  return truncateTextToTokenBudget(source, tokenBudget).text;
}

export function getBranchSummary({ characterId, conversationSessionId, branchId }) {
  const rows = readBag().branches[branchKey(characterId, conversationSessionId, branchId)] || [];
  return rows.find((item) => item.status === "active") || null;
}

export function listBranchSummaryVersions({ characterId, conversationSessionId, branchId }) {
  return [...(readBag().branches[branchKey(characterId, conversationSessionId, branchId)] || [])];
}

export function invalidateBranchSummary({ characterId, conversationSessionId, branchId, reason = "branch_changed" }) {
  const bag = readBag();
  const key = branchKey(characterId, conversationSessionId, branchId);
  const rows = bag.branches[key] || [];
  bag.branches[key] = rows.map((item) => item.status === "active"
    ? { ...item, status: "invalidated", invalidatedAt: new Date().toISOString(), invalidationReason: reason }
    : item);
  writeBag(bag);
}

/**
 * Invalidate every active summary for one conversation. A message mutation can
 * affect summaries owned by different participants in group/scenario sessions,
 * so filtering only by character would leave stale text visible.
 */
export function invalidateBranchSummariesForConversation({
  conversationSessionId,
  reason = "conversation_message_changed",
} = {}) {
  const sessionId = String(conversationSessionId || "").trim();
  if (!sessionId) return { ok: true, invalidated: 0 };
  const prefix = `${sessionId}::`;
  const bag = readBag();
  const now = new Date().toISOString();
  let invalidated = 0;

  for (const [key, rows] of Object.entries(bag.branches)) {
    if (!key.startsWith(prefix) || !Array.isArray(rows)) continue;
    bag.branches[key] = rows.map((item) => {
      if (item?.status !== "active") return item;
      invalidated += 1;
      return {
        ...item,
        status: "invalidated",
        invalidatedAt: now,
        invalidationReason: reason,
      };
    });
  }
  if (invalidated) writeBag(bag);
  return { ok: true, invalidated };
}

export function commitBranchSummary(input = {}) {
  const characterId = String(input.characterId || "").trim();
  const conversationSessionId = String(input.conversationSessionId || "").trim();
  const branchId = String(input.branchId || "").trim();
  const summary = String(input.summary || "").trim();
  const sourceMessages = Array.isArray(input.sourceMessages) ? input.sourceMessages : [];
  if (!characterId || !conversationSessionId || !branchId || !summary || !sourceMessages.length) {
    return { ok: false, reason: "incomplete_summary" };
  }
  const bag = readBag();
  const key = branchKey(characterId, conversationSessionId, branchId);
  const previous = bag.branches[key] || [];
  const fingerprint = sourceFingerprint(sourceMessages);
  const current = previous.find((item) => item.status === "active");
  if (current?.sourceFingerprint === fingerprint) return { ok: true, reused: true, value: current };

  const now = new Date().toISOString();
  const invalidated = previous.map((item) => item.status === "active"
    ? { ...item, status: "superseded", invalidatedAt: now, invalidationReason: "new_source_prefix" }
    : item);
  const value = {
    id: `bs-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 7)}`,
    schemaVersion: 1,
    characterId,
    conversationSessionId,
    branchId,
    headMessageId: String(input.headMessageId || sourceMessages[sourceMessages.length - 1]?.messageId || ""),
    sourceMessageIds: sourceMessages.map((item) => String(item.messageId || item.id || "")).filter(Boolean),
    sourceCandidateIds: sourceMessages.map((item) => String(item.candidateId || "")).filter(Boolean),
    sourceFingerprint: fingerprint,
    summary,
    tokens: estimatePromptTokens(summary),
    source: String(input.source || "extractive"),
    status: "active",
    createdAt: now,
  };
  bag.branches[key] = [value, ...invalidated].slice(0, MAX_VERSIONS_PER_BRANCH);
  writeBag(bag);
  return { ok: true, value };
}

/**
 * Refresh a branch summary when the branch exceeds the configured threshold.
 * `summarize` is optional and may call an LLM.  Failure falls back to an
 * explicitly-labelled extractive summary and never blocks the main response.
 */
const inflightByBranch = new Map();

function sessionAllowsCharacter(session, characterId) {
  if (!session) return false;
  const cid = String(characterId || "").trim();
  if (!cid) return true;
  if (session.characterId === cid) return true;
  if (String(session.meta?.productCharacterId || "") === cid) return true;
  // Synthetic group/scenario/project owners: any speaking member may refresh.
  if (String(session.characterId || "").startsWith("__")) return true;
  return false;
}

export async function refreshBranchSummary(input = {}) {
  const characterId = String(input.characterId || "").trim();
  const conversationSessionId = String(input.conversationSessionId || "").trim();
  const session = getSession(conversationSessionId);
  if (!session || !sessionAllowsCharacter(session, characterId)) {
    return { ok: false, reason: "session_not_found" };
  }
  const branchId = String(input.branchId || session.activeBranchId || "");
  const lockKey = `${conversationSessionId}::${branchId}`;
  if (inflightByBranch.has(lockKey)) {
    return inflightByBranch.get(lockKey);
  }

  const run = (async () => {
    const history = getSharedHistory(conversationSessionId, { branchId });
    const historyTokens = history.reduce((sum, item) => sum + estimatePromptTokens(item.content) + 4, 0);
    const thresholdTokens = Math.max(600, Number(input.thresholdTokens) || 3000);
    const thresholdMessages = Math.max(8, Number(input.thresholdMessages) || 12);
    if (history.length < thresholdMessages && historyTokens < thresholdTokens) {
      return { ok: true, skipped: true, reason: "below_threshold", historyTokens, historyMessages: history.length };
    }

    const prefix = history.slice(0, Math.max(0, history.length - (Number(input.keepRecentMessages) || RECENT_MESSAGES_TO_KEEP)));
    if (!prefix.length) return { ok: true, skipped: true, reason: "no_evictable_prefix" };
    const summaryOwner = characterId || session.meta?.productCharacterId || session.characterId;
    const existing = getBranchSummary({ characterId: summaryOwner, conversationSessionId, branchId });
    if (existing?.sourceFingerprint === sourceFingerprint(prefix)) {
      return { ok: true, skipped: true, reason: "up_to_date", value: existing };
    }

    let summary = "";
    let source = "extractive";
    if (typeof input.summarize === "function") {
      try {
        summary = String(await input.summarize(prefix, {
          characterId: summaryOwner,
          conversationSessionId,
          branchId,
          previousSummary: existing?.summary || "",
        }) || "").trim();
        if (summary) source = "model";
      } catch {
        // Keep previous active summary on model failure.
        if (existing?.summary) return { ok: true, skipped: true, reason: "model_failed_keep_previous", value: existing };
        summary = "";
      }
    }
    if (!summary) summary = extractiveSummary(prefix, Number(input.summaryTokenBudget) || 500);
    if (!summary) return { ok: false, reason: "summary_empty" };
    return commitBranchSummary({
      characterId: summaryOwner,
      conversationSessionId,
      branchId,
      sourceMessages: prefix,
      headMessageId: prefix[prefix.length - 1]?.messageId,
      summary,
      source,
    });
  })();

  inflightByBranch.set(lockKey, run);
  try {
    return await run;
  } finally {
    inflightByBranch.delete(lockKey);
  }
}

export function formatBranchSummaryBlock(summary) {
  if (!summary?.summary || summary.status !== "active") return "";
  return [
    "较早对话摘要（只用于延续当前分支；若与最近原文冲突，以最近原文为准）：",
    summary.summary,
  ].join("\n");
}

export function exportBranchSummaryBag() {
  return JSON.parse(JSON.stringify(readBag()));
}

export function importBranchSummaryBag(input) {
  const branches = input?.branches && typeof input.branches === "object" ? input.branches : {};
  return writeBag({ schemaVersion: 1, branches: JSON.parse(JSON.stringify(branches)) });
}
