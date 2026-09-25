import { APP_META } from "../constants.js";

/**
 * @param {string} appKey
 * @param {{ name?: string, alias?: string, profileSummary?: string }} character
 */
export function buildGenerateMessages(appKey, character = {}) {
  const key = String(appKey || "");
  const label = APP_META[key]?.label || key;
  const name = character.name || "角色";
  const alias = character.alias || name;
  const profile = character.profileSummary || "";

  const schemaHint = {
    c5: `JSON: { schemaVersion:1, appKey:"c5", threads:[{id,title,avatarHint,lastMessagePreview,lastMessageAt,unreadCount,pinned}], messagesByThread:{ [threadId]:[{id,role:"self"|"other"|"system",senderName,content,sentAt,type:"text",meta:null}] } }`,
    c4: `JSON: { schemaVersion:1, appKey:"c4", albums:[{id,title,coverHint,count,updatedAt}], itemsByAlbum:{ [albumId]:[{id,caption,takenAt,placeholder:{tone,label},locationHint}] } }`,
    c8: `JSON: { schemaVersion:1, appKey:"c8", notes:[{id,title,body,updatedAt,pinned}] }`,
    c2: `JSON: { schemaVersion:1, appKey:"c2", threads:[{id,contactName,contactHint,lastPreview,lastAt,unread}], messagesByThread:{ [threadId]:[{id,direction:"in"|"out",body,sentAt}] } }`,
  }[key] || "JSON object";

  return [
    {
      role: "system",
      content: `你为角色「${name}」（别名 ${alias}）生成侧写子应用「${label}」的伪造痕迹 JSON。仅输出 JSON，不要 markdown 解释。内容要像真实手机痕迹，口语自然，禁止HTML。`,
    },
    {
      role: "user",
      content: [
        `角色简介：${profile || "（无）"}`,
        `目标 appKey：${key}`,
        `结构：${schemaHint}`,
        "生成 2–4 条列表项与对应详情即可。",
      ].join("\n"),
    },
  ];
}

/**
 * @param {string} text
 */
export function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
