/**
 * Evidence validator for TurnUnderstanding proposals (plan §5.3).
 * Drops proposals without evidenceRefs or without contiguous user-text evidence.
 */

import { validateEvidenceSpan } from "../context/extraction.js";
import { validateActionProposalV1 } from "../contracts/action-proposal-v1.js";
import { validateTemporalEventV1 } from "../contracts/temporal-event-v1.js";

/**
 * @param {string} userText
 * @param {string[]} refs
 */
export function evidenceRefsContiguousInUserText(userText, refs) {
  if (!Array.isArray(refs) || refs.length === 0) {
    return { ok: false, reason: "missing_evidence_refs" };
  }
  for (const ref of refs) {
    const check = validateEvidenceSpan(userText, ref);
    if (!check.ok) return { ok: false, reason: check.reason || "span_not_in_user_text", ref };
  }
  return { ok: true };
}

/**
 * @param {object} item proposal-like with evidenceRefs
 * @param {string} userText
 */
export function proposalHasValidEvidence(item, userText) {
  if (!item || typeof item !== "object") return false;
  return evidenceRefsContiguousInUserText(userText, item.evidenceRefs).ok;
}

/**
 * Validate and filter a raw understanding against user text.
 * @param {object} understanding
 * @param {string} userText
 * @returns {{
 *   understanding: object,
 *   dropped: object[],
 *   ok: boolean,
 * }}
 */
export function validateUnderstanding(understanding, userText) {
  const text = String(userText || "");
  const dropped = [];
  const u = understanding && typeof understanding === "object" ? { ...understanding } : {};

  const filterList = (key, extraValidate) => {
    const list = Array.isArray(u[key]) ? u[key] : [];
    const kept = [];
    for (const item of list) {
      if (!proposalHasValidEvidence(item, text)) {
        dropped.push({ kind: key, reason: "no_evidence", item });
        continue;
      }
      if (typeof extraValidate === "function") {
        const v = extraValidate(item);
        if (v && v.ok === false) {
          dropped.push({ kind: key, reason: "schema", errors: v.errors, item });
          continue;
        }
      }
      kept.push(item);
    }
    u[key] = kept;
  };

  filterList("actionProposals", validateActionProposalV1);
  filterList("eventProposals", validateTemporalEventV1);
  filterList("temporalMentions");
  filterList("webRequests");
  filterList("relationshipSignals");
  filterList("memoryCandidates");

  // Top-level evidenceRefs must also be contiguous (when present)
  const topRefs = Array.isArray(u.evidenceRefs) ? u.evidenceRefs : [];
  u.evidenceRefs = topRefs.filter((ref) => validateEvidenceSpan(text, ref).ok);

  return {
    ok: true,
    understanding: u,
    dropped,
  };
}
