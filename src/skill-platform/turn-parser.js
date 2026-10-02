/**
 * Parse model JSON into SkillTurn; strip raw JSON from user-visible text.
 */

const MAX_ASSISTANT_TEXT = 8000;

/**
 * @param {unknown} raw
 */
export function parseSkillTurnJson(raw) {
  if (raw == null) return { ok: false, reason: "empty_turn" };

  let parsed = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, reason: "empty_turn" };
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "invalid_turn_shape" };
  }

  const obj = /** @type {Record<string, unknown>} */ (parsed);
  const assistantText = stripJsonFromAssistantText(String(obj.assistantText || ""));
  if (!assistantText.trim()) {
    return { ok: false, reason: "missing_assistant_text" };
  }
  if (assistantText.length > MAX_ASSISTANT_TEXT) {
    return { ok: false, reason: "assistant_text_too_long" };
  }

  const nextAction = obj.nextAction != null ? String(obj.nextAction).trim() : "";
  if (!nextAction) return { ok: false, reason: "missing_next_action" };

  const statePatch =
    obj.statePatch && typeof obj.statePatch === "object" && !Array.isArray(obj.statePatch)
      ? { .../** @type {Record<string, unknown>} */ (obj.statePatch) }
      : {};

  const memoryCandidates = normalizeMemoryCandidates(obj.memoryCandidates);
  if (memoryCandidates.ok === false) return memoryCandidates;

  const taskProposals = normalizeTaskProposals(obj.taskProposals);
  if (taskProposals.ok === false) return taskProposals;

  return {
    ok: true,
    value: {
      assistantText,
      nextAction,
      statePatch,
      memoryCandidates: memoryCandidates.value,
      taskProposals: taskProposals.value,
    },
  };
}

/**
 * Remove accidental JSON blobs / run markers from assistant-facing text.
 * @param {string} text
 */
export function stripJsonFromAssistantText(text) {
  let out = String(text || "");
  out = out.replace(/```json[\s\S]*?```/gi, "").trim();
  if (/^\s*\{[\s\S]*\}\s*$/.test(out)) {
    try {
      JSON.parse(out);
      return "";
    } catch {
      /* keep prose */
    }
  }
  out = out.replace(/\[\[SKILL_TURN[^\]]*\]\]/gi, "").trim();
  return out.trim();
}

/**
 * @param {unknown} raw
 */
function normalizeMemoryCandidates(raw) {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, reason: "invalid_memory_candidates" };

  /** @type {object[]} */
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, reason: "invalid_memory_candidate" };
    }
    const row = /** @type {Record<string, unknown>} */ (item);
    const text = String(row.text || "").trim();
    const target = String(row.target || "").trim();
    const evidenceMessageIds = Array.isArray(row.evidenceMessageIds)
      ? row.evidenceMessageIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    if (!text) return { ok: false, reason: "memory_candidate_missing_text" };
    if (!target) return { ok: false, reason: "memory_candidate_missing_target" };
    if (evidenceMessageIds.length === 0) {
      return { ok: false, reason: "memory_candidate_missing_evidence" };
    }
    out.push({ text, target, evidenceMessageIds });
  }
  return { ok: true, value: out };
}

/**
 * @param {unknown} raw
 */
function normalizeTaskProposals(raw) {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, reason: "invalid_task_proposals" };

  /** @type {object[]} */
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, reason: "invalid_task_proposal" };
    }
    const row = /** @type {Record<string, unknown>} */ (item);
    const capabilityId = String(row.capabilityId || "").trim();
    const title = String(row.title || "").trim();
    const input =
      row.input && typeof row.input === "object" && !Array.isArray(row.input)
        ? { .../** @type {Record<string, unknown>} */ (row.input) }
        : {};
    if (!capabilityId) return { ok: false, reason: "task_proposal_missing_capability" };
    out.push({
      capabilityId,
      title: title || undefined,
      input,
    });
  }
  return { ok: true, value: out };
}
