/**
 * Parse LLM / freeform JSON into a Duo action; repair once; then fallback.
 */

/**
 * @param {string} text
 * @returns {any|null}
 */
export function extractJsonObject(text) {
  if (text == null) return null;
  const s = String(text).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    // continue
  }
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // continue
    }
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * One-shot structural repair for common LLM slips.
 * @param {any} raw
 * @param {any[]} legal
 */
export function repairAction(raw, legal = []) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (/^next(_round)?$/i.test(t)) return { type: "next_round" };
    if (/^stop$/i.test(t)) return { stop: true };
    return { clue: t };
  }
  if (typeof raw !== "object") return null;

  const out = { ...raw };

  if (out.action && !out.type) out.type = out.action;
  if (out.option != null && out.choice == null) out.choice = out.option;
  if (out.option_id != null && out.choice == null) out.choice = out.option_id;
  if (out.card != null && out.value == null) out.value = out.card;
  if (out.number != null && out.value == null) out.value = out.number;
  if (out.text != null && out.question == null && out.clue == null) {
    if (legal.some((a) => a.type === "ask")) out.question = out.text;
    else if (legal.some((a) => a.type === "clue")) out.clue = out.text;
  }
  if (out.picks == null && Array.isArray(out.rank)) out.picks = out.rank;
  if (out.sequence == null && Array.isArray(out.colors)) out.sequence = out.colors;
  if (out.optionIndex == null && out.index != null && legal.some((a) => a.type === "answer")) {
    out.optionIndex = out.index;
  }

  // If legal says next_round only
  if (legal.length === 1 && legal[0].type === "next_round") {
    return { type: "next_round" };
  }
  if (legal.length === 1 && legal[0].type === "next") {
    return { type: "next" };
  }

  return out;
}

/**
 * Pull a legal play/guess out of in-character speech when JSON is missing.
 * @param {string} text
 * @param {any[]} [legalActions]
 */
export function extractActionFromSpeech(text, legalActions = []) {
  const s = String(text || "");
  if (!s.trim() || !Array.isArray(legalActions) || !legalActions.length) return null;
  const types = new Set(legalActions.map((item) => item?.type));
  if (types.has("next_round") && /下一轮|下一回合|继续/.test(s)) {
    return { type: "next_round" };
  }
  if (types.has("play")) {
    const values = legalActions
      .filter((item) => item?.type === "play")
      .map((item) => Number(item.value))
      .filter((n) => Number.isFinite(n));
    const valueSet = new Set(values);
    if (!valueSet.size) return null;
    const explicit = [...s.matchAll(/(?:出牌|打出|打出了|出了|play(?:ed)?|出)\s*[:=]?\s*(\d{1,3})/gi)]
      .map((m) => Number(m[1]))
      .filter((n) => valueSet.has(n));
    if (explicit.length) return { type: "play", value: explicit[explicit.length - 1] };
    const unique = [...new Set((s.match(/\d{1,3}/g) || []).map(Number).filter((n) => valueSet.has(n)))];
    if (unique.length === 1) return { type: "play", value: unique[0] };
  }
  return null;
}

export function parseDuoAction({ input, legalActions = [], fallback = null }) {
  let raw = input;
  if (typeof input === "string") {
    raw = extractJsonObject(input);
    if (raw == null || !looksPlausible(raw, legalActions)) {
      const fromSpeech = extractActionFromSpeech(input, legalActions);
      if (fromSpeech) raw = fromSpeech;
      else if (raw == null && input.trim()) raw = { text: input.trim() };
    }
  }

  if (raw && typeof raw === "object") {
    // First try as-is
    if (looksPlausible(raw, legalActions)) {
      return { action: raw, source: "json" };
    }
    const repaired = repairAction(raw, legalActions);
    if (repaired && looksPlausible(repaired, legalActions)) {
      return { action: repaired, source: "repaired" };
    }
  }

  if (typeof fallback === "function") {
    const fb = fallback();
    if (fb) return { action: fb, source: "fallback" };
  }

  return {
    action: null,
    source: "fallback",
    error: "unparseable_action",
  };
}

/**
 * @param {any} action
 * @param {any[]} legal
 */
function looksPlausible(action, legal) {
  if (!action || typeof action !== "object") return false;
  if (!legal?.length) return true;
  const types = new Set(legal.map((a) => a.type));
  if (action.type && types.has(action.type)) return true;
  if (action.stop && types.has("stop")) return true;
  if (action.clue != null && (types.has("clue") || legal.some((a) => a.fields?.includes("clue")))) {
    return true;
  }
  if (action.value != null && (types.has("guess") || types.has("play") || types.has("clue"))) {
    return true;
  }
  if (action.guess != null && types.has("guess")) return true;
  if (action.question != null && types.has("ask")) return true;
  if (action.choice != null && types.has("choose")) return true;
  if (action.picks != null && types.has("select")) return true;
  if (action.sequence != null && types.has("guess")) return true;
  if (action.selfRating != null && types.has("submit")) return true;
  if (action.optionIndex != null && types.has("answer")) return true;
  if (action.index != null && types.has("guess")) return true;
  return false;
}
