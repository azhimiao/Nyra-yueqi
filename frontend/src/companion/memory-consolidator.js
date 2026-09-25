/**
 * Session-end / idle memory consolidation.
 * Extracts facts, dedupes, merges similar items, writes compact session summary.
 * Never injects full chat transcripts into long-term prompts.
 */

import { chatTextsToCandidates } from "../context/hot-path.js";
import { ingestCandidate, normalizeContentKey } from "../context/pipeline.js";
import { deleteItem, listItems, putItem } from "../context/store.js";
import { isFeatureEnabled } from "../features/flags.js";
import { isSuppressed, isSuppressedContent } from "../memory/suppression-ledger.js";
import { truncateTextToTokenBudget } from "../prompt/budget.js";

export const CONSOLIDATION_STORE_KEY = "yueqi.companion.consolidation.v1";
const MAX_SUMMARY_TOKENS = 220;
const MAX_FACTS = 12;

/** @type {object|null} */
let testBag = null;

export function __setConsolidationBagForTests(bag) {
  testBag = bag && typeof bag === "object" ? bag : null;
}

export function __clearConsolidationForTests() {
  testBag = null;
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      globalThis.localStorage.removeItem(CONSOLIDATION_STORE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function readBag() {
  if (testBag) return testBag;
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      const parsed = JSON.parse(globalThis.localStorage.getItem(CONSOLIDATION_STORE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : { sessions: {} };
    }
  } catch {
    /* ignore */
  }
  return { sessions: {} };
}

function writeBag(bag) {
  if (testBag) {
    Object.keys(testBag).forEach((k) => delete testBag[k]);
    Object.assign(testBag, bag);
    return;
  }
  try {
    globalThis?.localStorage?.setItem(CONSOLIDATION_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* quota */
  }
}

function sessionKey(characterId, sessionId) {
  return `${characterId}::${sessionId}`;
}

function extractSessionFacts(messages = [], characterId = "") {
  const facts = [];
  const seen = new Set();
  const rows = (Array.isArray(messages) ? messages : []).filter(
    (m) => m && (m.role === "user" || m.role === "assistant"),
  );

  for (let i = 0; i < rows.length; i += 1) {
    const user = rows[i]?.role === "user" ? String(rows[i].content || "").trim() : "";
    const assistant = rows[i + 1]?.role === "assistant"
      ? String(rows[i + 1].content || "").trim()
      : "";
    if (!user) continue;
    const candidates = chatTextsToCandidates({
      characterId,
      userText: user,
      assistantText: assistant,
      sourceRef: `consolidate-${i}`,
    });
    for (const c of candidates) {
      const key = normalizeContentKey(c.content);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      facts.push(c);
      if (facts.length >= MAX_FACTS) return facts;
    }
  }
  return facts;
}

function mergeSimilarFacts(facts = [], characterId = "") {
  const peers = listItems({ characterId, limit: 500 });
  const peerKeys = new Map(
    peers.map((p) => [normalizeContentKey(p.content), p]),
  );
  const merged = [];
  const deduped = [];
  for (const fact of facts) {
    const key = normalizeContentKey(fact.content);
    const existing = peerKeys.get(key);
    if (existing) {
      merged.push({ content: fact.content, mergedInto: existing.id, action: "reuse" });
      continue;
    }
    deduped.push(fact);
  }
  return { deduped, merged };
}

function buildSessionSummary(messages = [], facts = []) {
  const lines = (Array.isArray(messages) ? messages : [])
    .filter((m) => m?.role === "user" || m?.role === "assistant")
    .slice(-16)
    .map((m) => {
      const role = m.role === "user" ? "用户" : "角色";
      const text = String(m.content || "").trim();
      if (!text) return "";
      if (/喜欢|约定|决定|计划|纪念|生日|吵架|和好/.test(text)) {
        return `${role}：${text.slice(0, 64)}`;
      }
      return "";
    })
    .filter(Boolean);

  const factLines = facts.slice(0, 6).map((f) => `- ${String(f.summary || f.content || "").slice(0, 80)}`);
  const body = [
    lines.length ? "关键回合：" : "",
    ...lines.slice(-6),
    factLines.length ? "整理事实：" : "",
    ...factLines,
  ]
    .filter(Boolean)
    .join("\n");

  const trimmed = truncateTextToTokenBudget(body || "本次聊天无显著长期事实。", MAX_SUMMARY_TOKENS);
  return trimmed.text;
}

/**
 * @param {{
 *   characterId: string,
 *   sessionId: string,
 *   messages?: object[],
 *   nowIso?: string,
 *   ingest?: boolean,
 * }} input
 */
export function consolidateSessionMemory(input = {}) {
  const characterId = String(input.characterId || "").trim();
  const sessionId = String(input.sessionId || "").trim();
  if (!characterId || !sessionId) {
    return { ok: false, reason: "missing_session_context" };
  }

  const messages = Array.isArray(input.messages) ? input.messages : [];
  const nowIso = input.nowIso || new Date().toISOString();
  const extractedFacts = extractSessionFacts(messages, characterId);
  const { deduped, merged } = mergeSimilarFacts(extractedFacts, characterId);
  const summary = buildSessionSummary(messages, deduped);

  // + palaceProjectionV1 OR contextGraphProjectionOnlyV1 → projection-only.
  // Must NOT ingest candidates / promote as stable-fact authority (Stable Ledger owns facts).
  // Session summary may still be stored as branch_summary projection for UI/repair.
  const projectionMode =
    isFeatureEnabled("palaceProjectionV1")
    || isFeatureEnabled("contextGraphProjectionOnlyV1");
  const forgetOn = isFeatureEnabled("unifiedMemoryForgetV1");
  const ingested = [];
  if (projectionMode && input.forceAuthoritativeIngest === true) {
    // Guard: refuse authority write even if a caller tries to override.
    console.warn("[yueqi.cp9] refusing forceAuthoritativeIngest while projection-only mode is on");
  }
  if (input.ingest !== false && !projectionMode) {
    for (const fact of deduped) {
      const sourceRef = `session:${sessionId}:${normalizeContentKey(fact.content).slice(0, 24)}`;
      // never resurrect forgotten facts from old chat when forget flag is on.
      if (
        forgetOn
        && (
          isSuppressedContent(fact.content)
          || isSuppressed(sourceRef)
          || isSuppressed(fact.sourceRef)
        )
      ) {
        ingested.push({ stage: "suppressed", ok: false, reason: "suppressed", content: fact.content });
        continue;
      }
      const result = ingestCandidate(
        {
          ...fact,
          source: "companion.consolidated",
          sourceRef,
          tags: [...(fact.tags || []), "cp9", "consolidated"],
        },
        { nowIso },
      );
      ingested.push(result);
    }
  }

  const bag = readBag();
  bag.sessions = bag.sessions || {};
  bag.sessions[sessionKey(characterId, sessionId)] = {
    characterId,
    sessionId,
    summary,
    factCount: deduped.length,
    mergedCount: merged.length,
    messageCount: messages.length,
    updatedAt: nowIso,
    authority: projectionMode ? "projection" : "consolidator",
  };
  writeBag(bag);

  const summaryItem = {
    id: `consolidated-summary:${sessionId}`,
    kind: projectionMode ? "branch_summary" : "episodic",
    characterId,
    workspaceId: characterId,
    content: summary,
    summary: summary.slice(0, 240),
    source: projectionMode ? "companion.branch_summary_projection" : "companion.session_summary",
    sourceRef: sessionId,
    sourceType: projectionMode ? "branch_summary" : undefined,
    sourceId: projectionMode ? sessionId : undefined,
    memoryStatus: projectionMode ? "projection" : "accepted",
    authority: projectionMode ? "projection" : "consolidator",
    retention: "rolling_90d",
    tags: projectionMode
      ? ["cp9", "session-summary", "projection", "branch_summary"]
      : ["cp9", "session-summary"],
    whyRemembered: projectionMode
      ? "会话压缩投影（非稳定事实权威）"
      : "会话结束时的压缩摘要，非完整聊天记录",
    updatedAt: nowIso,
  };
  if (input.ingest !== false) {
    // Projection mode: still store the summary for UI/repair, but tagged non-authoritative.
    putItem(summaryItem);
  }

  return {
    ok: true,
    characterId,
    sessionId,
    facts: projectionMode ? [] : deduped.map((f) => f.content),
    merged,
    ingested,
    summary,
    promptBlock: formatConsolidatedPromptBlock(summary),
    messageCount: messages.length,
    consolidatedAt: nowIso,
    authority: projectionMode ? "projection" : "consolidator",
    skippedFactIngest: projectionMode,
  };
}

/**
 * Compact block for long-term prompt — summary only, never full chat.
 * @param {string} summary
 */
export function formatConsolidatedPromptBlock(summary) {
  const text = String(summary || "").trim();
  if (!text) return "";
  return `近期会话整理（摘要，非原文）：\n${text.slice(0, 480)}`;
}

/**
 * @param {string} characterId
 * @param {string} sessionId
 */
export function getSessionConsolidation(characterId, sessionId) {
  const bag = readBag();
  return bag.sessions?.[sessionKey(characterId, sessionId)] || null;
}

/** Drop the session summary so the next consolidation rebuilds from live history. */
export function invalidateSessionConsolidation({ characterId, sessionId } = {}) {
  const cid = String(characterId || "").trim();
  const sid = String(sessionId || "").trim();
  if (!cid || !sid) return { ok: true, removed: false };
  const bag = readBag();
  const key = sessionKey(cid, sid);
  const existed = Boolean(bag.sessions?.[key]);
  if (existed) {
    delete bag.sessions[key];
    writeBag(bag);
  }
  deleteItem(`consolidated-summary:${sid}`);
  return { ok: true, removed: existed };
}
