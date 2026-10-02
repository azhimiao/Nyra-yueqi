/**
 * V0.5 — Context Graph hot path helpers for Pop chat + director.
 * Retrieve/format for prompts; best-effort chat ingest. Never throws to callers.
 */

import { ingestCandidate } from "./pipeline.js";
import { retrieveContext } from "./retrieve.js";
import { userFactSpans } from "../memory/evidence.js";

const MAX_PROMPT_ITEMS = 6;
const MAX_LINE = 160;

/**
 * Format retrieved graph items for system / director prompt injection.
 * @param {object[]} items
 * @returns {string}
 */
export function formatContextGraphBlock(items) {
  const rows = (Array.isArray(items) ? items : [])
    .map((item) => {
      const text = String(item?.summary || item?.content || "").trim();
      if (!text) return "";
      const kind = item.kind || "memory";
      const verified = item.meta?.evidence?.length || item.meta?.verification === "user_confirmed";
      const legacy = !verified && /chat\.|candidate_promotion|model\./.test(String(item.source || ""));
      return `- [${kind}${legacy ? "；旧线索待确认，不能当作用户已说过" : ""}] ${text.slice(0, MAX_LINE)}`;
    })
    .filter(Boolean)
    .slice(0, MAX_PROMPT_ITEMS);
  if (!rows.length) return "";
  return `个人上下文图谱（仅本角色）：\n${rows.join("\n")}`;
}

/**
 * Retrieve + format for prompt. Empty characterId or errors → "".
 * @param {{
 *   characterId?: string,
 *   query?: string,
 *   limit?: number,
 *   nowIso?: string,
 * }} opts
 */
export function loadContextGraphPromptBlock(opts = {}) {
  try {
    const characterId = String(opts.characterId || "").trim();
    if (!characterId) return "";
    const res = retrieveContext({
      characterId,
      query: String(opts.query || "").trim(),
      limit: opts.limit ?? MAX_PROMPT_ITEMS,
      nowIso: opts.nowIso,
      forProactive: false,
      markUsed: false,
      includeFrozen: false,
    });
    if (!res?.ok || !res.items?.length) return "";
    return formatContextGraphBlock(res.items);
  } catch {
    return "";
  }
}

/**
 * Extract ingest candidates from a completed chat exchange.
 * Only user assertion spans become candidates; assistant replies are never evidence.
 * @param {{
 *   characterId: string,
 *   userText?: string,
 *   assistantText?: string,
 *   nowIso?: string,
 *   sourceRef?: string,
 * }} input
 * @returns {import("./schema.js").MemoryCandidate[]}
 */
export function chatTextsToCandidates(input = {}) {
  const characterId = String(input.characterId || "").trim();
  const userText = String(input.userText || "").trim();
  if (!characterId) return [];

  /** @type {import("./schema.js").MemoryCandidate[]} */
  const out = [];
  const nowIso = input.nowIso || new Date().toISOString();
  const sourceRef = String(input.sourceRef || `chat-${nowIso}`).slice(0, 80);

  // Durable user facts require user-authored evidence. Assistant prose may be
  // hallucinated and must never establish a preference/identity on its own.
  const blobs = userFactSpans(userText);
  for (const blob of blobs) {
    const matches = [blob];
    for (const m of matches) {
      const content = m.trim();
      if (content.length < 2) continue;
      out.push({
        content,
        summary: content.slice(0, 240),
        kind: /约定|边界|我们/.test(content) ? "relational" : "semantic",
        source: "chat.inferred",
        sourceRef: `${sourceRef}:${normalizeKey(content).slice(0, 24)}`,
        occurredAt: nowIso,
        confidence: 0.55,
        characterId,
        workspaceId: characterId,
        whyRemembered: "对话中提到的偏好/约定，供后续一致回复",
        tags: ["chat", "hot-path"],
        evidenceRefs: [sourceRef],
        memoryStatus: "accepted",
      });
    }
  }

  return out;
}

function normalizeKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .slice(0, 48);
}

/**
 * Best-effort ingest after assistant turn saved. Never throws; never blocks chat.
 * @param {{
 *   characterId: string,
 *   userText?: string,
 *   assistantText?: string,
 *   nowIso?: string,
 *   sourceRef?: string,
 * }} input
 */
export function ingestChatTurnBestEffort(input = {}) {
  try {
    const candidates = chatTextsToCandidates(input);
    if (!candidates.length) {
      return { ok: true, ingested: 0, results: [] };
    }
    const results = candidates.map((c) => ingestCandidate(c, { nowIso: input.nowIso }));
    return {
      ok: true,
      ingested: results.filter((r) => r.ok).length,
      results,
    };
  } catch (error) {
    console.warn("[yueqi.context] chat ingest failed", error);
    return { ok: false, ingested: 0, results: [], error };
  }
}
