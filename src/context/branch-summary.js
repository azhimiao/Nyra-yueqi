import { estimatePromptTokens, truncateTextToTokenBudget } from "../prompt/budget.js";
import { getSession, getSharedHistory } from "../conversation/index.js";
import { filterSuppressedHistoryMessages, isSuppressed, isSuppressedContent } from "../memory/suppression-ledger.js";
import { userFactSpans, FORGET_DIRECTIVE } from "../memory/evidence.js";

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
  const users = messages.filter((item) => item.role === "user" && !FORGET_DIRECTIVE.test(String(item.content || "").trim()));
  const perMessage = Math.max(24, Math.floor(tokenBudget / Math.max(1, Math.min(users.length, 12))) - 12);
  const lines = users.slice(-12).map((item) => {
    const body = String(item.content || "").trim();
    const label = /[?？]/.test(body) ? "用户提问（未确认事实）" : "用户原话";
    return `${label}：${truncateTextToTokenBudget(body, perMessage).text}`;
  });
  return truncateTextToTokenBudget(lines.join("\n"), tokenBudget).text;
}

/** The model may select evidence; it may not invent a paraphrased user fact. */
export function buildBranchSummaryModelMessages(messages) {
  return [{ role: "system", content: [
    "从用户原文选择对后续对话有用的事实证据，只输出 JSON：{\"facts\":[{\"messageId\":\"原ID\",\"evidenceSpan\":\"原文连续子串\"}]}。",
    "最多12项。不要改写。用户问句、假设、引用、角色设定及助手提出的猜测不能作为用户事实。无证据返回空数组。",
  ].join("\n") }, { role: "user", content: JSON.stringify(messages.filter((row) => row.role === "user").map((row) => ({ messageId: String(row.messageId || row.id || ""), content: row.content }))) }];
}

function verifiedModelSummary(raw, messages, tokenBudget) {
  try {
    const parsed = JSON.parse(String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    if (!Array.isArray(parsed.facts) || !parsed.facts.length) return null;
    const facts = parsed.facts.slice(0, 12).map((fact) => {
      const row = messages.find((message) => String(message.messageId || message.id) === String(fact.messageId) && message.role === "user");
      const span = String(fact.evidenceSpan || "").trim();
      const assertion = row && userFactSpans(row.content).find((quote) => quote.includes(span.replace(/[。！!]+$/, "")));
      if (span.length < 2 || !assertion) throw new Error("unsupported_summary_claim");
      return { messageId: String(fact.messageId), role: "user", span: assertion };
    });
    return { summary: truncateTextToTokenBudget(facts.map((fact) => `用户明确陈述：${fact.span}`).join("\n"), tokenBudget).text, evidence: facts };
  } catch { return null; }
}

export function getBranchSummary({ characterId, conversationSessionId, branchId }) {
  const rows = readBag().branches[branchKey(characterId, conversationSessionId, branchId)] || [];
  const row = rows.find((item) => item.status === "active");
  if (!row || row.evidenceVersion !== 1) return null;
  const query = { companionId: characterId };
  if (isSuppressedContent(row.summary, query) || (row.sourceMessageIds || []).some((id) => isSuppressed(id, query))) return null;
  const session = getSession(conversationSessionId);
  if (session) {
    const ids = new Set(row.sourceMessageIds || []);
    const current = filterSuppressedHistoryMessages(getSharedHistory(conversationSessionId, { branchId }), query).filter((item) => ids.has(String(item.messageId || item.id)));
    if (current.length !== ids.size || sourceFingerprint(current) !== row.sourceFingerprint) return null;
  }
  return row;
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
  if (current?.sourceFingerprint === fingerprint && current.evidenceVersion === 1) return { ok: true, reused: true, value: current, persisted: input.persist !== false };

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
    evidenceVersion: input.source === "model" && !Array.isArray(input.evidence) ? 0 : 1,
    evidence: input.evidence || [],
    verification: input.source === "model" && !Array.isArray(input.evidence) ? "legacy_unverified" : "source_verified",
    status: "active",
    createdAt: now,
  };
  if (input.persist !== false) {
    bag.branches[key] = [value, ...invalidated].slice(0, MAX_VERSIONS_PER_BRANCH);
    writeBag(bag);
  }
  return { ok: true, value, persisted: input.persist !== false };
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
  const lockKey = `${conversationSessionId}::${branchId}::${characterId}::${input.persist === false ? "preview" : "write"}::${JSON.stringify(input.omittedMessageIds || input.sourceMessageIds || [])}`;
  if (inflightByBranch.has(lockKey)) {
    return inflightByBranch.get(lockKey);
  }

  const run = (async () => {
    const query = { companionId: characterId || session.meta?.productCharacterId || session.characterId };
    const history = filterSuppressedHistoryMessages(getSharedHistory(conversationSessionId, { branchId }), query);
    const historyTokens = history.reduce((sum, item) => sum + estimatePromptTokens(item.content) + 4, 0);
    const thresholdTokens = Math.max(600, Number(input.thresholdTokens) || 3000);
    const thresholdMessages = Math.max(8, Number(input.thresholdMessages) || 12);
    const exactIds = Array.isArray(input.omittedMessageIds) ? input.omittedMessageIds : Array.isArray(input.sourceMessageIds) ? input.sourceMessageIds : null;
    if (exactIds === null && history.length < thresholdMessages && historyTokens < thresholdTokens) {
      return { ok: true, skipped: true, reason: "below_threshold", historyTokens, historyMessages: history.length };
    }

    const wanted = exactIds ? new Set(exactIds.map(String)) : null;
    const prefix = wanted ? history.filter((row) => wanted.has(String(row.messageId || row.id))) : history.slice(0, Math.max(0, history.length - (Number(input.keepRecentMessages) || RECENT_MESSAGES_TO_KEEP)));
    if (!prefix.length) return { ok: true, skipped: true, reason: "no_evictable_prefix" };
    const summaryOwner = characterId || session.meta?.productCharacterId || session.characterId;
    const existing = getBranchSummary({ characterId: summaryOwner, conversationSessionId, branchId });
    if (existing?.sourceFingerprint === sourceFingerprint(prefix)) {
      return { ok: true, skipped: true, reason: "up_to_date", value: existing };
    }

    let summary = "";
    let source = "extractive";
    let evidence = [];
    const budget = Number(input.summaryTokenBudget) || 500;
    const initialFingerprint = sourceFingerprint(prefix);
    if (typeof input.summarize === "function") {
      try {
        const raw = await input.summarize(prefix, {
          characterId: summaryOwner,
          conversationSessionId,
          branchId,
          previousSummary: "", // Derived prose is never reintroduced as primary evidence.
        });
        const verified = verifiedModelSummary(raw, prefix, budget);
        if (verified) { summary = verified.summary; evidence = verified.evidence; source = "model"; }
      } catch {
        // Keep previous active summary on model failure.
        if (existing?.summary && existing.sourceFingerprint === sourceFingerprint(prefix)) return { ok: true, skipped: true, reason: "model_failed_keep_previous", value: existing };
        summary = "";
      }
    }
    const sourceIds = new Set(prefix.map((row) => String(row.messageId || row.id)));
    const latest = filterSuppressedHistoryMessages(getSharedHistory(conversationSessionId, { branchId }), query).filter((row) => sourceIds.has(String(row.messageId || row.id)));
    if (sourceFingerprint(latest) !== initialFingerprint) return { ok: false, reason: "source_changed_during_summary" };
    if (!summary) summary = extractiveSummary(prefix, budget);
    if (!summary) return { ok: false, reason: "summary_empty" };
    return commitBranchSummary({
      characterId: summaryOwner,
      conversationSessionId,
      branchId,
      sourceMessages: prefix,
      headMessageId: prefix[prefix.length - 1]?.messageId,
      summary,
      source,
      evidence,
      persist: input.persist,
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
