import { getAllRecords, openMemoryDb, storeRecord } from "../storage/db.js";
import { createGroupSessionId } from "./ids.js";
import { getCharacterSync, listCharacters } from "./store.js";
import { setChatFocusGroup } from "./session-context.js";

/**
 * Resolve who should speak in a group turn.
 * @mention (name / alias) wins; else rotate away from last assistant speaker.
 * @param {string} text
 * @param {string[]} memberIds
 * @param {Array<{ role?: string, metadata?: { speakerId?: string } }>} [history]
 */
export function pickGroupSpeaker(text, memberIds = [], history = []) {
  const members = [...new Set((memberIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (!members.length) return "";

  const raw = String(text || "");
  const mention = raw.match(/@([^\s@，。！？,.!?；;：:]{1,24})/);
  if (mention) {
    const token = mention[1].trim().toLowerCase();
    for (const id of members) {
      const character = getCharacterSync(id);
      const names = [character?.name, character?.alias]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean);
      if (names.some((name) => name === token || name.includes(token) || token.includes(name))) {
        return id;
      }
    }
  }

  const lastAssistant = [...history].reverse().find((item) => item.role === "assistant" || item.role === "ai");
  const lastId = String(lastAssistant?.metadata?.speakerId || "").trim();
  if (lastId && members.includes(lastId) && members.length > 1) {
    const index = members.indexOf(lastId);
    return members[(index + 1) % members.length];
  }
  return members[0];
}

export function buildGroupRosterBlock(memberIds = [], speakerId = "") {
  const lines = (memberIds || []).map((id) => {
    const character = getCharacterSync(id);
    const mark = id === speakerId ? "（本轮发言）" : "";
    return `- ${character?.name || id}${character?.alias ? ` / ${character.alias}` : ""}${mark}`;
  });
  return [
    "这是群聊。本轮只由一位成员发言，不要替其他人说话。",
    "群成员：",
    ...lines,
    "若用户用 @名字 点到某人，优先由该成员回应。",
  ].join("\n");
}

/**
 * @param {{ title?: string, memberIds: string[] }} options
 */
export async function createGroupConversation({ title = "", memberIds = [] } = {}) {
  await openMemoryDb();
  const unique = [...new Set((memberIds || []).map((id) => String(id).trim()).filter(Boolean))];
  if (unique.length < 2) {
    throw new Error("group_needs_two_members");
  }
  const characters = await listCharacters();
  const known = new Set(characters.map((item) => item.id));
  const members = unique.filter((id) => known.has(id));
  if (members.length < 2) {
    throw new Error("group_needs_two_members");
  }

  const names = members.map((id) => getCharacterSync(id)?.name || id);
  const sessionId = createGroupSessionId();
  const now = new Date().toISOString();
  const record = {
    id: sessionId,
    kind: "group",
    title: String(title || "").trim() || names.slice(0, 3).join("、"),
    memberIds: members,
    createdAt: now,
    updatedAt: now,
  };
  await storeRecord("conversations", record);
  return record;
}

export async function getGroupConversation(sessionId) {
  await openMemoryDb();
  const id = String(sessionId || "").trim();
  const conversations = await getAllRecords("conversations");
  const found = conversations.find((item) => item.id === id && item.kind === "group");
  return found || null;
}

export async function ensureGroupConversation(sessionId) {
  const group = await getGroupConversation(sessionId);
  if (!group) throw new Error("unknown_group");
  return group;
}

export async function openGroup(sessionId) {
  const group = await ensureGroupConversation(sessionId);
  return setChatFocusGroup(group);
}
