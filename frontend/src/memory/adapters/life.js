/**
 * Life FeatureMemoryAdapter — shared / discoverable / private projection rules.
 * privateFacts never enter Palace, KG, or prompt injection helpers.
 */

import { createSourceRefV1 } from "../../contracts/source-ref-v1.js";
import { mintId } from "../../contracts/ids.js";
import { isFeatureEnabled } from "../../features/flags.js";
import { appendTimelineEvent } from "../../timeline/repository.js";
import { freezeCompanionScope, relationshipIdFor } from "../companion-scope.js";
import { createFeatureMemoryAdapter } from "./contract.js";
import { registerFeatureMemoryAdapter } from "./registry.js";

export const LIFE_ADAPTER_FEATURE_ID = "life";
export const LIFE_SHARE_CLASSES = Object.freeze(["shared", "discoverable", "private"]);

let registered = false;

/**
 * @returns {boolean}
 */
export function isLifeAdapterEnabled() {
  try {
    return isFeatureEnabled("unifiedMemoryAdaptersV1") === true;
  } catch {
    return false;
  }
}

function lifeScope(input = {}, scope = {}) {
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
 * Classify a life event / fact / evidence into shared | discoverable | private.
 * @param {object} item
 * @returns {"shared"|"discoverable"|"private"}
 */
export function classifyLifeShareClass(item = {}) {
  if (!item || typeof item !== "object") return "private";

  // Explicit privateFacts payloads are never shareable as palace/KG text.
  if (item.isPrivateFact === true || item.factKind === "privateFact") {
    return "private";
  }
  if (item.privateFact === true) return "private";

  const visibility = String(item.visibility || item.shareClass || "").trim();
  if (visibility === "private") return "private";
  if (visibility === "discoverable") return "discoverable";
  if (visibility === "shared") return "shared";

  // Evidence items use discoverable boolean
  if (Object.prototype.hasOwnProperty.call(item, "discoverable")) {
    return item.discoverable === false ? "private" : "discoverable";
  }

  // Bare privateFacts string / array → private
  if (typeof item.privateFacts !== "undefined" && !visibility) {
    return "private";
  }

  return "private";
}

/**
 * Gate for Palace / KG / prompt injection — privateFacts and private class fail closed.
 *
 * @param {object|string} fact
 * @param {{
 *   observed?: boolean,
 *   observedIds?: Set<string>|string[],
 *   evidenceId?: string,
 *   allowDiscoverableUnobserved?: boolean,
 * }} [opts]
 * @returns {{ ok: boolean, reason?: string, shareClass?: string, text?: string }}
 */
export function assertLifeFactShareable(fact, opts = {}) {
  if (fact == null) {
    return { ok: false, reason: "empty_fact", shareClass: "private" };
  }

  /** @type {object} */
  let row;
  if (typeof fact === "string") {
    row = { text: fact, isPrivateFact: true, visibility: "private" };
  } else if (typeof fact === "object") {
    row = fact;
  } else {
    return { ok: false, reason: "invalid_fact", shareClass: "private" };
  }

  // Explicit privateFacts array membership or flag
  if (
    row.isPrivateFact === true
    || row.factKind === "privateFact"
    || row.privateFact === true
    || row.sourceField === "privateFacts"
  ) {
    return {
      ok: false,
      reason: "private_fact_blocked",
      shareClass: "private",
      text: String(row.text || row.content || row.summary || row.fact || "").trim(),
    };
  }

  const shareClass = classifyLifeShareClass(row);
  const text = String(
    row.text || row.content || row.summary || row.fact || row.title || "",
  ).trim();

  if (shareClass === "private") {
    return { ok: false, reason: "private_visibility", shareClass, text };
  }

  if (shareClass === "discoverable") {
    if (opts.allowDiscoverableUnobserved === true) {
      return { ok: true, shareClass, text };
    }
    const evidenceId = String(opts.evidenceId || row.id || row.evidenceId || "").trim();
    let observed = opts.observed === true;
    if (!observed && opts.observedIds) {
      const set = opts.observedIds instanceof Set
        ? opts.observedIds
        : new Set([...(opts.observedIds || [])].map(String));
      observed = evidenceId ? set.has(evidenceId) : false;
    }
    if (!observed) {
      return {
        ok: false,
        reason: "discoverable_unobserved",
        shareClass,
        text,
      };
    }
  }

  if (!text) {
    return { ok: false, reason: "empty_text", shareClass };
  }

  return { ok: true, shareClass, text };
}

/**
 * Prompt bag helper — shared summaries + observed discoverable only; never privateFacts.
 *
 * @param {{
 *   characterId?: string,
 *   pack?: object|null,
 *   observedIds?: Set<string>|string[],
 *   maxLines?: number,
 * }} opts
 * @returns {{ lines: string[], facts: object[], blocked: object[] }}
 */
export function buildLifePromptBag(opts = {}) {
  const pack = opts.pack && typeof opts.pack === "object" ? opts.pack : null;
  const maxLines = Math.max(1, Number(opts.maxLines) || 8);
  const observedIds = opts.observedIds instanceof Set
    ? opts.observedIds
    : new Set([...(opts.observedIds || [])].map(String));

  /** @type {string[]} */
  const lines = [];
  /** @type {object[]} */
  const facts = [];
  /** @type {object[]} */
  const blocked = [];

  if (!pack) return { lines, facts, blocked };

  for (const ev of pack.events || []) {
    if (lines.length >= maxLines) break;
    const shareClass = classifyLifeShareClass(ev);

    // privateFacts never enter the bag (even on shared events)
    for (const pf of ev.privateFacts || []) {
      const gate = assertLifeFactShareable(
        { text: pf, isPrivateFact: true, visibility: "private" },
        { observedIds },
      );
      if (!gate.ok) blocked.push({ kind: "privateFact", eventId: ev.id, ...gate });
    }

    if (shareClass === "private") {
      blocked.push({
        kind: "event",
        eventId: ev.id,
        reason: "private_visibility",
        shareClass,
      });
      continue;
    }

    if (shareClass === "discoverable") {
      const linked = (ev.evidenceIds || []).some((id) => observedIds.has(String(id)));
      const gate = assertLifeFactShareable(
        { ...ev, visibility: "discoverable" },
        { observed: linked, observedIds },
      );
      if (!gate.ok) {
        blocked.push({ kind: "event", eventId: ev.id, ...gate });
        continue;
      }
    }

    const when = String(ev.occurredAt || "").slice(0, 16).replace("T", " ");
    const line = `- [${when}] ${ev.summary}`;
    lines.push(line);
    facts.push({
      eventId: ev.id,
      shareClass: shareClass === "discoverable" ? "discoverable" : "shared",
      summary: ev.summary,
      text: String(ev.summary || ""),
    });
  }

  for (const item of pack.evidence || []) {
    if (lines.length >= maxLines) break;
    const gate = assertLifeFactShareable(
      {
        ...item,
        visibility: item.discoverable === false ? "private" : "discoverable",
        text: item.content || item.title,
      },
      {
        evidenceId: item.id,
        observedIds,
        observed: observedIds.has(String(item.id)),
      },
    );
    if (!gate.ok) {
      blocked.push({ kind: "evidence", evidenceId: item.id, ...gate });
      continue;
    }
    const line = `- 用户看过「${item.title}」：${String(item.content || "").slice(0, 40)}`;
    lines.push(line);
    facts.push({
      evidenceId: item.id,
      shareClass: "discoverable",
      summary: item.title,
      text: gate.text,
    });
  }

  return { lines, facts, blocked };
}

/**
 * Palace / fileDrawer / KG gate — rejects privateFacts.
 * @param {object} fact
 * @param {{ fileDrawer?: Function, extractKg?: Function }} [deps]
 */
export async function projectLifeFactToPalace(fact = {}, deps = {}) {
  const gate = assertLifeFactShareable(fact, {
    observed: fact.observed === true,
    observedIds: fact.observedIds,
    evidenceId: fact.evidenceId || fact.id,
  });
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, shareClass: gate.shareClass, filed: false, kg: false };
  }

  let drawer = null;
  if (typeof deps.fileDrawer === "function") {
    const sourceRef = fact.sourceRef || null;
    drawer = await deps.fileDrawer({
      rawText: gate.text,
      source: "life_adapter",
      title: String(fact.title || fact.summary || "").slice(0, 80),
      sourceRef,
      projectionKind: sourceRef ? "palace_text" : undefined,
      allowProjectionWrite: Boolean(sourceRef) || fact.allowProjectionWrite === true,
      companionId: fact.companionId || fact.characterId,
      characterId: fact.companionId || fact.characterId,
      authority: "projection",
    });
  }
  let kg = null;
  if (typeof deps.extractKg === "function") {
    kg = await deps.extractKg(gate.text, drawer?.drawerId || drawer?.id || "");
  }
  return {
    ok: true,
    shareClass: gate.shareClass,
    filed: Boolean(drawer),
    kg: kg != null,
    drawer,
    kgResult: kg,
  };
}

/**
 * @param {object} event
 */
export function getLifeEventSourceRef(event = {}, meta = {}) {
  const scope = lifeScope(event, meta.scope || {});
  const sourceId = String(event.id || event.eventId || event.sourceId || "").trim();
  if (!sourceId || !scope.companionId) return null;
  const shareClass = classifyLifeShareClass(event);
  const sourceVersion = Number(meta.sourceVersion || event.sourceVersion || 1) || 1;
  return createSourceRefV1({
    sourceType: "life_event",
    sourceId,
    sourceVersion,
    companionId: scope.companionId,
    relationshipId: scope.relationshipId,
    userId: scope.userId,
    realityNamespace: String(event.realityNamespace || "reality"),
    occurredAt: String(event.occurredAt || event.updatedAt || new Date().toISOString()),
    visibility: shareClass === "shared" ? "shared" : "private",
    contentHash:
      String(event.contentHash || "").trim()
      || `life:${sourceId}:v${sourceVersion}:${shareClass}`,
  });
}

/**
 * Only meaningful shared life events project to Timeline (not whole DayPack).
 */
export function emitLifeSharedTimeline(event = {}, deps = {}) {
  const shareClass = classifyLifeShareClass(event);
  if (shareClass !== "shared") {
    return { ok: false, reason: "not_shared", shareClass, events: [] };
  }
  // Strip privateFacts from any projection payload
  for (const pf of event.privateFacts || []) {
    const gate = assertLifeFactShareable({
      text: pf,
      isPrivateFact: true,
      visibility: "private",
    });
    if (!gate.ok) {
      /* expected — never timeline privateFacts */
    }
  }

  const scope = lifeScope(event);
  if (!scope.companionId) return { ok: false, reason: "missing_companionId", events: [] };
  const sourceRef = getLifeEventSourceRef(event);
  const append =
    typeof deps.appendTimeline === "function" ? deps.appendTimeline : appendTimelineEvent;
  const idempotencyKey =
    String(event.idempotencyKey || "").trim()
    || `life-shared:${sourceRef?.sourceId || event.id}:timeline`;

  const result = append({
    eventId: mintId("eventId", "life"),
    eventType: "life.shared",
    source: "life_adapter",
    sourceId: sourceRef?.sourceId || String(event.id || ""),
    idempotencyKey,
    actor: scope.companionId,
    principal: scope.userId,
    companionId: scope.companionId,
    userId: scope.userId,
    relationshipId: scope.relationshipId,
    realityNamespace: "reality",
    occurredAt: sourceRef?.occurredAt || new Date().toISOString(),
    visibility: "shared",
    payload: {
      summary: String(event.summary || "").slice(0, 240),
      shareClass: "shared",
      // never include privateFacts
      sourceRef,
    },
    evidenceRefs: sourceRef
      ? [`life:${sourceRef.sourceId}:v${sourceRef.sourceVersion}`]
      : [],
  });

  return {
    ok: result?.ok !== false,
    events: result?.ok !== false && result?.value ? [result.value] : [],
    result,
  };
}

export async function emitLifeTimelineEvents(change, scope = {}) {
  return emitLifeSharedTimeline({ ...change, ...scope });
}

export async function buildLifeIndexDocuments(change, scope = {}, deps = {}) {
  // privateFacts / private class never become index documents
  if (Array.isArray(change?.privateFacts) && change.privateFacts.length) {
    for (const pf of change.privateFacts) {
      const gate = assertLifeFactShareable({
        text: pf,
        isPrivateFact: true,
        sourceField: "privateFacts",
      });
      if (!gate.ok) {
        return { ok: false, reason: gate.reason, documents: [] };
      }
    }
  }
  const gate = assertLifeFactShareable(
    { ...change, ...scope, text: change?.summary || change?.content },
    {
      observed: change?.observed === true,
      observedIds: change?.observedIds,
      evidenceId: change?.evidenceId || change?.id,
    },
  );
  if (!gate.ok) return { ok: false, reason: gate.reason, documents: [] };
  const projected = await projectLifeFactToPalace(
    { ...change, ...scope, text: gate.text },
    deps,
  );
  return {
    ok: projected.ok !== false,
    documents: projected.ok ? [{ text: gate.text, shareClass: gate.shareClass }] : [],
    projected,
  };
}

export function ensureLifeAdapterRegistered() {
  if (registered) return lifeFeatureMemoryAdapter;
  registerFeatureMemoryAdapter(LIFE_ADAPTER_FEATURE_ID, lifeFeatureMemoryAdapter);
  registered = true;
  return lifeFeatureMemoryAdapter;
}

export function __resetLifeAdapterRegistrationForTests() {
  registered = false;
}

export const lifeFeatureMemoryAdapter = createFeatureMemoryAdapter({
  featureId: LIFE_ADAPTER_FEATURE_ID,
  getSourceRef: (change) => getLifeEventSourceRef(change),
  emitTimelineEvents: (change, scope) => emitLifeTimelineEvents(change, scope),
  submitUnderstandingCandidates: async () => ({ ok: true, candidates: [], stub: true }),
  buildIndexDocuments: (change, scope) => buildLifeIndexDocuments(change, scope),
  handleSourceTombstone: async () => ({ ok: true, skipped: true }),
  rebuildForSource: async () => ({ ok: true, skipped: true }),
});
