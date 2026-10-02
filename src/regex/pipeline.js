/**
 * Safe regex pipeline — never throws to chat layer (F5 / F4).
 */

import { compileRegexRule, normalizeRegexRule } from "./schema.js";

/**
 * @param {string} text
 * @param {object[]} rules
 * @returns {{ text: string, applied: string[], skipped: string[] }}
 */
export function applyRegexPipeline(text, rules) {
  let current = text == null ? "" : String(text);
  const applied = [];
  const skipped = [];
  const list = (Array.isArray(rules) ? rules : [])
    .map(normalizeRegexRule)
    .filter((r) => r.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  for (const rule of list) {
    const compiled = compileRegexRule(rule);
    if (!compiled.ok) {
      skipped.push(rule.id);
      continue;
    }
    try {
      current = current.replace(compiled.re, rule.replacement ?? "");
      applied.push(rule.id);
    } catch (error) {
      console.warn("[yueqi.regex] rule failed", rule.id, error);
      skipped.push(rule.id);
    }
  }

  return { text: current, applied, skipped };
}

/**
 * @param {string} text
 * @param {object[]} rules
 */
export function applyInboundRegex(text, rules) {
  try {
    const inbound = (rules || []).filter((r) => (r.direction || "inbound") === "inbound");
    return applyRegexPipeline(text, inbound);
  } catch (error) {
    console.warn("[yueqi.regex] inbound pipeline error", error);
    return { text: String(text ?? ""), applied: [], skipped: ["pipeline"] };
  }
}

/**
 * @param {string} text
 * @param {object[]} rules
 */
export function applyOutboundRegex(text, rules) {
  try {
    const outbound = (rules || []).filter((r) => (r.direction || "outbound") === "outbound");
    return applyRegexPipeline(text, outbound);
  } catch (error) {
    console.warn("[yueqi.regex] outbound pipeline error", error);
    return { text: String(text ?? ""), applied: [], skipped: ["pipeline"] };
  }
}
