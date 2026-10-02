/**
 * Open-source tree: the private companion contract has been removed.
 * These exports stay so the shell can still assemble a plain character prompt.
 */

export const COMPANION_PROMPT_VERSION = "open";

export const PROMPT_AUTHORITY_ORDER = Object.freeze([
  "character_identity",
  "recent_history",
]);

export function buildPlatformCompanionContract() {
  return "You are a companion in a local app. Answer from the character card and the visible chat. Do not invent shared memories.";
}

export function buildDeveloperEvidencePolicy() {
  return "";
}

export function buildOpeningSceneState() {
  return "";
}

export function buildCharacterRelationshipContract() {
  return "";
}

export function buildChatOutputContract() {
  return "Reply in the user's language.";
}
