import { BUILTIN_CHARACTER_ID } from "../constants.js";
import { getAllRecords, openMemoryDb, storeRecord } from "../storage/db.js";
import { dmSessionId } from "./ids.js";
import { getActiveCharacterId, getCharacter, getCharacterSync } from "./store.js";

export const CHAT_FOCUS_CHANGED_EVENT = "yueqi:chat-focus-changed";

/** @type {{ kind: "dm"|"group", characterId?: string, sessionId: string, memberIds?: string[], title?: string }} */
let focus = {
  kind: "dm",
  characterId: BUILTIN_CHARACTER_ID,
  sessionId: dmSessionId(BUILTIN_CHARACTER_ID),
};

/** Last group speaker chosen for the in-flight turn (for message metadata). */
let lastGroupSpeakerId = "";

function dispatchFocusChanged() {
  try {
    document.dispatchEvent(
      new CustomEvent(CHAT_FOCUS_CHANGED_EVENT, {
        detail: { ...focus },
      })
    );
  } catch {
    /* non-DOM */
  }
}

export function getChatFocus() {
  return { ...focus };
}

export function getCurrentSessionId() {
  return focus.sessionId;
}

export function setLastGroupSpeakerId(characterId) {
  lastGroupSpeakerId = String(characterId || "").trim();
  return lastGroupSpeakerId;
}

export function getLastGroupSpeakerId() {
  return lastGroupSpeakerId;
}

export function resolveGroupSpeakerMeta({ conversationKind, speakerId } = {}) {
  if (conversationKind !== "group") return null;
  const id = String(speakerId || "").trim();
  if (!id) return null;
  const character = getCharacterSync(id);
  return {
    speakerId: id,
    speakerName: character?.name || character?.alias || id,
  };
}

export function getLastGroupSpeakerMeta() {
  return resolveGroupSpeakerMeta({
    conversationKind: focus.kind,
    speakerId: lastGroupSpeakerId,
  });
}

/**
 * Ensure a DM conversation row exists for the character.
 * @param {string} characterId
 */
export async function ensureDmConversation(characterId) {
  await openMemoryDb();
  const id = String(characterId || "").trim() || BUILTIN_CHARACTER_ID;
  const sessionId = dmSessionId(id);
  const character = getCharacterSync(id) || (await getCharacter(id));
  const title = character?.name || "角色";
  const conversations = await getAllRecords("conversations");
  const existing = conversations.find((item) => item.id === sessionId);
  const now = new Date().toISOString();
  if (!existing) {
    await storeRecord("conversations", {
      id: sessionId,
      kind: "dm",
      characterId: id,
      title,
      createdAt: now,
      updatedAt: now,
    });
  } else if (existing.kind !== "dm" || existing.characterId !== id) {
    await storeRecord("conversations", {
      ...existing,
      kind: "dm",
      characterId: id,
      title: existing.title || title,
      updatedAt: now,
    });
  }
  return sessionId;
}

/**
 * Switch the active DM thread (does not change companion / pet).
 * @param {string} characterId
 */
export async function setChatFocusCharacter(characterId) {
  const id = String(characterId || "").trim();
  const character = getCharacterSync(id) || (await getCharacter(id));
  if (!character) {
    throw new Error("unknown_character");
  }
  const sessionId = await ensureDmConversation(id);
  lastGroupSpeakerId = "";
  focus = {
    kind: "dm",
    characterId: id,
    sessionId,
  };
  dispatchFocusChanged();
  return getChatFocus();
}

/**
 * @param {{ id: string, title?: string, memberIds?: string[] }} group
 */
export async function setChatFocusGroup(group) {
  const sessionId = String(group?.id || "").trim();
  if (!sessionId.startsWith("group:")) {
    throw new Error("unknown_group");
  }
  const memberIds = Array.isArray(group.memberIds)
    ? group.memberIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (memberIds.length < 2) {
    throw new Error("group_needs_two_members");
  }
  lastGroupSpeakerId = "";
  focus = {
    kind: "group",
    sessionId,
    memberIds,
    title: String(group.title || "群聊").trim() || "群聊",
  };
  dispatchFocusChanged();
  return getChatFocus();
}

/** After migrate: focus the active companion. */
export async function initChatFocusFromActive() {
  const activeId = getActiveCharacterId() || BUILTIN_CHARACTER_ID;
  try {
    return await setChatFocusCharacter(activeId);
  } catch {
    return setChatFocusCharacter(BUILTIN_CHARACTER_ID);
  }
}
