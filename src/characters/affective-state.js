import { sanitizeInnerState } from "../chat/inner-state.js";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FIELD_LIMITS = { feeling: 100, focus: 140, stance: 140 };

// A change detector, not a security hash; never duplicate the source text here.
function sourceFingerprint(text) {
  let hash = 2166136261;
  for (const char of String(text || "").trim()) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return (hash >>> 0).toString(16);
}

/** A character's subjective response, never a user-fact or hidden-reasoning record. */
export function normalizeCharacterAffect(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = {};
  for (const [key, limit] of Object.entries(FIELD_LIMITS)) {
    const text = typeof raw[key] === "string" ? raw[key].trim() : "";
    // Reject overlong/protocol fields instead of silently retaining half a claim.
    if (text.length > limit || /<|>|```/.test(text)) continue;
    const safe = sanitizeInnerState(text);
    if (safe) value[key] = safe;
  }
  return Object.keys(value).length ? value : null;
}

/** Attach to the successful V2 assistant candidate; no parallel mutable state. */
export function createCharacterAffectMetadata(raw, { characterId, sourceUserMessageId, sourceUserText, createdAt = new Date().toISOString() } = {}) {
  const value = normalizeCharacterAffect(raw);
  if (!value || !String(characterId || "").trim() || !String(sourceUserMessageId || "").trim()) return null;
  if (!Number.isFinite(Date.parse(createdAt))) return null;
  return { version: 1, characterId: String(characterId), sourceUserMessageId: String(sourceUserMessageId), ...(typeof sourceUserText === "string" ? { sourceFingerprint: sourceFingerprint(sourceUserText) } : {}), createdAt, ...value };
}

/** Project only from the active, source-filtered Conversation V2 branch. */
export function buildCharacterAffectContext(messages = [], { characterId, locale = "zh-CN", now = Date.now() } = {}) {
  const empty = { text: "", source: "character.affect", sourceMessageIds: [] };
  if (!characterId) return empty;
  const rows = Array.isArray(messages) ? messages : [];
  const users = new Map(rows.filter(row => row.role === "user").flatMap(row => [row.id, row.messageId, row.meta?.clientMessageId, row.meta?.legacyMessageId].filter(Boolean).map(id => [String(id), row])));
  for (const row of [...rows].reverse()) {
    if (row.role !== "assistant") continue;
    const state = row.meta?.characterAffect || row.metadata?.characterAffect;
    if (state?.version !== 1 || state.characterId !== characterId) continue;
    // The latest committed state is authoritative. Do not resurrect an older
    // mood when its newer replacement expired or its evidence was forgotten.
    const source = users.get(String(state.sourceUserMessageId));
    if (!source || (state.sourceFingerprint && state.sourceFingerprint !== sourceFingerprint(source.content ?? source.text))) return empty;
    const age = Number(now) - Date.parse(state.createdAt);
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return empty;
    const value = normalizeCharacterAffect(state);
    if (!value) return empty;
    const en = String(locale).startsWith("en");
    const labels = en ? { feeling: "Feeling", focus: "On my mind", stance: "Relational stance" } : { feeling: "感受", focus: "在意", stance: "相处态度" };
    const text = [
      en ? "[Character's previous subjective state]" : "【角色上一轮的主观心绪】",
      en ? "These are your own feelings, not established facts about the user. Let them evolve with the current message; a correction can change your interpretation. Do not recite this state or turn it into a user memory." : "这是你自己的感受，不是用户事实。结合当前消息自然延续或改变；用户的澄清可以推翻原先理解。不要照念，也不要把心绪升级成用户记忆。",
      ...Object.entries(value).map(([key, text]) => `${labels[key]}：${text}`),
    ].join("\n");
    return { text, source: "character.affect", sourceMessageIds: [String(row.messageId || row.id || ""), String(state.sourceUserMessageId)].filter(Boolean) };
  }
  return empty;
}
