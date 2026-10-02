/**
 * LoreActivationTrace — which entries fired, why, where, budget (§6.3).
 */

/**
 * @typedef {{
 *   entryId: string,
 *   title: string,
 *   activated: boolean,
 *   reason: string,
 *   insertPosition: string,
 *   tokens: number,
 *   priority: number,
 *   scope: string,
 *   sourcePackageId: string,
 * }} LoreActivationRecord
 */

/**
 * @returns {{
 *   schemaVersion: 1,
 *   query: string,
 *   turnIndex: number,
 *   tokenBudget: number,
 *   usedTokens: number,
 *   records: LoreActivationRecord[],
 *   activatedIds: string[],
 *   trimmedIds: string[],
 * }}
 */
export function createEmptyLoreActivationTrace(seed = {}) {
  return {
    schemaVersion: 1,
    query: String(seed.query || ""),
    turnIndex: Number(seed.turnIndex) || 0,
    tokenBudget: Number(seed.tokenBudget) || 0,
    usedTokens: 0,
    records: [],
    activatedIds: [],
    trimmedIds: [],
  };
}

/**
 * @param {ReturnType<typeof createEmptyLoreActivationTrace>} trace
 * @param {{
 *   entry: object,
 *   activated: boolean,
 *   reason: string,
 *   insertPosition?: string,
 *   tokens?: number,
 * }} detail
 */
export function recordLoreActivation(trace, detail) {
  if (!trace || typeof trace !== "object") return;
  const entry = detail.entry || {};
  const id = String(entry.id || "");
  /** @type {LoreActivationRecord} */
  const row = {
    entryId: id,
    title: String(entry.title || ""),
    activated: Boolean(detail.activated),
    reason: String(detail.reason || ""),
    insertPosition: String(detail.insertPosition || entry.insertPosition || "after_scenario"),
    tokens: Number(detail.tokens) || 0,
    priority: Number(entry.priority) || 0,
    scope: String(entry.scope || "global"),
    sourcePackageId: String(entry.sourcePackageId || ""),
  };
  trace.records.push(row);
  if (row.activated && id) {
    if (!trace.activatedIds.includes(id)) trace.activatedIds.push(id);
  }
  if (!row.activated && row.reason === "budget_trimmed" && id) {
    if (!trace.trimmedIds.includes(id)) trace.trimmedIds.push(id);
  }
}

/**
 * @param {ReturnType<typeof createEmptyLoreActivationTrace>} trace
 * @param {{ usedTokens?: number }} [extra]
 */
export function finalizeLoreActivationTrace(trace, extra = {}) {
  if (!trace) return trace;
  if (Number.isFinite(Number(extra.usedTokens))) {
    trace.usedTokens = Number(extra.usedTokens);
  } else {
    trace.usedTokens = (trace.records || [])
      .filter((r) => r.activated)
      .reduce((sum, r) => sum + (r.tokens || 0), 0);
  }
  return trace;
}

/**
 * Compact string for Prompt Spy / creator preview.
 * @param {ReturnType<typeof createEmptyLoreActivationTrace>} trace
 * @returns {string}
 */
export function formatLoreActivationTrace(trace) {
  if (!trace?.records?.length) return "lore_trace: (empty)";
  const lines = trace.records.map((r) => {
    const flag = r.activated ? "ON" : "OFF";
    return `[${flag}] ${r.entryId || r.title} reason=${r.reason} pos=${r.insertPosition} tokens=${r.tokens}`;
  });
  lines.push(
    `budget=${trace.usedTokens}/${trace.tokenBudget} activated=${trace.activatedIds.length} trimmed=${trace.trimmedIds.length}`,
  );
  return lines.join("\n");
}
