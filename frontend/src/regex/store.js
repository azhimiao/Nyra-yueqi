/**
 * Regex rules localStorage (F5 / F4).
 */

import {
  BUILTIN_REGEX_RULES,
  REGEX_STORE_KEY,
  createBuiltinRegexBag,
  normalizeRegexRule,
  compileRegexRule,
} from "./schema.js";

export { REGEX_STORE_KEY };

function readRaw() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return JSON.parse(window.localStorage.getItem(REGEX_STORE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(REGEX_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

function mergeBuiltins(bag) {
  const inbound = Array.isArray(bag?.inbound) ? bag.inbound.map(normalizeRegexRule) : [];
  const outbound = Array.isArray(bag?.outbound) ? bag.outbound.map(normalizeRegexRule) : [];
  const byDir = { inbound, outbound };
  for (const builtin of BUILTIN_REGEX_RULES) {
    const list = byDir[builtin.direction];
    const idx = list.findIndex((r) => r.id === builtin.id);
    if (idx < 0) {
      list.push(normalizeRegexRule({ ...builtin }));
    } else {
      const prev = list[idx];
      list[idx] = normalizeRegexRule({
        ...builtin,
        enabled: prev.enabled !== false,
        order: Number.isFinite(Number(prev.order)) ? Number(prev.order) : builtin.order,
        builtin: true,
        id: builtin.id,
        direction: builtin.direction,
      });
    }
  }
  return { inbound: byDir.inbound, outbound: byDir.outbound };
}

export function loadRegexBag() {
  const merged = mergeBuiltins(readRaw() || createBuiltinRegexBag());
  writeBag(merged);
  return merged;
}

export function listRegexRules(direction) {
  const bag = loadRegexBag();
  if (direction === "inbound" || direction === "outbound") {
    return bag[direction].map((r) => ({ ...r }));
  }
  return [...bag.inbound, ...bag.outbound].map((r) => ({ ...r }));
}

export function getRulesForDirection(direction) {
  return listRegexRules(direction === "inbound" ? "inbound" : "outbound");
}

export function upsertRegexRule(partial = {}) {
  const bag = loadRegexBag();
  const rule = normalizeRegexRule(partial);
  const compiled = compileRegexRule(rule);
  rule.broken = !compiled.ok;
  const key = rule.direction === "inbound" ? "inbound" : "outbound";
  const idx = bag[key].findIndex((r) => r.id === rule.id);
  if (idx >= 0) {
    const prev = bag[key][idx];
    bag[key][idx] = normalizeRegexRule({
      ...prev,
      ...rule,
      builtin: prev.builtin,
      id: prev.id,
    });
  } else {
    bag[key].push(rule);
  }
  writeBag(bag);
  return bag[key].find((r) => r.id === rule.id);
}

export function deleteRegexRule(id) {
  const bag = loadRegexBag();
  for (const key of ["inbound", "outbound"]) {
    const target = bag[key].find((r) => r.id === id);
    if (target?.builtin) return false;
    bag[key] = bag[key].filter((r) => r.id !== id);
  }
  writeBag(bag);
  return true;
}

export function exportRegexBag() {
  return loadRegexBag();
}

export function importRegexBag(payload) {
  const merged = mergeBuiltins(payload && typeof payload === "object" ? payload : createBuiltinRegexBag());
  writeBag(merged);
  return merged;
}
