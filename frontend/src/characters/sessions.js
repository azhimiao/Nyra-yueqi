import { getAllRecords, openMemoryDb, storeRecord } from "../storage/db.js";
import { dmSessionId } from "./ids.js";
import { getActiveCharacterId, getCharacterSync, listCharacters } from "./store.js";
import { ensurePopContactsMigrated, listContacts } from "./contacts.js";
import { setChatFocusCharacter } from "./session-context.js";
import { openGroup } from "./group-chat.js";
import { resolveCharacterAvatarUrl } from "./avatar.js";

function listCharactersWarm() {
  return listCharacters();
}

function previewText(content) {
  const text = String(content || "").replace(/\s+/g, " ").trim();
  if (!text) return "开始聊天";
  return text.length > 36 ? `${text.slice(0, 36)}…` : text;
}

function lastMessageForSession(messages, sessionId) {
  const sessionMessages = messages
    .filter((item) => item.sessionId === sessionId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return sessionMessages[sessionMessages.length - 1] || null;
}

/**
 * DM rows for Pop session list: address-book contacts only (not full character library).
 */
export async function listDmSessions() {
  await openMemoryDb();
  await ensurePopContactsMigrated();
  const contactIds = listContacts().map((row) => row.characterId);
  const [, conversations, messages] = await Promise.all([
    listCharactersWarm(),
    getAllRecords("conversations"),
    getAllRecords("messages"),
  ]);
  const activeId = getActiveCharacterId();
  const convById = new Map(conversations.map((item) => [item.id, item]));

  const rows = contactIds.map((characterId) => {
    const character = getCharacterSync(characterId);
    if (!character) return null;
    const sessionId = dmSessionId(character.id);
    const conv = convById.get(sessionId);
    const last = lastMessageForSession(messages, sessionId);
    return {
      kind: "dm",
      characterId: character.id,
      sessionId,
      title: character.name || character.alias || "角色",
      avatarUrl: resolveCharacterAvatarUrl(character),
      preview: last ? previewText(last.content) : "开始聊天",
      updatedAt: last?.createdAt || conv?.updatedAt || character.updatedAt || character.createdAt || "",
      isCompanion: character.id === activeId,
    };
  }).filter(Boolean);

  rows.sort((a, b) => {
    if (a.isCompanion !== b.isCompanion) return a.isCompanion ? -1 : 1;
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
  return rows;
}

/** Group conversation rows (only those that exist). */
export async function listGroupSessions() {
  await openMemoryDb();
  const [conversations, messages] = await Promise.all([
    getAllRecords("conversations"),
    getAllRecords("messages"),
  ]);
  const rows = conversations
    .filter((item) => item.kind === "group")
    .map((group) => {
      const last = lastMessageForSession(messages, group.id);
      const members = Array.isArray(group.memberIds) ? group.memberIds : [];
      const first = getCharacterSync(members[0]);
      return {
        kind: "group",
        sessionId: group.id,
        title: group.title || "群聊",
        avatarUrl: resolveCharacterAvatarUrl(first),
        preview: last ? previewText(last.content) : "群聊已创建",
        updatedAt: last?.createdAt || group.updatedAt || group.createdAt || "",
        memberIds: members,
        isCompanion: false,
      };
    });
  rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return rows;
}

/** Combined Pop list: groups then DMs (companion still pins among DMs). */
export async function listPopSessions() {
  const [groups, dms] = await Promise.all([listGroupSessions(), listDmSessions()]);
  return [...groups, ...dms];
}

/** Open (or create) a DM and set chat focus. */
export async function openDm(characterId) {
  return setChatFocusCharacter(characterId);
}

export { openGroup };

/** Touch conversation updatedAt after activity. */
export async function touchConversation(sessionId) {
  await openMemoryDb();
  const id = String(sessionId || "").trim();
  if (!id) return;
  const conversations = await getAllRecords("conversations");
  const existing = conversations.find((item) => item.id === id);
  if (!existing) return;
  await storeRecord("conversations", {
    ...existing,
    updatedAt: new Date().toISOString(),
  });
}
