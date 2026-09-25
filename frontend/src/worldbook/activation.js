/**
 * World Info Activation V1 — scope, priority, combination triggers,
 * deterministic sort, and budget (§6.3).
 */

import { estimatePromptTokens, truncateTextToTokenBudget } from "../prompt/budget.js";
import {
  normalizeWorldbookEntry,
  entryMatchesQuery,
  entryInScope,
} from "./match.js";
import { createEmptyLoreActivationTrace, recordLoreActivation, finalizeLoreActivationTrace } from "./trace.js";

/**
 * Deterministic sort: priority desc → title asc → id asc.
 * @param {object[]} entries
 * @returns {object[]}
 */
export function sortLoreEntriesDeterministic(entries) {
  return [...(Array.isArray(entries) ? entries : [])].sort((a, b) => {
    const pa = Number(a.priority) || 0;
    const pb = Number(b.priority) || 0;
    if (pb !== pa) return pb - pa;
    const ta = String(a.title || "");
    const tb = String(b.title || "");
    if (ta !== tb) return ta.localeCompare(tb, "en");
    return String(a.id || "").localeCompare(String(b.id || ""), "en");
  });
}

/** Build a bounded activation window: recent turns are evidence, current user input is last/highest weight. */
export function buildLoreActivationQuery(currentInput, recentMessages = [], opts = {}) {
  const tokenBudget = Math.max(128, Number(opts.tokenBudget) || 1000);
  const maxMessages = Math.max(0, Number(opts.maxMessages) || 8);
  const rows = (Array.isArray(recentMessages) ? recentMessages : [])
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .slice(-maxMessages)
    .map((item) => `${item.role}: ${String(item.content ?? item.text ?? "")}`);
  rows.push(`current_user: ${String(currentInput || "")}`);
  const selected = [];
  let used = 0;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const cost = estimatePromptTokens(rows[index]);
    if (used + cost > tokenBudget && selected.length) continue;
    if (cost > tokenBudget) continue;
    selected.unshift(rows[index]);
    used += cost;
  }
  return { text: selected.join("\n"), tokens: used, messageCount: Math.max(0, selected.length - 1) };
}

function positionGroup(position) {
  const value = String(position || "after_scenario");
  return value === "post_history" || value === "after_history" ? "after" : "before";
}

function formatActivated(entries) {
  return entries.map((entry, index) => {
    const scope = entry.scope || "global";
    return `${index + 1}. [${scope} / ${entry.category} / p${entry.priority}] ${entry.title}: ${entry.content}`;
  }).join("\n");
}

export function formatLoreActivationTexts(entries = []) {
  const beforeEntries = entries.filter((entry) => positionGroup(entry.insertPosition) === "before");
  const afterEntries = entries.filter((entry) => positionGroup(entry.insertPosition) === "after");
  const beforeText = formatActivated(beforeEntries);
  const afterText = formatActivated(afterEntries);
  return {
    beforeEntries,
    afterEntries,
    beforeText,
    afterText,
    text: [beforeText, afterText].filter(Boolean).join("\n"),
  };
}

/**
 * Activate lore for one generation turn.
 * @param {object[]} entries
 * @param {string} query
 * @param {{
 *   scopeContext?: object,
 *   tokenBudget?: number,
 *   scanDepth?: number,
 *   turnIndex?: number,
 *   stickyState?: Record<string, number>,
 *   cooldownState?: Record<string, number>,
 * }} [opts]
 * @returns {{
 *   activated: object[],
 *   trimmed: object[],
 *   trace: object,
 *   text: string,
 * }}
 */
export function activateWorldInfo(entries, query, opts = {}) {
  const requestedBudget = opts.tokenBudget == null ? 800 : Number(opts.tokenBudget);
  const tokenBudget = Math.max(0, Number.isFinite(requestedBudget) ? requestedBudget : 800);
  const turnIndex = Number(opts.turnIndex) || 0;
  const stickyState = opts.stickyState && typeof opts.stickyState === "object" ? opts.stickyState : {};
  const cooldownState = opts.cooldownState && typeof opts.cooldownState === "object"
    ? opts.cooldownState
    : {};
  const scopeContext = opts.scopeContext || {};
  const scanDepth = opts.scanDepth;
  const activationWindow = buildLoreActivationQuery(query, opts.recentMessages, {
    tokenBudget: opts.activationQueryBudget || 1000,
    maxMessages: opts.recentMessageLimit || 8,
  });

  const trace = createEmptyLoreActivationTrace({
    query: activationWindow.text,
    tokenBudget,
    turnIndex,
  });

  const list = (Array.isArray(entries) ? entries : []).map(normalizeWorldbookEntry);
  const candidates = [];

  for (const entry of list) {
    if (entry.enabled === false) {
      recordLoreActivation(trace, {
        entry,
        activated: false,
        reason: "disabled",
      });
      continue;
    }

    if (!entryInScope(entry, scopeContext)) {
      recordLoreActivation(trace, {
        entry,
        activated: false,
        reason: "scope_mismatch",
      });
      continue;
    }

    const coolUntil = Number(cooldownState[entry.id]) || 0;
    if (coolUntil > turnIndex) {
      recordLoreActivation(trace, {
        entry,
        activated: false,
        reason: `cooldown_until_${coolUntil}`,
      });
      continue;
    }

    const delay = Number(entry.delayTurns) || 0;
    if (delay > 0 && turnIndex < delay) {
      recordLoreActivation(trace, {
        entry,
        activated: false,
        reason: `delay_until_${delay}`,
      });
      continue;
    }

    const stickyUntil = Number(stickyState[entry.id]) || 0;
    const stickyActive = stickyUntil > turnIndex;
    const matched = entry.constant || stickyActive || entryMatchesQuery(entry, activationWindow.text, { scanDepth });

    if (!matched) {
      recordLoreActivation(trace, {
        entry,
        activated: false,
        reason: "no_key_match",
      });
      continue;
    }

    candidates.push({
      entry,
      reason: entry.constant
        ? "constant"
        : stickyActive
          ? "sticky"
          : "key_match",
    });
  }

  const sorted = sortLoreEntriesDeterministic(candidates.map((c) => c.entry));
  const reasonById = new Map(candidates.map((c) => [c.entry.id, c.reason]));

  const activated = [];
  const trimmed = [];
  let used = 0;

  for (const entry of sorted) {
    const content = String(entry.content || "");
    const remaining = Math.max(0, tokenBudget - used);
    const ownBudget = Number(entry.tokenBudget) > 0 ? Number(entry.tokenBudget) : remaining;
    const allowed = Math.max(0, Math.min(remaining, ownBudget) - 8);
    const clipped = truncateTextToTokenBudget(content, allowed);
    const cost = clipped.tokens ? clipped.tokens + 8 : 0;
    const insertPosition = entry.insertPosition || "after_scenario";

    if (!clipped.text || used + cost > tokenBudget) {
      trimmed.push(entry);
      recordLoreActivation(trace, {
        entry,
        activated: false,
        reason: "budget_trimmed",
        insertPosition,
        tokens: cost,
      });
      continue;
    }

    used += cost;
    const activatedEntry = clipped.truncated
      ? { ...entry, content: clipped.text, _contentTruncated: true }
      : entry;
    activated.push(activatedEntry);
    recordLoreActivation(trace, {
      entry: activatedEntry,
      activated: true,
      reason: reasonById.get(entry.id) || "key_match",
      insertPosition,
      tokens: cost,
    });
  }

  finalizeLoreActivationTrace(trace, { usedTokens: used });

  return {
    activated,
    trimmed,
    trace,
    activationWindow,
    ...formatLoreActivationTexts(activated),
  };
}
