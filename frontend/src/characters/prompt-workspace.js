/**
 * Advanced Prompt workspace — storage limits vs per-turn injection budgets.
 */

import { COMPANION_V2_LIMITS as L } from "../contracts/companion-v2-shared.js";

export const WORKSPACE_FIELDS = Object.freeze([
  { id: "characterSystemSupplement", path: "profile.promptSystem", limit: L.characterSystemSupplement, untrusted: true },
  { id: "characterDeveloperSupplement", path: "profile.promptDeveloper", limit: L.characterDeveloperSupplement, untrusted: true },
  { id: "postHistoryInstructions", path: "profile.postHistoryInstructions", limit: L.postHistoryInstructions, untrusted: true },
  { id: "scenario", path: "profile.scenario", limit: L.scenario, untrusted: false },
  { id: "primaryGreeting", path: "greetings.primary", limit: L.greetingItem, untrusted: false },
  { id: "alternateGreetings", path: "greetings.alternate", limit: L.greetingItem, maxItems: L.alternateGreetingsMax, untrusted: false },
  { id: "exampleDialogue", path: "exampleDialogue", limit: L.exampleDialogueChars, maxItems: L.exampleDialogueMax, untrusted: false },
]);

export function workspaceWarningLevel(used, limit) {
  if (!limit) return "ok";
  const ratio = used / limit;
  if (ratio >= 1) return "block";
  if (ratio >= 0.9) return "strong";
  if (ratio >= 0.7) return "light";
  return "ok";
}

export function measureWorkspaceField(field, value) {
  const text = Array.isArray(value) ? value.join("\n") : String(value || "");
  const used = text.length;
  const items = Array.isArray(value) ? value.length : (text ? 1 : 0);
  const overItems = field.maxItems && items > field.maxItems;
  return {
    id: field.id,
    used,
    limit: field.limit,
    items,
    maxItems: field.maxItems || 1,
    level: overItems ? "block" : workspaceWarningLevel(used, field.limit),
    untrusted: Boolean(field.untrusted),
    truncatedForTurn: used > Math.min(field.limit, 4000),
  };
}

export function summarizeWorkspace(record = {}) {
  const greetings = record.greetings || {};
  const profile = record.profile || {};
  const values = {
    characterSystemSupplement: profile.promptSystem || record.profileV2?.prompts?.characterSystemSupplement || "",
    characterDeveloperSupplement: profile.promptDeveloper || record.profileV2?.prompts?.characterDeveloperSupplement || "",
    postHistoryInstructions: profile.postHistoryInstructions || "",
    scenario: profile.scenario || record.scenario || "",
    primaryGreeting: greetings.primary || profile.firstMessage || "",
    alternateGreetings: greetings.alternate || [],
    exampleDialogue: record.exampleDialogue || [],
  };
  return WORKSPACE_FIELDS.map((field) => measureWorkspaceField(field, values[field.id]));
}

export function applyWorkspacePatch(record, patch = {}) {
  const next = { ...(record || {}) };
  const profile = { ...(next.profile || {}) };
  const greetings = { ...(next.greetings || { primary: "", alternate: [] }) };
  if (Object.hasOwn(patch, "characterSystemSupplement")) profile.promptSystem = String(patch.characterSystemSupplement || "");
  if (Object.hasOwn(patch, "characterDeveloperSupplement")) profile.promptDeveloper = String(patch.characterDeveloperSupplement || "");
  if (Object.hasOwn(patch, "postHistoryInstructions")) profile.postHistoryInstructions = String(patch.postHistoryInstructions || "");
  if (Object.hasOwn(patch, "scenario")) {
    profile.scenario = String(patch.scenario || "");
    next.scenario = profile.scenario;
  }
  if (Object.hasOwn(patch, "primaryGreeting")) {
    greetings.primary = String(patch.primaryGreeting || "");
    profile.firstMessage = greetings.primary;
  }
  if (Object.hasOwn(patch, "alternateGreetings")) {
    greetings.alternate = Array.isArray(patch.alternateGreetings) ? patch.alternateGreetings.map(String) : [];
  }
  if (Object.hasOwn(patch, "exampleDialogue")) {
    next.exampleDialogue = Array.isArray(patch.exampleDialogue) ? patch.exampleDialogue.map(String) : [];
  }
  next.profile = profile;
  next.greetings = greetings;
  return next;
}

export function importedPromptLabel(source) {
  return source === "import" || source === "tavern" ? "demoted_untrusted" : "user";
}
