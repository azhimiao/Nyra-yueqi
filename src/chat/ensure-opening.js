/**
 * Seed a first spoken line when a character's chat is still empty.
 * Card greeting wins; otherwise the Yueqi identity opening.
 */

import { isPlatformPlaceholderGreeting, resolveCharacterOpeningLine } from "./opening-intro.js";

export function openingSeedMessageId(characterId = "") {
  return `fl-first-${String(characterId || "").trim()}`;
}

function hasSpokenContent(messages = []) {
  return (Array.isArray(messages) ? messages : []).some((message) => (
    String(message?.role || "") !== "system"
    && String(message?.content || "").trim()
    && !isPlatformPlaceholderGreeting(message)
  ));
}

/**
 * @param {{
 *   character?: object,
 *   sessionId?: string,
 *   messages?: object[],
 *   writeCompanionTurn?: Function,
 *   saveChatMessage?: Function,
 *   locale?: string,
 * }} [input]
 */
export async function ensureCharacterOpeningMessage(input = {}) {
  const character = input.character && typeof input.character === "object" ? input.character : {};
  const characterId = String(character.id || "").trim();
  if (!characterId) return { ok: false, wrote: false, reason: "missing_character" };
  if (hasSpokenContent(input.messages)) {
    return { ok: true, wrote: false, reason: "already_has_messages" };
  }
  const messageId = openingSeedMessageId(characterId);
  const existing = Array.isArray(input.messages) ? input.messages : [];
  if (existing.some((message) => String(message?.id || "") === messageId)) {
    return { ok: true, wrote: false, reason: "opening_exists" };
  }
  const text = resolveCharacterOpeningLine(character, {
    characterName: character.name,
    callUserAs: character.alias,
  }, input.locale || "zh-CN");
  if (!text) return { ok: false, wrote: false, reason: "empty_opening" };
  if (typeof input.writeCompanionTurn !== "function") {
    return { ok: false, wrote: false, reason: "missing_writer", text, messageId };
  }
  const sessionId = String(input.sessionId || "").trim() || `char:${characterId}`;
  const result = await input.writeCompanionTurn({
    role: "assistant",
    text,
    characterId,
    chatSessionId: sessionId,
    messageId,
    meta: {
      kind: "first_light_opening",
      source: "ensure_opening",
      notLivedExperience: true,
    },
    saveChatMessage: input.saveChatMessage,
  });
  return {
    ok: Boolean(result?.ok),
    wrote: Boolean(result?.ok),
    reason: result?.ok ? "wrote" : (result?.reason || "write_failed"),
    text,
    messageId,
  };
}
