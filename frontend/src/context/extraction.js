import { callModel } from "../model/client.js";
import { ingestCandidate } from "./pipeline.js";
import { chatTextsToCandidates } from "./hot-path.js";
import { deleteItem, getItem, updateItem } from "./store.js";
import {
  forgetUnderstanding,
  promoteCandidateToStable,
  submitCandidate,
} from "../memory/candidate-ledger.js";
import { freezeCompanionScope, requireCompanionScope } from "../memory/companion-scope.js";
import { isFeatureEnabled } from "../features/flags.js";

export const MEMORY_OPERATION_TYPES = Object.freeze(["ADD", "UPDATE", "DELETE", "NOOP"]);

const USER_STATED_RE = /记住|记得|我是|我叫|我喜欢|我不喜欢|别再说|不要说|请记住|please remember|i am |i like |i don't/i;
const FORGET_RE = /忘记|别再提|忘掉|forget that|don't remember/i;

/** Explicit user-authored memory commands are applied on the user turn. */
export function isExplicitMemoryDirective(text) {
  const value = String(text || "").trim();
  return Boolean(value && (USER_STATED_RE.test(value) || FORGET_RE.test(value)));
}

/**
 * Evidence must be a contiguous substring of the user message (not assistant-only).
 */
export function validateEvidenceSpan(userText, span) {
  const user = String(userText || "");
  const evidence = String(span || "").trim();
  if (!evidence || evidence.length < 2) return { ok: false, reason: "empty_span" };
  if (!user.includes(evidence)) return { ok: false, reason: "span_not_in_user_text" };
  return { ok: true, evidence };
}

export function parseMemoryOperations(raw) {
  const text = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.operations) ? parsed.operations : [];
    return rows
      .map((row) => ({
        op: String(row?.op || "NOOP").toUpperCase(),
        memoryId: String(row?.memoryId || ""),
        content: String(row?.content || "").trim(),
        kind: String(row?.kind || "semantic"),
        confidence: Math.max(0, Math.min(1, Number(row?.confidence) || 0.7)),
        reason: String(row?.reason || ""),
        evidenceSpan: String(row?.evidenceSpan || row?.evidence || "").trim(),
        inferred: row?.inferred === true,
      }))
      .filter((row) => MEMORY_OPERATION_TYPES.includes(row.op))
      .slice(0, 8);
  } catch {
    return [];
  }
}

/**
 * Route understanding through candidate-ledger; promote user-stated facts; mirror Graph after promote.
 */
function submitUnderstandingCandidate({
  characterId,
  userId = "local",
  relationshipId = "",
  claim,
  confidence,
  userEvidenceRef,
  assistantEvidenceRef,
  userStated,
  category = "preference",
  source = "chat.extraction",
  realityNamespace = "reality",
  memoryScope = "companion_private_understanding",
}) {
  const scopeCheck = requireCompanionScope(freezeCompanionScope({
    userId,
    companionId: characterId,
    relationshipId,
    memoryScope: userStated && /global|共享基础/.test(String(claim || ""))
      ? "global_user_fact"
      : memoryScope,
  }));
  if (!scopeCheck.ok) {
    return { ok: false, stage: "candidate_ledger", reason: scopeCheck.reason };
  }
  const scope = scopeCheck.scope;
  const evidenceRefs = [userEvidenceRef, assistantEvidenceRef].filter(Boolean);
  const idempotencyKey = `extract:${scope.companionId}:${hashKey(claim)}:${userEvidenceRef}`;
  const submitted = submitCandidate({
    userId: scope.userId,
    companionId: scope.companionId,
    relationshipId: scope.relationshipId,
    memoryScope: scope.memoryScope,
    claim: String(claim || "").trim(),
    confidence: Number(confidence) || 0.4,
    userStated: Boolean(userStated),
    evidenceRefs,
    source,
    category,
    realityNamespace,
    idempotencyKey,
  });
  if (!submitted.ok) return { ok: false, stage: "candidate_ledger", reason: submitted.reason, ...submitted };

  let promoted = null;
  if (userStated) {
    promoted = promoteCandidateToStable(submitted.value.candidateId);
    if (promoted.ok) {
      const graphProjectionOnly = isFeatureEnabled("contextGraphProjectionOnlyV1");
      // Flag on: Graph is projection-only; promote already enqueues/sync-projects.
      // Soften mirror: keep searchable graph row tagged authority=projection + stable sourceRef.
      if (graphProjectionOnly) {
        const stableId = String(promoted.value?.memoryId || "").trim();
        const graph = ingestCandidate(
          {
            content: claim,
            summary: String(claim).slice(0, 240),
            kind: category,
            source: "candidate_promotion",
            sourceRef: stableId ? `stable:${stableId}` : userEvidenceRef,
            confidence: Math.max(0.85, Number(confidence) || 0.9),
            characterId: scope.companionId,
            workspaceId: scope.companionId,
            evidenceRefs,
            memoryStatus: "accepted",
            authority: "projection",
            whyRemembered: "promoted_stable_projection",
            tags: ["projection", "stable_mirror", "m6"],
            meta: {
              authority: "projection",
              sourceStableId: stableId,
              companionId: scope.companionId,
              relationshipId: scope.relationshipId,
              userId: scope.userId,
              memoryScope: scope.memoryScope,
            },
          },
          { projectionMirror: true },
        );
        return {
          ok: true,
          stage: "stable",
          candidateId: submitted.value.candidateId,
          stable: promoted.value,
          graph,
          projection: promoted.projection || null,
          scope,
        };
      }
      // Flag off: legacy searchable mirror after controlled promotion.
      const graph = ingestCandidate({
        content: claim,
        summary: String(claim).slice(0, 240),
        kind: category,
        source: "candidate_promotion",
        sourceRef: userEvidenceRef,
        confidence: Math.max(0.85, Number(confidence) || 0.9),
        characterId: scope.companionId,
        workspaceId: scope.companionId,
        evidenceRefs,
        memoryStatus: "accepted",
        whyRemembered: "promoted_from_candidate_ledger",
        meta: {
          companionId: scope.companionId,
          relationshipId: scope.relationshipId,
          userId: scope.userId,
          memoryScope: scope.memoryScope,
        },
      });
      return {
        ok: true,
        stage: "stable",
        candidateId: submitted.value.candidateId,
        stable: promoted.value,
        graph,
        scope,
      };
    }
  }

  return {
    ok: true,
    stage: "candidate_pending",
    candidateId: submitted.value.candidateId,
    value: submitted.value,
    promoteReason: promoted?.reason || "",
    scope,
  };
}

export function applyMemoryOperations(operations, context = {}) {
  const characterId = String(context.characterId || context.companionId || "").trim();
  const userId = String(context.userId || "local").trim() || "local";
  const relationshipId = String(context.relationshipId || "").trim();
  const userEvidenceRef = String(context.userEvidenceRef || "").trim();
  const assistantEvidenceRef = String(context.assistantEvidenceRef || "").trim();
  const userText = String(context.userText || "");
  if (!characterId) return { ok: false, reason: "missing_companionId", results: [] };
  if (!userEvidenceRef) return { ok: false, reason: "missing_user_evidence", results: [] };
  const results = [];
  for (const operation of Array.isArray(operations) ? operations : []) {
    if (operation.op === "NOOP") {
      results.push({ ok: true, op: "NOOP" });
      continue;
    }
    const spanCheck = validateEvidenceSpan(userText, operation.evidenceSpan || operation.content);
    if (!spanCheck.ok && operation.op !== "DELETE") {
      results.push({ ok: false, op: operation.op, reason: `evidence_rejected:${spanCheck.reason}` });
      continue;
    }

    if (operation.op === "DELETE") {
      forgetUnderstanding({ companionId: characterId, claimIncludes: operation.content || "" });
      const existing = getItem(operation.memoryId);
      if (existing && existing.characterId === characterId) {
        results.push({ ok: deleteItem(existing.id), op: "DELETE", memoryId: existing.id, via: "ledger_and_graph" });
      } else {
        results.push({ ok: true, op: "DELETE", via: "ledger" });
      }
      continue;
    }
    if (operation.op === "UPDATE") {
      const existing = getItem(operation.memoryId);
      if (existing && existing.characterId === characterId) {
        updateItem(existing.id, {
          memoryStatus: "superseded",
          updatedAt: new Date().toISOString(),
          meta: { ...(existing.meta || {}), supersededByEvidenceRef: userEvidenceRef },
        });
      }
      const userStated = operation.inferred !== true;
      const created = submitUnderstandingCandidate({
        characterId,
        userId,
        relationshipId,
        claim: operation.content,
        confidence: operation.confidence,
        userEvidenceRef,
        assistantEvidenceRef,
        userStated,
        category: operation.kind || "semantic",
        source: "model.extracted.update",
        memoryScope: "relationship_memory",
      });
      results.push({ ...created, op: "UPDATE", supersedesId: existing?.id || "" });
      continue;
    }
    if (operation.op === "ADD" && operation.content) {
      // Inferred observations stay pending; explicit user statements may promote.
      const userStated = operation.inferred !== true;
      const created = submitUnderstandingCandidate({
        characterId,
        userId,
        relationshipId,
        claim: operation.content,
        confidence: operation.confidence,
        userEvidenceRef,
        assistantEvidenceRef,
        userStated,
        category: operation.kind || "semantic",
        source: "model.extracted",
        memoryScope: userStated ? "relationship_memory" : "companion_private_understanding",
      });
      results.push({ ...created, op: "ADD", pendingOnly: !userStated });
    }
  }
  return { ok: results.every((item) => item.ok !== false), results };
}

export async function extractAndApplyMemoryOperations(input = {}) {
  const characterId = String(input.characterId || input.companionId || "").trim();
  const userId = String(input.userId || "local").trim() || "local";
  const relationshipId = String(input.relationshipId || "").trim();
  const userText = String(input.userText || "").trim();
  const assistantText = String(input.assistantText || "").trim();
  const userEvidenceRef = String(input.userEvidenceRef || input.sourceRef || "").trim();
  const assistantEvidenceRef = String(input.assistantEvidenceRef || "").trim();
  const realityNamespace = String(input.realityNamespace || "reality").trim() || "reality";
  if (!characterId) return { ok: false, reason: "missing_companionId", results: [] };
  if (!userText || !userEvidenceRef) return { ok: false, reason: "incomplete_evidence", results: [] };

  if (FORGET_RE.test(userText)) {
    // Prefer the remembered claim fragment after the forget verb so needle matches ledger claims
    // (e.g. "忘记我喜欢雨天" → "喜欢雨天", not the whole directive which would never substring-match).
    const claimFragment = userText
      .replace(/^(请)?(忘记|忘掉|别再提|forget that|don't remember)\s*/i, "")
      .replace(/^(我|这件事|这个|that|this)\s*/i, "")
      .trim()
      .slice(0, 40);
    const forgotten = forgetUnderstanding({
      companionId: characterId,
      claimIncludes: claimFragment || userText.slice(0, 40),
    });
    return { ok: true, source: "forget_directive", results: [forgotten] };
  }

  // User-authored memory directives are authoritative and should be available
  // to the next turn without waiting on another model request.
  if (USER_STATED_RE.test(userText)) {
    const candidates = chatTextsToCandidates({
      characterId,
      userText,
      assistantText,
      sourceRef: userEvidenceRef,
    });
    const results = candidates.map((candidate) => submitUnderstandingCandidate({
      characterId,
      userId,
      relationshipId,
      claim: candidate.content,
      confidence: Math.max(0.85, Number(candidate.confidence) || 0.9),
      userEvidenceRef,
      assistantEvidenceRef,
      userStated: true,
      category: candidate.kind || "semantic",
      source: "explicit_user_directive",
      realityNamespace,
      memoryScope: "relationship_memory",
    }));
    if (results.length) {
      return {
        ok: results.every((item) => item.ok !== false),
        source: "explicit_user_directive",
        operations: [],
        results,
      };
    }
  }

  let operations = [];
  const config = input.config || {};
  if (config.baseUrl && config.apiKey && config.model) {
    try {
      const response = await callModel(config, [
        {
          role: "system",
          content: [
            "你是记忆治理抽取器，只输出 JSON：{\"operations\":[...]}。",
            "op 只能是 ADD/UPDATE/DELETE/NOOP；kind 只能是 episodic/semantic/procedural/goal_project/relational。",
            "每个非 NOOP 操作必须带 evidenceSpan：必须是用户原文的连续子串。",
            "只有用户亲口陈述、纠正、要求记住或要求忘记的内容才能成为操作证据。",
            "助手回复不能单独证明用户事实。闲聊、猜测、角色修辞、敏感凭据一律 NOOP。",
            "若只是模型推断，设 inferred=true（将进入 candidate-ledger pending，不得直接稳定化）。最多4项。",
          ].join("\n"),
        },
        {
          role: "user",
          content: `用户消息ID=${userEvidenceRef}\n用户：${userText}\n助手：${assistantText}\n请抽取可持久记忆操作。`,
        },
      ], {
        temperature: 0,
        stream: false,
        businessPurpose: "context.classification",
        capability: "internal",
      });
      operations = parseMemoryOperations(response.content)
        .filter((op) => op.op === "NOOP" || validateEvidenceSpan(userText, op.evidenceSpan || op.content).ok);
    } catch {
      operations = [];
    }
  }

  if (!operations.length) {
    const candidates = chatTextsToCandidates({
      characterId,
      userText,
      assistantText,
      sourceRef: userEvidenceRef,
    });
    const userStated = USER_STATED_RE.test(userText);
    const results = candidates.map((candidate) => submitUnderstandingCandidate({
      characterId,
      userId,
      relationshipId,
      claim: candidate.content,
      confidence: candidate.confidence || 0.45,
      userEvidenceRef,
      assistantEvidenceRef,
      userStated,
      category: candidate.kind || "semantic",
      source: "deterministic.extract",
      realityNamespace,
      memoryScope: userStated ? "relationship_memory" : "companion_private_understanding",
    }));
    return { ok: results.every((item) => item.ok !== false), source: "deterministic", operations: [], results };
  }
  return {
    ...applyMemoryOperations(operations, {
      characterId,
      userId,
      relationshipId,
      userEvidenceRef,
      assistantEvidenceRef,
      userText,
      realityNamespace,
    }),
    source: "model",
    operations,
  };
}

function hashKey(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim().slice(0, 120);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
