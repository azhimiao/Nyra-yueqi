/**
 * 栖笺 generate — model or offline (F5).
 */

import { parseQijianLlmJson, QIJIAN_STORE_KEY } from "./schema.js";

export { QIJIAN_STORE_KEY };

/**
 * @param {object} seed
 * @param {{
 *   hasApiKey?: boolean,
 *   callModel?: (prompt: string) => Promise<string>,
 *   characterName?: string,
 *   loreSnippets?: string[],
 * }} [opts]
 */
export async function generateQijianDraft(seed = {}, opts = {}) {
  const baseSeed = {
    relation: seed.relation || "朋友",
    keywords: Array.isArray(seed.keywords) ? seed.keywords : [],
    tone: seed.tone || "温柔",
    characterName: opts.characterName || seed.characterName || "",
    loreEntryIds: Array.isArray(seed.loreEntryIds) ? seed.loreEntryIds : [],
  };

  if (!opts.hasApiKey || typeof opts.callModel !== "function") {
    return { ok: false, draft: null, source: "none", reason: "PROVIDER_REQUIRED" };
  }

  const lore = Array.isArray(opts.loreSnippets) ? opts.loreSnippets.filter(Boolean).slice(0, 4) : [];
  const prompt = [
    "你是栖笺，帮用户起草角色卡字段。只输出 JSON：",
    '{"name":"","alias":"","identity":"","summary":"人设摘要","tokens":[],"suggestions":[]}',
    `关系：${baseSeed.relation}`,
    `关键词：${baseSeed.keywords.join("、") || "无"}`,
    `语气：${baseSeed.tone}`,
    lore.length ? `参考设定：${lore.join(" / ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await opts.callModel(prompt);
    const parsed = parseQijianLlmJson(raw);
    if (!parsed.ok) {
      return { ok: false, draft: null, source: "none", reason: "INVALID_MODEL_OUTPUT" };
    }
    rememberDraft(baseSeed, parsed.data);
    return { ok: true, draft: parsed.data, source: "model" };
  } catch (error) {
    console.warn("[yueqi.qijian] generate failed", error);
    return { ok: false, draft: null, source: "none", reason: "MODEL_REQUEST_FAILED" };
  }
}

function rememberDraft(seed, draft) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const raw = JSON.parse(window.localStorage.getItem(QIJIAN_STORE_KEY) || "{}") || {};
    const history = Array.isArray(raw.history) ? raw.history : [];
    history.unshift({
      at: new Date().toISOString(),
      seed,
      draft,
    });
    window.localStorage.setItem(
      QIJIAN_STORE_KEY,
      JSON.stringify({ history: history.slice(0, 10) }),
    );
  } catch {
    /* ignore */
  }
}
