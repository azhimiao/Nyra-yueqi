/**
 * Hard prompt budgeting.
 *
 * The previous implementation budgeted each tier independently, never trimmed
 * protected blocks and sliced arbitrary characters.  That could exceed the
 * declared model window and corrupt structured context.  This module keeps the
 * public API but enforces a global ceiling and trims at line/sentence boundaries.
 */

/** @typedef {"permanent"|"high"|"mid"|"truncatable"} BudgetTier */

export const BUDGET_TIERS = Object.freeze(["permanent", "high", "mid", "truncatable"]);

export const DEFAULT_BUDGET_RATIOS = Object.freeze({
  permanent: 0.28,
  high: 0.32,
  mid: 0.25,
  truncatable: 0.15,
});

export const PERMANENT_BLOCK_IDS = Object.freeze([
  "platform_safety",
  "character_package",
  "character",
  "user_input",
  "post_history_contract",
  "runtime_protocol",
]);

export const HIGH_BLOCK_IDS = Object.freeze([
  "world_info",
  "world_info_after",
  "branch_history",
  "relationship_state",
  "temporal_context",
  "relationship_continuity",
  "relationship_context",
  "world_context",
  "world_context_after",
  "runtime_context",
]);

export const MID_BLOCK_IDS = Object.freeze([
  "long_term_memory",
  "relevant_memories",
  "branch_summary",
  "mode_context",
  "experience_package",
  "opening_scene_state",
]);

const PROTECTED_PRIORITY = Object.freeze([
  "platform_safety",
  "user_input",
  "character_package",
  "post_history_contract",
]);

/**
 * Conservative tokenizer-independent estimate.  CJK is close to one token per
 * character; latin words average around four characters per token.  A small
 * punctuation allowance keeps us on the safe side across providers.
 */
export function estimatePromptTokens(text = "") {
  const value = String(text || "");
  if (!value) return 0;
  const cjk = (value.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const latinRuns = value
    .replace(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g, " ")
    .match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || [];
  const latin = latinRuns.reduce((sum, part) => {
    if (/^[A-Za-z0-9_]+$/.test(part)) return sum + Math.max(1, Math.ceil(part.length / 4));
    return sum + 1;
  }, 0);
  return Math.max(1, cjk + latin);
}

/** @param {string} id @returns {BudgetTier} */
export function tierForBlock(id) {
  if (PERMANENT_BLOCK_IDS.includes(id)) return "permanent";
  if (HIGH_BLOCK_IDS.includes(id)) return "high";
  if (MID_BLOCK_IDS.includes(id)) return "mid";
  return "truncatable";
}

/**
 * @param {number} totalBudget
 * @param {Partial<Record<BudgetTier, number>>} ratios
 */
export function allocateTierBudgets(totalBudget = 6000, ratios = {}) {
  const total = Math.max(256, Number(totalBudget) || 6000);
  const r = { ...DEFAULT_BUDGET_RATIOS, ...(ratios || {}) };
  const positive = Object.fromEntries(BUDGET_TIERS.map((tier) => [tier, Math.max(0, Number(r[tier]) || 0)]));
  const ratioTotal = Object.values(positive).reduce((sum, value) => sum + value, 0) || 1;
  const out = Object.fromEntries(BUDGET_TIERS.map((tier) => [tier, Math.floor(total * positive[tier] / ratioTotal)]));
  const used = Object.values(out).reduce((sum, value) => sum + value, 0);
  out.permanent += Math.max(0, total - used);
  return /** @type {Record<BudgetTier, number>} */ (out);
}

function candidateBoundaries(text) {
  const value = String(text || "").trim();
  if (!value) return [];
  const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const chunks = [];
  for (const line of lines) {
    const sentences = line.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [line];
    for (const sentence of sentences) {
      const clean = sentence.trim();
      if (clean) chunks.push(clean);
    }
  }
  return chunks;
}

/**
 * Boundary-aware truncation.  Never cuts JSON/lines in the middle when at
 * least one whole unit fits.  A single oversize unit is omitted instead of
 * returning malformed structured data.
 */
export function truncateTextToTokenBudget(text, tokenBudget, opts = {}) {
  const max = Math.max(0, Number(tokenBudget) || 0);
  const value = String(text || "").trim();
  const originalTokens = estimatePromptTokens(value);
  if (!value || max <= 0) return { text: "", tokens: 0, truncated: Boolean(value), originalTokens };
  if (originalTokens <= max) return { text: value, tokens: originalTokens, truncated: false, originalTokens };

  const chunks = candidateBoundaries(value);
  const kept = [];
  let used = 0;
  for (const chunk of chunks) {
    const cost = estimatePromptTokens(chunk) + (kept.length ? 1 : 0);
    if (used + cost > max) break;
    kept.push(chunk);
    used += cost;
  }
  const joined = kept.join("\n");
  if (joined) return { text: joined, tokens: estimatePromptTokens(joined), truncated: true, originalTokens };

  // Plain free text may be clipped only when the caller explicitly allows it.
  if (opts.allowFragment === true) {
    let lo = 0;
    let hi = value.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (estimatePromptTokens(value.slice(0, mid)) <= max) lo = mid;
      else hi = mid - 1;
    }
    const fragment = value.slice(0, lo).trim();
    return { text: fragment, tokens: estimatePromptTokens(fragment), truncated: true, originalTokens };
  }
  return { text: "", tokens: 0, truncated: true, originalTokens };
}

/**
 * Apply tier budgets while enforcing a global hard ceiling.  Protected blocks
 * are reserved first; all other blocks may borrow unused global capacity but
 * can never push totalUsed over totalBudget.
 */
export function applyBudget(blocks, opts = {}) {
  const totalBudget = Math.max(256, Number(opts.totalBudget) || 6000);
  const tierBudgets = allocateTierBudgets(totalBudget, opts.ratios);
  const list = (Array.isArray(blocks) ? blocks : []).map((block) => ({
    id: String(block?.id || "unknown"),
    text: String(block?.text || ""),
    source: String(block?.source || "assembler"),
  }));
  const allocations = new Map();
  let globalUsed = 0;

  for (const id of PROTECTED_PRIORITY) {
    const block = list.find((item) => item.id === id);
    if (!block?.text) continue;
    const remaining = Math.max(0, totalBudget - globalUsed);
    const trimmed = truncateTextToTokenBudget(block.text, remaining, {
      allowFragment: id === "user_input" || id === "platform_safety",
    });
    allocations.set(block, { ...trimmed, trimReason: trimmed.truncated ? "global_hard_limit" : "" });
    globalUsed += trimmed.tokens;
  }

  /** @type {Record<BudgetTier, number>} */
  const tierUsed = { permanent: 0, high: 0, mid: 0, truncatable: 0 };
  for (const [block, allocated] of allocations) {
    tierUsed[tierForBlock(block.id)] += allocated.tokens;
  }

  for (const block of list) {
    if (allocations.has(block) || !block.text) continue;
    const tier = tierForBlock(block.id);
    const tierRemaining = Math.max(0, tierBudgets[tier] - tierUsed[tier]);
    const globalRemaining = Math.max(0, totalBudget - globalUsed);
    const allowed = Math.min(globalRemaining, tierRemaining);
    const trimmed = truncateTextToTokenBudget(block.text, allowed);
    const trimReason = !trimmed.text
      ? `tier_${tier}_budget_exhausted`
      : trimmed.truncated
        ? `tier_${tier}_boundary_trimmed_to_${allowed}`
        : "";
    allocations.set(block, { ...trimmed, trimReason });
    globalUsed += trimmed.tokens;
    tierUsed[tier] += trimmed.tokens;
  }

  // Second pass: tiers express priority, not hard partitions.  Let truncated
  // non-protected blocks borrow any capacity left by other tiers while the
  // global ceiling remains authoritative.
  for (const block of list) {
    if (globalUsed >= totalBudget) break;
    if (!block.text || PROTECTED_PRIORITY.includes(block.id)) continue;
    const current = allocations.get(block);
    const originalTokens = estimatePromptTokens(block.text);
    if (!current || current.tokens >= originalTokens) continue;
    const expanded = truncateTextToTokenBudget(
      block.text,
      current.tokens + Math.max(0, totalBudget - globalUsed),
    );
    if (expanded.tokens <= current.tokens) continue;
    globalUsed += expanded.tokens - current.tokens;
    allocations.set(block, {
      ...expanded,
      trimReason: expanded.truncated ? "borrowed_global_capacity_then_trimmed" : "borrowed_global_capacity",
    });
  }

  const result = list.map((block) => {
    const allocated = allocations.get(block) || { text: "", tokens: 0, truncated: Boolean(block.text), trimReason: "" };
    return {
      id: block.id,
      text: allocated.text,
      source: block.source,
      tokens: allocated.tokens,
      tier: tierForBlock(block.id),
      trimReason: allocated.trimReason || "",
    };
  });
  const totalUsed = result.reduce((sum, block) => sum + block.tokens, 0);
  return {
    blocks: result,
    tierBudgets,
    totalUsed,
    totalBudget,
    overflow: totalUsed > totalBudget,
  };
}

export function estimateBlockTokens(text) {
  return estimatePromptTokens(text);
}
