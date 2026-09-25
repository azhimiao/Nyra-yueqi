import { characterToCollectedProfile } from "../characters/profile.js";
import { buildCharacterRelationshipContract } from "./companion-contract-v2.js";

/**
 * Resolve committed character Prompt text without consulting UI state.
 * @param {object|null} character
 */
export function resolvePromptTextsFromCharacter(character) {
  const profile = character?.profile && typeof character.profile === "object"
    ? character.profile
    : {};
  return {
    promptSystem: String(profile.promptSystem || "").trim(),
    promptDeveloper: String(profile.promptDeveloper || "").trim(),
  };
}

/**
 * Resolve the model-facing Character Identity from one committed record.
 * @param {object|null} character
 */
export function resolveCharacterIdentityFromRecord(character) {
  const identity = characterToCollectedProfile(character);
  return {
    ...identity,
    ...resolvePromptTextsFromCharacter(character),
  };
}

/**
 * Thin pure identity assembler used by runtime and authority regression tests.
 * Additional option fields are deliberately ignored.
 * @param {object|null} character
 * @param {object} [lang]
 */
export function assembleIdentityForCharacter(character, lang = {}) {
  return buildCharacterRelationshipContract(
    resolveCharacterIdentityFromRecord(character),
    lang,
  );
}
