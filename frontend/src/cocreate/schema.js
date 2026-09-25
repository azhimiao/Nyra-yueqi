/**
 * E6 共创 — draft validation + offline templates.
 */

/**
 * @typedef {{
 *   id: string,
 *   target: "character"|"script",
 *   characterId?: string,
 *   input: { prompt: string, tone?: string, keywords?: string[] },
 *   output: {
 *     characterPatch?: { fieldIndex?: number, text?: string, tokens?: string[] },
 *     scriptPatch?: { title: string, premise: string, openingBeat: string, mood: string },
 *   },
 *   createdAt: string,
 *   appliedAt?: string,
 * }} CocreateDraft
 */

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, data?: object, error?: string }}
 */
export function parseCocreateLlmJson(raw) {
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
  return { ok: true, data: parsed };
}

/**
 * Offline template when no API key / parse fail.
 * @param {{ target: "character"|"script", prompt?: string, tone?: string, keywords?: string[], characterName?: string }} input
 */
export function offlineCocreateDraft(input = {}) {
  const prompt = String(input.prompt || "").trim() || "温柔一点的日常";
  const tone = String(input.tone || "warm").trim() || "warm";
  const keywords = Array.isArray(input.keywords)
    ? input.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 6)
    : [];
  const kw = keywords.length ? keywords.join("、") : "雨声、台灯、未说完的话";
  const name = String(input.characterName || "TA").trim() || "TA";

  if (input.target === "script") {
    return {
      scriptPatch: {
        title: `共创 · ${prompt.slice(0, 12) || "一幕"}`,
        premise: `${name}与你之间：${prompt}。关键词：${kw}。语气：${tone}。`,
        openingBeat: `灯光偏暖。你们相对而坐，空气里先有一阵安静，再有一句刚好的开场。`,
        mood: tone === "cool" ? "night" : "warm",
      },
    };
  }

  const summary = `${name}此刻更偏「${tone}」：在「${prompt}」里会留意小细节，说话不急，关键词绕着${kw}转。`;
  return {
    characterPatch: {
      fieldIndex: 4,
      text: summary,
      tokens: keywords.length ? keywords : ["共创", tone, "细节"],
    },
  };
}

/**
 * Map LLM JSON → output patches.
 * @param {object} data
 * @param {"character"|"script"} target
 */
export function mapLlmToOutput(data, target) {
  if (target === "script") {
    const script = data?.script || data;
    return {
      scriptPatch: {
        title: String(script?.title || "共创一幕").trim() || "共创一幕",
        premise: String(script?.premise || "").trim() || "一次未命名的共演。",
        openingBeat: String(script?.openingBeat || "").trim() || "灯光亮起，故事开始。",
        mood: String(script?.mood || "warm").trim() || "warm",
      },
    };
  }
  const text = String(data?.characterSummary || data?.text || "").trim();
  const tokens = Array.isArray(data?.tokens)
    ? data.tokens.map((t) => String(t).trim()).filter(Boolean).slice(0, 12)
    : [];
  return {
    characterPatch: {
      fieldIndex: 4,
      text: text || "一段新的人设摘要。",
      tokens,
    },
  };
}

/**
 * @param {unknown} draft
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateCocreateDraft(draft) {
  const errors = [];
  if (!draft || typeof draft !== "object") return { ok: false, errors: ["not_object"] };
  const d = /** @type {CocreateDraft} */ (draft);
  if (!["character", "script"].includes(d.target)) errors.push("bad_target");
  if (!d.output || typeof d.output !== "object") errors.push("missing_output");
  return { ok: errors.length === 0, errors };
}
