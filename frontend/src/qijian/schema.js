/**
 * 栖笺 schema + offline draft template (F5).
 */

export const QIJIAN_STORE_KEY = "yueqi.qijian.v1";

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, data?: object, error?: string }}
 */
export function parseQijianLlmJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return { ok: false, error: "empty" };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: "not_json" };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return { ok: false, error: "not_json" };
    }
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, error: "bad_shape" };
  const summary = String(parsed.summary || "").trim();
  if (!summary) return { ok: false, error: "missing_summary" };
  return {
    ok: true,
    data: {
      name: parsed.name != null ? String(parsed.name).trim() : undefined,
      alias: parsed.alias != null ? String(parsed.alias).trim() : undefined,
      identity: parsed.identity != null ? String(parsed.identity).trim() : undefined,
      summary,
      tokens: Array.isArray(parsed.tokens)
        ? parsed.tokens.map((t) => String(t).trim()).filter(Boolean).slice(0, 12)
        : [],
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.map((s) => String(s).trim()).filter(Boolean).slice(0, 6)
        : [],
      offline: false,
    },
  };
}

/**
 * Offline template when no API key / parse fail.
 * @param {{ relation?: string, keywords?: string[], tone?: string, characterName?: string }} seed
 */
export function offlineQijianDraft(seed = {}) {
  const relation = String(seed.relation || "朋友").trim() || "朋友";
  const keywords = Array.isArray(seed.keywords)
    ? seed.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 8)
    : [];
  const tone = String(seed.tone || "温柔").trim() || "温柔";
  const name = String(seed.characterName || "").trim();
  const kw = keywords.length ? keywords.join("、") : "雨声、旧书、未说完的话";
  const summary = [
    `【离线草稿】与你是「${relation}」关系。`,
    `气质关键词：${kw}。`,
    `说话偏${tone}，短句里留一点余温，不夸张，不催促。`,
    "日常里会注意到小细节，偶尔轻提共同经历，但尊重边界。",
  ].join("");

  return {
    name: name || undefined,
    alias: relation === "恋人" ? "亲爱的" : relation === "家人" ? "家人" : undefined,
    identity: relation === "恋人" ? "亲密陪伴" : "日常陪伴",
    summary,
    tokens: [...new Set([tone, ...keywords])].slice(0, 8),
    suggestions: [`可以补一条世界书：关于「${keywords[0] || "雨"}」的共同场景。`],
    offline: true,
  };
}

/**
 * @param {object} draft
 * @param {string[]} currentFields
 * @param {string[]} currentTokens
 */
export function draftToProfilePatch(draft, currentFields = [], currentTokens = []) {
  const fields = Array.isArray(currentFields) ? [...currentFields] : ["", "", "", "", ""];
  while (fields.length < 5) fields.push("");
  if (draft.name) fields[0] = String(draft.name);
  if (draft.alias) fields[1] = String(draft.alias);
  if (draft.identity) fields[2] = String(draft.identity);
  if (draft.summary) fields[4] = String(draft.summary);
  const tokens = Array.isArray(draft.tokens) && draft.tokens.length
    ? draft.tokens.map(String)
    : [...(currentTokens || [])];
  return { fields, tokens };
}
