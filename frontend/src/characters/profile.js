import { BUILTIN_CHARACTER_ID, defaultProfile } from "../constants.js";
import { getCharacter, getCharacterSync, upsertCharacter } from "./store.js";

/**
 * Map a CharacterRecord (or its profile blob) to the shape used by assemblePrompt / UI chrome.
 * @param {object|null} character
 */
export function characterToCollectedProfile(character) {
  const profile = character?.profile && typeof character.profile === "object"
    ? character.profile
    : defaultProfile;
  const fields = Array.isArray(profile.fields) ? profile.fields : defaultProfile.fields;
  const ranges = Array.isArray(profile.ranges) ? profile.ranges : defaultProfile.ranges;
  const tokens = Array.isArray(profile.tokens) ? profile.tokens : defaultProfile.tokens;
  return {
    id: String(character?.id || "").trim(),
    name: String(character?.name || fields[0] || defaultProfile.fields[0] || "").trim() || defaultProfile.fields[0],
    alias: String(character?.alias || fields[1] || defaultProfile.fields[1] || "").trim() || defaultProfile.fields[1],
    identity: fields[2] ?? defaultProfile.fields[2] ?? "",
    model: fields[3] ?? defaultProfile.fields[3] ?? "",
    base: fields[4] ?? defaultProfile.fields[4] ?? "",
    ranges: ranges.map(String),
    tokens: tokens.map(String).filter(Boolean),
    promptSystem: String(profile.promptSystem || "").trim(),
    promptDeveloper: String(profile.promptDeveloper || "").trim(),
  };
}

/**
 * @param {string} [characterId]
 */
export function collectedProfileFromStore(characterId) {
  const id = String(characterId || "").trim();
  const character = id ? getCharacterSync(id) : null;
  if (!character) return null;
  return characterToCollectedProfile(character);
}

/**
 * Persist identity-editor state onto a character card (+ returns profile blob for localStorage mirror).
 * @param {object} profileState collectProfileState() shape
 * @param {string} [characterId]
 */
export async function syncProfileStateToCharacter(profileState, characterId = BUILTIN_CHARACTER_ID) {
  const id = String(characterId || "").trim() || BUILTIN_CHARACTER_ID;
  const existing = getCharacterSync(id) || (await getCharacter(id));
  const fields = Array.isArray(profileState?.fields) ? [...profileState.fields] : [...defaultProfile.fields];
  return upsertCharacter({
    id,
    name: fields[0] || existing?.name || defaultProfile.fields[0],
    alias: fields[1] || existing?.alias || defaultProfile.fields[1],
    profile: {
      ...(existing?.profile || defaultProfile),
      ...profileState,
      fields,
    },
    source: existing?.source || (id === BUILTIN_CHARACTER_ID ? "builtin" : "user"),
  });
}
