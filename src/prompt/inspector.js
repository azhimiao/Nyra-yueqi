/**
 * Prompt Inspector — per-block token estimate, source, and trim reason (§6.2).
 */

import { estimateTextTokens } from "../lib/utils.js";
import { tierForBlock } from "./budget.js";

/**
 * @typedef {{
 *   id: string,
 *   tokens: number,
 *   source: string,
 *   trimReason: string,
 *   tier: string,
 *   included: boolean,
 *   preview?: string,
 * }} InspectorBlockReport
 */

/**
 * Build an inspector report from assembled blocks.
 * @param {Array<{
 *   id?: string,
 *   text?: string,
 *   source?: string,
 *   tokens?: number,
 *   trimReason?: string,
 *   tier?: string,
 * }>} blocks
 * @param {{ order?: string[] }} [opts]
 * @returns {{
 *   blocks: InspectorBlockReport[],
 *   totalTokens: number,
 *   trimmedCount: number,
 *   order: string[],
 * }}
 */
export function inspectPromptBlocks(blocks, opts = {}) {
  const list = Array.isArray(blocks) ? blocks : [];
  const reports = list.map((block) => {
    const id = String(block?.id || "unknown");
    const text = String(block?.text || "");
    const tokens = Number.isFinite(Number(block?.tokens))
      ? Number(block.tokens)
      : estimateTextTokens(text);
    const trimReason = String(block?.trimReason || "");
    return {
      id,
      tokens,
      source: String(block?.source || "assembler"),
      trimReason,
      tier: String(block?.tier || tierForBlock(id)),
      included: Boolean(text) && !/^tier_.*_budget_exhausted$/.test(trimReason),
      preview: text.slice(0, 120),
    };
  });

  const order = Array.isArray(opts.order) && opts.order.length
    ? opts.order.map(String)
    : reports.map((r) => r.id);

  return {
    blocks: reports,
    totalTokens: reports.reduce((sum, r) => sum + r.tokens, 0),
    trimmedCount: reports.filter((r) => Boolean(r.trimReason)).length,
    order,
  };
}

/**
 * Human-readable spy dump for verify / Prompt Spy UI.
 * @param {ReturnType<typeof inspectPromptBlocks>} report
 * @returns {string}
 */
export function formatInspectorReport(report) {
  if (!report?.blocks?.length) return "(empty inspector)";
  const lines = report.blocks.map((b) => {
    const trim = b.trimReason ? ` trim=${b.trimReason}` : "";
    const flag = b.included ? "IN" : "OUT";
    return `[${flag}] ${b.id} tier=${b.tier} tokens=${b.tokens} source=${b.source}${trim}`;
  });
  lines.push(`total=${report.totalTokens} trimmed=${report.trimmedCount}`);
  return lines.join("\n");
}
