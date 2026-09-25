import { estimateTextTokens } from "../lib/utils.js";

export const BUDGET_PRESETS = {
  light: 900,
  standard: 1800,
  full: 3200,
};

export function budgetFromSetting(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return BUDGET_PRESETS.standard;
}

export function trimMemoriesToBudget(memories = [], budgetTokens = BUDGET_PRESETS.standard) {
  const picked = [];
  let tokens = 0;
  for (const memory of memories) {
    const cost = estimateTextTokens(memory.rawText) + 24;
    if (picked.length && tokens + cost > budgetTokens) break;
    picked.push(memory);
    tokens += cost;
  }
  return picked;
}
