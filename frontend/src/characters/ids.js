import { BUILTIN_CHARACTER_ID } from "../constants.js";

export { BUILTIN_CHARACTER_ID };

/** @param {string} characterId */
export function dmSessionId(characterId) {
  const id = String(characterId || "").trim() || BUILTIN_CHARACTER_ID;
  return `char:${id}`;
}

/** @param {string} sessionId */
export function characterIdFromDmSession(sessionId) {
  const raw = String(sessionId || "").trim();
  if (raw.startsWith("char:")) return raw.slice(5);
  return "";
}

export function createCharacterId() {
  return `char-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

export function createGroupSessionId() {
  return `group:${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}
