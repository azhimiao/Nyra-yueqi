/**
 * Scenario FeatureMemoryAdapter — fiction isolation for finale / dialogue.
 * Finale → one Timeline experience.completed (shared_fiction).
 * Never auto-submit/promote fiction dialogue to reality Stable.
 * Ordinary intimacy/trust/tension writeback is off on the adapter path.
 */

import { createSourceRefV1 } from "../../contracts/source-ref-v1.js";
import { mintId } from "../../contracts/ids.js";
import { isFeatureEnabled } from "../../features/flags.js";
import { appendTimelineEvent } from "../../timeline/repository.js";
import {
  submitCandidate,
  promoteCandidateToStable,
} from "../candidate-ledger.js";
import { freezeCompanionScope, relationshipIdFor } from "../companion-scope.js";
import { createFeatureMemoryAdapter } from "./contract.js";
import { registerFeatureMemoryAdapter } from "./registry.js";

export const SCENARIO_ADAPTER_FEATURE_ID = "scenario";
export const SCENARIO_FINALE_EVENT_TYPE = "experience.completed";
export const SCENARIO_REALITY_NAMESPACE = "shared_fiction";

let registered = false;

/**
 * Adapter path when either unified adapters or graph-projection-only is on.
 * @returns {boolean}
 */
export function isScenarioAdapterPathEnabled() {
  try {
    return (
      isFeatureEnabled("unifiedMemoryAdaptersV1") === true
      || isFeatureEnabled("contextGraphProjectionOnlyV1") === true
    );
  } catch {
    return false;
  }
}

function scenarioScope(input = {}, scope = {}) {
  const companionId = String(
    scope.companionId
      || input.companionId
      || input.characterId
      || "",
  ).trim();
  const userId = String(scope.userId || input.userId || "local").trim() || "local";
  return freezeCompanionScope({
    userId,
    companionId,
    relationshipId:
      scope.relationshipId
      || input.relationshipId
      || relationshipIdFor(userId, companionId),
  });
}

/**
 * @param {object} input — finale / experience payload
 */
export function getScenarioFinaleSourceRef(input = {}) {
  const scope = scenarioScope(input);
  const runId = String(input.runId || input.sourceId || "").trim();
  if (!runId || !scope.companionId) return null;
  const sourceVersion = Number(input.sourceVersion) || 1;
  const summary = String(input.summary || input.narrativeSummary || "").trim();
  return createSourceRefV1({
    sourceType: "experience_session",
    sourceId: runId,
    sourceVersion,
    companionId: scope.companionId,
    relationshipId: scope.relationshipId,
    userId: scope.userId,
    realityNamespace: SCENARIO_REALITY_NAMESPACE,
    occurredAt: String(input.occurredAt || new Date().toISOString()),
    visibility: "shared",
    contentHash:
      String(input.contentHash || "").trim()
      || `scenario-finale:${runId}:v${sourceVersion}:${summary.length}`,
  });
}

function defaultAppendTimeline(event) {
  return appendTimelineEvent(event);
}

/**
 * Emit exactly one finale Timeline event (injectable appendTimeline).
 * @param {object} input
 * @param {{ appendTimeline?: Function }} [deps]
 */
export function emitScenarioFinaleTimeline(input = {}, deps = {}) {
  const scope = scenarioScope(input);
  if (!scope.companionId) return { ok: false, reason: "missing_companionId", events: [] };
  const summary = String(input.summary || input.narrativeSummary || "").trim();
  if (!summary) return { ok: false, reason: "missing_summary", events: [] };
  const sourceRef = getScenarioFinaleSourceRef(input);
  if (!sourceRef) return { ok: false, reason: "missing_source_ref", events: [] };

  const append =
    typeof deps.appendTimeline === "function" ? deps.appendTimeline : defaultAppendTimeline;
  const idempotencyKey =
    String(input.idempotencyKey || "").trim()
    || `scenario-finale:${sourceRef.sourceId}:${SCENARIO_FINALE_EVENT_TYPE}`;

  const result = append({
    eventId: mintId("eventId", "scenario"),
    eventType: SCENARIO_FINALE_EVENT_TYPE,
    source: "scenario_adapter",
    sourceId: sourceRef.sourceId,
    idempotencyKey,
    actor: scope.companionId,
    principal: scope.userId,
    companionId: scope.companionId,
    userId: scope.userId,
    relationshipId: scope.relationshipId,
    realityNamespace: SCENARIO_REALITY_NAMESPACE,
    occurredAt: sourceRef.occurredAt,
    visibility: "shared",
    payload: {
      summary: `情景剧谢幕：${summary}`.slice(0, 240),
      runId: sourceRef.sourceId,
      scriptId: String(input.scriptId || ""),
      scriptTitle: String(input.scriptTitle || ""),
      diaryId: String(input.diaryId || ""),
      fiction: true,
      sourceRef,
    },
    evidenceRefs: [`experience:${sourceRef.sourceId}:v${sourceRef.sourceVersion}`],
  });

  return {
    ok: result?.ok !== false,
    events: result?.ok !== false && result?.value ? [result.value] : [],
    result,
    allowNumericRelationship: false,
  };
}

/**
 * Fiction understanding candidate only — never reality namespace unless userExplicitRealityRemember.
 * Does not call promote.
 */
export function submitScenarioFictionCandidate(input = {}, deps = {}) {
  const scope = scenarioScope(input);
  if (!scope.companionId) return { ok: false, reason: "missing_companionId" };

  const userExplicit = input.userExplicitRealityRemember === true;
  if (
    String(input.realityNamespace || "").trim() === "reality"
    && !userExplicit
  ) {
    return { ok: false, reason: "fiction_reality_blocked" };
  }

  const claim =
    String(input.claim || input.summary || input.narrativeSummary || input.content || "").trim();
  if (!claim) return { ok: false, reason: "missing_claim" };

  const submit =
    typeof deps.submitCandidate === "function" ? deps.submitCandidate : submitCandidate;
  const runId = String(input.runId || "").trim();
  const realityNamespace = userExplicit ? "reality" : SCENARIO_REALITY_NAMESPACE;

  const result = submit({
    companionId: scope.companionId,
    userId: scope.userId,
    relationshipId: scope.relationshipId,
    claim,
    category: input.category || "episodic",
    source: "scenario_adapter",
    userStated: userExplicit,
    confidence: userExplicit ? 0.9 : Number(input.confidence) || 0.45,
    status: "pending",
    realityNamespace,
    evidenceRefs: runId ? [`experience:${runId}`] : [],
    idempotencyKey:
      String(input.idempotencyKey || "").trim()
      || `scenario-fiction:${scope.companionId}:${runId || claim.slice(0, 40)}`,
    meta: {
      fiction: realityNamespace === SCENARIO_REALITY_NAMESPACE,
      runId,
      graphIngest: false,
      allowNumericRelationship: false,
    },
  });

  return {
    ok: result?.ok !== false,
    candidate: result?.value || result,
    realityNamespace,
    graphIngested: false,
    allowNumericRelationship: false,
    result,
  };
}

/**
 * Attempt to turn a scenario dialogue line into reality Stable — must fail.
 * Used by verify + bridge guards.
 */
export function attemptScenarioDialogueRealityStable(input = {}, deps = {}) {
  const scope = scenarioScope(input);
  const line = String(input.line || input.content || input.claim || "").trim();
  if (!line) return { ok: false, reason: "missing_line", blocked: true };
  if (!scope.companionId) {
    return { ok: false, reason: "missing_companionId", blocked: true };
  }

  const submit =
    typeof deps.submitCandidate === "function" ? deps.submitCandidate : submitCandidate;
  const promote =
    typeof deps.promoteCandidateToStable === "function"
      ? deps.promoteCandidateToStable
      : promoteCandidateToStable;

  // Adapter refuses reality namespace from fiction dialogue (no userExplicitRealityRemember).
  const refused = submitScenarioFictionCandidate(
    {
      ...input,
      claim: line,
      realityNamespace: "reality",
      userExplicitRealityRemember: false,
    },
    { submitCandidate: submit },
  );
  if (refused.ok === false && refused.reason === "fiction_reality_blocked") {
    return {
      ok: false,
      reason: "fiction_reality_blocked",
      blocked: true,
      promoted: false,
    };
  }

  // Defense in depth: even if a shared_fiction candidate exists, promotion to reality Stable is blocked.
  const forced = submit({
    companionId: scope.companionId,
    userId: scope.userId,
    relationshipId: scope.relationshipId,
    claim: line,
    category: "episodic",
    source: "scenario_dialogue",
    status: "pending",
    confidence: 0.95,
    userStated: true,
    realityNamespace: SCENARIO_REALITY_NAMESPACE,
    evidenceRefs: ["scenario:dialogue"],
    idempotencyKey: `scenario-dialogue-block:${scope.companionId}:${line.slice(0, 48)}`,
  });
  if (forced?.ok === false) {
    return { ok: false, reason: forced.reason || "submit_failed", blocked: true, promoted: false };
  }
  const candidateId = forced?.value?.candidateId || forced?.candidate?.candidateId;
  const promoted = candidateId ? promote(candidateId) : { ok: false, reason: "missing_candidate" };
  return {
    ok: false,
    reason: promoted?.reason || "shared_fiction_blocked",
    blocked: true,
    promoted: false,
    promoteResult: promoted,
    candidateId,
  };
}

/**
 * Finale entry for bridge / persistence — one Timeline, optional fiction candidate, no intimacy writeback.
 * @param {object} input
 * @param {{
 *   appendTimeline?: Function,
 *   submitCandidate?: Function,
 *   includeFictionCandidate?: boolean,
 * }} [deps]
 */
export function onScenarioFinale(input = {}, deps = {}) {
  const timeline = emitScenarioFinaleTimeline(input, deps);
  let fictionCandidate = null;
  if (deps.includeFictionCandidate === true || input.includeFictionCandidate === true) {
    fictionCandidate = submitScenarioFictionCandidate(input, deps);
  }
  return {
    ok: timeline.ok !== false,
    timeline,
    fictionCandidate,
    events: timeline.events || [],
    realityNamespace: SCENARIO_REALITY_NAMESPACE,
    allowNumericRelationship: false,
    graphProjectionOnly: (() => {
      try {
        return isFeatureEnabled("contextGraphProjectionOnlyV1") === true;
      } catch {
        return false;
      }
    })(),
  };
}

export async function emitScenarioTimelineEvents(change, scope = {}) {
  return emitScenarioFinaleTimeline({ ...change, ...scope });
}

export async function submitScenarioUnderstandingCandidates(change, scope = {}) {
  return submitScenarioFictionCandidate({ ...change, ...scope });
}

export function ensureScenarioAdapterRegistered() {
  if (registered) return scenarioFeatureMemoryAdapter;
  registerFeatureMemoryAdapter(SCENARIO_ADAPTER_FEATURE_ID, scenarioFeatureMemoryAdapter);
  registered = true;
  return scenarioFeatureMemoryAdapter;
}

export function __resetScenarioAdapterRegistrationForTests() {
  registered = false;
}

export const scenarioFeatureMemoryAdapter = createFeatureMemoryAdapter({
  featureId: SCENARIO_ADAPTER_FEATURE_ID,
  getSourceRef: (change) => getScenarioFinaleSourceRef(change),
  emitTimelineEvents: (change, scope) => emitScenarioTimelineEvents(change, scope),
  submitUnderstandingCandidates: (change, scope) =>
    submitScenarioUnderstandingCandidates(change, scope),
  buildIndexDocuments: async () => ({ ok: true, documents: [], stub: true }),
  handleSourceTombstone: async () => ({ ok: true, skipped: true }),
  rebuildForSource: async () => ({ ok: true, skipped: true }),
  onSave: (change, scope, opts) => onScenarioFinale({ ...change, ...scope, ...opts }),
});
