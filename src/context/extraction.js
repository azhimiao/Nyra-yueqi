import { ingestCandidate } from "./pipeline.js";
import { getItem } from "./store.js";
import { getSession, getSharedHistory } from "../conversation/index.js";
import { forgetUnderstanding, promoteCandidateToStable, submitCandidate, recallStableMemory } from "../memory/candidate-ledger.js";
import { isSuppressed, isSuppressedContent, isSuppressedEvidence } from "../memory/suppression-ledger.js";
import { userFactSpans, factSlot, factCondition, isCorrection, evidenceFingerprint, FORGET_DIRECTIVE, forgetTargets } from "../memory/evidence.js";
import { invalidateBranchSummariesForConversation } from "./branch-summary.js";

export const MEMORY_OPERATION_TYPES = Object.freeze(["ADD", "UPDATE", "DELETE", "NOOP"]);

export function isExplicitMemoryDirective(text) {
  return FORGET_DIRECTIVE.test(String(text || "").trim()) || userFactSpans(text).length > 0;
}

export function validateEvidenceSpan(userText, span) {
  const evidence = String(span || "").trim();
  if (evidence.length < 2) return { ok: false, reason: "empty_span" };
  return String(userText || "").includes(evidence) ? { ok: true, evidence } : { ok: false, reason: "span_not_in_user_text" };
}

export function parseMemoryOperations(raw) {
  try {
    const parsed = JSON.parse(String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    return (Array.isArray(parsed) ? parsed : parsed.operations || []).map((row) => ({
      op: String(row?.op || "NOOP").toUpperCase(), memoryId: String(row?.memoryId || ""),
      content: String(row?.content || "").trim(), kind: String(row?.kind || "semantic"),
      confidence: Math.max(0, Math.min(1, Number(row?.confidence) || 0.7)),
      evidenceSpan: String(row?.evidenceSpan || row?.evidence || "").trim(), inferred: row?.inferred === true,
    })).filter((row) => MEMORY_OPERATION_TYPES.includes(row.op)).slice(0, 8);
  } catch { return []; }
}

/** Revalidate the authoritative user message before any late extraction writes. */
function sourceStillValid(input) {
  if (isSuppressed(input.userEvidenceRef, { companionId: input.characterId })) return false;
  if (!input.conversationSessionId) return true; // Imported/manual callers still provide explicit evidence.
  const session = getSession(input.conversationSessionId);
  if (!session || (session.characterId !== input.characterId
      && session.meta?.productCharacterId !== input.characterId
      && !String(session.characterId || "").startsWith("__"))) return false;
  const rows = getSharedHistory(input.conversationSessionId, { branchId: input.branchId || session.activeBranchId });
  const row = rows.find((message) => [message.id, message.messageId, message.candidateId, message.meta?.candidateId, message.meta?.clientMessageId, message.meta?.legacyMessageId].includes(input.userEvidenceRef));
  return row?.role === "user" && String(row.content || "").trim() === input.userText;
}

function submitFact(operation, context) {
  // A model paraphrase can add claims absent from its quoted evidence. Persist the quote itself.
  const claim = String(operation.inferred ? operation.content : operation.evidenceSpan || operation.content || "").trim();
  const companionId = context.characterId;
  if (!sourceStillValid(context)) return { ok: false, reason: "stale_user_evidence" };
  if (isSuppressedContent(claim, { companionId }) || isSuppressedEvidence(context.userEvidenceRef, claim, { companionId })) return { ok: false, reason: "suppressed" };
  const factKey = factSlot(claim);
  const condition = factCondition(claim);
  const peers = recallStableMemory({ companionId, userId: context.userId, realityNamespace: context.realityNamespace, limit: 10000 });
  let replaced = [];
  if (operation.op === "UPDATE") {
    const graph = getItem(operation.memoryId);
    replaced = peers.filter((row) => row.memoryId === operation.memoryId || (graph?.characterId === companionId && (row.memoryId === graph.meta?.sourceStableId || row.body === graph.content)));
    if (!replaced.length) return { ok: false, reason: "update_target_not_found" };
  } else if (operation.inferred !== true && factKey) {
    // Explicit correction replaces this topic; otherwise only the same condition replaces it.
    replaced = peers.filter((row) => (row.factKey || factSlot(row.body)) === factKey && row.body !== claim
      && (isCorrection(context.userText) || (row.condition || factCondition(row.body)) === condition));
  }
  const evidence = [{ messageId: context.userEvidenceRef, role: "user", span: operation.evidenceSpan,
    conversationSessionId: context.conversationSessionId || "", branchId: context.branchId || "",
    contentHash: evidenceFingerprint(context.userText), revision: context.sourceUserRevision ?? null }];
  const truthDomain = context.realityNamespace !== "reality" ? "fiction" : operation.inferred ? "inferred_candidate" : "user_asserted";
  const submitted = submitCandidate({ companionId, userId: context.userId, relationshipId: context.relationshipId,
    memoryScope: operation.inferred ? "companion_private_understanding" : "relationship_memory",
    claim, confidence: operation.inferred ? Math.min(0.6, operation.confidence || 0.4) : 0.95,
    userStated: operation.inferred !== true, evidenceRefs: [context.userEvidenceRef], evidence,
    factKey, condition, truthDomain, category: operation.kind || "semantic", source: "user_evidence.extract",
    realityNamespace: context.realityNamespace,
    idempotencyKey: `extract:${companionId}:${context.userEvidenceRef}:${evidenceFingerprint(claim)}`,
  });
  if (!submitted.ok) return submitted;
  if (operation.inferred || truthDomain !== "user_asserted") return { ok: true, stage: "candidate_pending", value: submitted.value };
  const promoted = promoteCandidateToStable(submitted.value.candidateId, { supersedesMemoryIds: replaced.map((row) => row.memoryId), replacementEvidenceRef: context.userEvidenceRef });
  if (!promoted.ok) return promoted;
  const stable = promoted.value;
  const graph = ingestCandidate({ content: stable.body, summary: stable.body.slice(0, 240), kind: operation.kind || "semantic",
    source: "candidate_promotion", sourceRef: `stable:${stable.memoryId}`, confidence: 0.95,
    characterId: companionId, workspaceId: companionId, evidenceRefs: [context.userEvidenceRef],
    memoryStatus: "accepted", authority: "projection", whyRemembered: "promoted_user_evidence",
    meta: { authority: "projection", sourceStableId: stable.memoryId, companionId, userId: context.userId,
      relationshipId: context.relationshipId, memoryScope: "relationship_memory", evidence, factKey, condition, truthDomain },
  }, { projectionMirror: true });
  return { ok: true, stage: "stable", stable, graph, superseded: promoted.superseded, reused: promoted.reused === true };
}

export function applyMemoryOperations(operations, input = {}) {
  const context = { ...input, characterId: String(input.characterId || input.companionId || "").trim(),
    userId: String(input.userId || "local"), relationshipId: String(input.relationshipId || ""),
    userEvidenceRef: String(input.userEvidenceRef || input.sourceRef || "").trim(),
    userText: String(input.userText || "").trim(), realityNamespace: String(input.realityNamespace || "reality") };
  if (!context.characterId) return { ok: false, reason: "missing_companionId", results: [] };
  if (!context.userEvidenceRef) return { ok: false, reason: "missing_user_evidence", results: [] };
  if (!sourceStillValid(context)) return { ok: false, reason: "stale_user_evidence", results: [] };
  const facts = userFactSpans(context.userText);
  const results = (Array.isArray(operations) ? operations : []).map((operation) => {
    if (operation.op === "NOOP") return { ok: true, op: "NOOP" };
    if (operation.op === "DELETE") {
      const target = String(operation.content || "").trim();
      if (!FORGET_DIRECTIVE.test(context.userText) || target.length < 2 || !context.userText.includes(target)) return { ok: false, reason: "explicit_forget_evidence_required" };
      return forgetUnderstanding({ companionId: context.characterId, claimIncludes: target });
    }
    const check = validateEvidenceSpan(context.userText, operation.evidenceSpan || operation.content);
    const quote = String(check.evidence || "").replace(/[。！!;；]+$/, "").trim();
    const assertion = facts.find((span) => span.includes(quote));
    if (!check.ok || (operation.inferred !== true && !assertion)) return { ok: false, op: operation.op, reason: "evidence_rejected:not_user_assertion" };
    // Preserve negation and conditions around a selected substring ("喝咖啡" in
    // "我晚上不喝咖啡" must never become an unconditional positive preference).
    return { ...submitFact({ ...operation, evidenceSpan: operation.inferred ? check.evidence : assertion }, context), op: operation.op };
  });
  if (results.some((row) => row.ok && (row.stable || row.touched))) invalidateBranchSummariesForConversation({ conversationSessionId: context.conversationSessionId, reason: "memory_evidence_changed" });
  return { ok: results.every((row) => row.ok !== false), results };
}

export async function extractAndApplyMemoryOperations(input = {}) {
  const userText = String(input.userText || "").trim();
  const characterId = String(input.characterId || input.companionId || "").trim();
  const userEvidenceRef = String(input.userEvidenceRef || input.sourceRef || "").trim();
  const context = { ...input, characterId, userText, userEvidenceRef };
  if (!characterId || !userText || !userEvidenceRef) return { ok: false, reason: "incomplete_evidence", results: [] };
  if (!sourceStillValid(context)) return { ok: false, reason: "stale_user_evidence", results: [] };
  if (FORGET_DIRECTIVE.test(userText)) {
    const targets = forgetTargets(userText);
    if (!targets.length) return { ok: false, reason: "explicit_forget_target_required", results: [] };
    const results = targets.map((target) => forgetUnderstanding({ companionId: characterId, claimIncludes: target }));
    invalidateBranchSummariesForConversation({ conversationSessionId: input.conversationSessionId, reason: "user_forget" });
    return { ok: results.every((row) => row.ok), source: "forget_directive", results };
  }
  // Exact user assertions need no second LLM request. Questions, fiction and unsupported
  // guesses remain conversational context rather than silently becoming real-world facts.
  const operations = userFactSpans(userText).map((span) => ({ op: "ADD", content: span, evidenceSpan: span, kind: "semantic", inferred: false }));
  return { ...applyMemoryOperations(operations, context), source: "user_evidence", operations };
}
