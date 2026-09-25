/**
 * Structured action parse → validate → repair once → deterministic fallback.
 */

/**
 * @param {unknown} raw
 * @returns {any|null}
 */
export function parseAction(raw) {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return normalizeShape(raw);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // fenced json
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1].trim() : trimmed;
    try {
      return normalizeShape(JSON.parse(body));
    } catch {
      // try to extract first {...}
      const start = body.indexOf("{");
      const end = body.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return normalizeShape(JSON.parse(body.slice(start, end + 1)));
        } catch {
          return null;
        }
      }
      return null;
    }
  }
  return null;
}

/**
 * @param {any} obj
 */
function normalizeShape(obj) {
  if (!obj || typeof obj !== "object") return null;
  const type = obj.type || obj.action || obj.act;
  if (!type) return { ...obj };
  const out = { ...obj, type: String(type) };
  if (obj.target != null && out.target == null) out.target = obj.target;
  if (obj.value != null && out.value == null) out.value = obj.value;
  if (obj.clue != null && out.clue == null) out.clue = obj.clue;
  if (obj.answer != null && out.answer == null) out.answer = obj.answer;
  if (obj.guess != null && out.guess == null) out.guess = obj.guess;
  if (obj.text != null && out.text == null) out.text = obj.text;
  return out;
}

/**
 * @param {any} action
 * @param {any[]} legal
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateAction(action, legal) {
  if (!action || typeof action !== "object") {
    return { ok: false, reason: "not_an_object" };
  }
  const type = action.type || action.action;
  if (!type) return { ok: false, reason: "missing_type" };
  const list = Array.isArray(legal) ? legal : [];
  if (!list.length) return { ok: true };
  const match = list.find((item) => {
    if (typeof item === "string") return item === type;
    return item?.type === type;
  });
  if (!match) return { ok: false, reason: `illegal_type:${type}` };
  if (typeof match === "object" && Array.isArray(match.targets) && action.target != null) {
    if (!match.targets.includes(action.target)) {
      return { ok: false, reason: "illegal_target" };
    }
  }
  if (typeof match === "object" && match.fields) {
    for (const key of match.fields) {
      if (action[key] == null || action[key] === "") {
        return { ok: false, reason: `missing_field:${key}` };
      }
    }
  }
  return { ok: true };
}

/**
 * Soft repair: coerce common LLM mistakes once.
 * @param {any} action
 * @param {any[]} legal
 */
export function repairAction(action, legal) {
  if (!action || typeof action !== "object") return null;
  const repaired = { ...action };
  if (!repaired.type && repaired.action) repaired.type = repaired.action;
  if (repaired.type === "speak" && repaired.message && !repaired.text) {
    repaired.text = repaired.message;
  }
  if (repaired.type === "vote" && repaired.playerId && repaired.target == null) {
    repaired.target = repaired.playerId;
  }
  if (repaired.type === "guess" && repaired.word && repaired.guess == null) {
    repaired.guess = repaired.word;
  }
  if (repaired.type === "clue" && repaired.word && repaired.clue == null) {
    repaired.clue = repaired.word;
  }
  if (repaired.type === "answer" && repaired.word && repaired.answer == null) {
    repaired.answer = repaired.word;
  }
  // If type missing but only one legal type, adopt it
  if (!repaired.type && legal?.length === 1) {
    const only = legal[0];
    repaired.type = typeof only === "string" ? only : only.type;
  }
  const v = validateAction(repaired, legal);
  return v.ok ? repaired : null;
}

/**
 * Full pipeline: parse → validate → repair once → fallback.
 *
 * @param {object} args
 * @param {unknown} args.raw
 * @param {any[]} args.legal
 * @param {() => any} args.fallback
 * @returns {{ action: any, source: "parsed"|"repaired"|"fallback", log: object }}
 */
export function resolveAction({ raw, legal, fallback }) {
  const log = { rawType: typeof raw, repaired: false, fallback: false };
  let action = parseAction(raw);
  let v = validateAction(action, legal);
  if (v.ok) {
    return { action, source: "parsed", log };
  }
  const repaired = repairAction(action, legal);
  if (repaired) {
    log.repaired = true;
    return { action: repaired, source: "repaired", log };
  }
  const fb = typeof fallback === "function" ? fallback() : null;
  log.fallback = true;
  log.failReason = v.reason;
  return { action: fb, source: "fallback", log };
}

/**
 * Convenience for orchestrator.
 */
export function parseValidateRepairFallback(raw, legal, fallback) {
  return resolveAction({ raw, legal, fallback });
}
