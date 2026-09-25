import { getActiveCharacterId, getCharacterSync, listCharacters } from "../characters/store.js";

export function scenarioLeadId(packageId = "") {
  const id = String(packageId || "work").trim() || "work";
  return `char-scenario:${id}`;
}

/**
 * Work-owned stage identity. Not the global companion (no 开场白 / 宝贝 / 月栖自我介绍).
 * @param {object} [pkg]
 * @param {object} [opening]
 */
export function resolveScenarioLead(pkg = {}, opening = {}) {
  const packageId = String(pkg.id || pkg.legacyScriptId || opening.packageId || "work").trim() || "work";
  const name = String(opening.leadName || pkg.cast?.leadName || "").trim() || "对方";
  const persona = [
    String(pkg.scenarioOverride || "").trim(),
    String(pkg.cast?.persona || "").trim(),
    String(opening.relationshipPremise || "").trim(),
    "你是这场情景剧里的角色，不是用户日常聊天里的陪伴。",
    "不要沿用陪伴会话的开场白、称呼或共同生活设定。按本场开场关系重新开始。",
  ].filter(Boolean).join("\n");
  return {
    id: scenarioLeadId(packageId),
    name,
    persona,
    relationshipLine: String(opening.title || opening.relationshipPremise || "").trim(),
    userAddress: "",
    firstMes: "",
  };
}

function isIsolatedLeadId(id = "") {
  return String(id).startsWith("char-scenario:") || String(id).startsWith("__scenario__");
}

/**
 * @param {{ leadId?: string, memberIds?: string[], isolated?: boolean, lead?: object, leadName?: string, persona?: string }} cast
 * @param {string[]} [fallbackMemberIds]
 */
export function normalizeCast(cast = {}, fallbackMemberIds = []) {
  const isolated = cast.isolated === true || isIsolatedLeadId(cast.leadId);
  const active = isolated ? "" : getActiveCharacterId();
  let memberIds = Array.isArray(cast.memberIds)
    ? cast.memberIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (!memberIds.length) {
    memberIds = fallbackMemberIds.length
      ? [...fallbackMemberIds]
      : [active].filter(Boolean);
  }
  memberIds = [...new Set(memberIds)];
  if (!memberIds.length && active) memberIds = [active];

  let leadId = String(cast.leadId || "").trim();
  if (!leadId || !memberIds.includes(leadId)) {
    leadId = memberIds.includes(active) ? active : memberIds[0] || "";
  }
  if (leadId && !memberIds.includes(leadId)) memberIds.unshift(leadId);

  return {
    leadId,
    memberIds: [...new Set(memberIds)],
    isolated: Boolean(isolated || isIsolatedLeadId(leadId)),
    leadName: String(cast.leadName || cast.lead?.name || "").trim(),
    persona: String(cast.persona || cast.lead?.persona || "").trim(),
    lead: cast.lead && typeof cast.lead === "object" ? { ...cast.lead } : undefined,
  };
}

export async function defaultCastFromCharacters() {
  const characters = await listCharacters();
  const active = getActiveCharacterId();
  const ids = characters.map((item) => item.id);
  if (!ids.length) return normalizeCast({ leadId: active, memberIds: active ? [active] : [] });
  const leadId = ids.includes(active) ? active : ids[0];
  return normalizeCast({ leadId, memberIds: [leadId] });
}

/** Short cast block for director system prompt. */
export function buildCastPromptBlock(cast) {
  const normalized = normalizeCast(cast);
  const lines = (normalized.memberIds.length ? normalized.memberIds : [normalized.leadId].filter(Boolean))
    .map((id) => {
      const character = isIsolatedLeadId(id) ? null : getCharacterSync(id);
      const role = id === normalized.leadId ? "主演" : "配角";
      const name = character?.name
        || (id === normalized.leadId ? (normalized.leadName || normalized.lead?.name) : "")
        || "对方";
      const alias = character?.alias ? `（${character.alias}）` : "";
      const base = String(character?.profile?.fields?.[4] || character?.profile?.base || "").trim()
        || (id === normalized.leadId ? (normalized.persona || normalized.lead?.persona || "") : "");
      const short = base ? base.slice(0, 160) : "按本场开场关系演出，不是日常陪伴";
      return `- [${role}] ${name}${alias}：${short}`;
    });
  return [
    "卡司（本场演员）：",
    ...lines,
    "这是情景剧卡司，与日常陪伴聊天的角色、称呼、开场白和共同生活记忆分开。按本场开场关系重新开始。",
    "对白默认以主演口吻；配角由旁白或括注带出，不要抢主演的第一人称。",
  ].join("\n");
}
