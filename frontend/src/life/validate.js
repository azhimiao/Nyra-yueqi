/**
 * Life ledger validators — repair soft issues, reject unrecoverable packs.
 */

import {
  DAY_PACK_MIN,
  EVIDENCE_APPS,
  LIFE_EVENT_SOURCES,
  LIFE_SCHEMA_VERSION,
  LIFE_VISIBILITY,
  OBSERVATION_REACTION,
  dayPackId,
  isValidIsoTime,
  isValidLocalDate,
  localDateFromIso,
} from "./schema.js";

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, value: object|null, reason?: string, repaired?: boolean }}
 */
export function validateLifeEvent(raw, { characterId = "" } = {}) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, value: null, reason: "not_object" };
  }
  const src = /** @type {Record<string, unknown>} */ (raw);
  const id = String(src.id || "").trim();
  if (!id) return { ok: false, value: null, reason: "missing_id" };

  const cid = String(src.characterId || characterId || "").trim();
  if (!cid) return { ok: false, value: null, reason: "missing_characterId" };

  const occurredAt = String(src.occurredAt || "").trim();
  if (!isValidIsoTime(occurredAt)) {
    return { ok: false, value: null, reason: "bad_occurredAt" };
  }

  const visibility = String(src.visibility || "private");
  const source = String(src.source || "seed");
  const participantsIn = Array.isArray(src.participants) ? src.participants : [];
  const participants = [];
  for (const row of participantsIn) {
    if (!row || typeof row !== "object") continue;
    const p = /** @type {Record<string, unknown>} */ (row);
    const pid = String(p.id || "").trim();
    if (!pid) continue;
    participants.push({
      id: pid,
      name: String(p.name || "").slice(0, 40),
      relation: String(p.relation || "").slice(0, 24),
    });
  }

  return {
    ok: true,
    repaired: !src.schemaVersion || Number(src.schemaVersion) !== LIFE_SCHEMA_VERSION,
    value: {
      id,
      schemaVersion: LIFE_SCHEMA_VERSION,
      characterId: cid,
      occurredAt,
      durationMinutes: Math.max(0, Math.min(24 * 60, Number(src.durationMinutes) || 0)),
      type: String(src.type || "note").slice(0, 40),
      summary: String(src.summary || "").trim().slice(0, 280),
      participants,
      location: String(src.location || "").slice(0, 80),
      emotionBefore: String(src.emotionBefore || "").slice(0, 40),
      emotionAfter: String(src.emotionAfter || "").slice(0, 40),
      privateFacts: Array.isArray(src.privateFacts)
        ? src.privateFacts.map((f) => String(f).slice(0, 200)).filter(Boolean).slice(0, 20)
        : [],
      memoryRefs: Array.isArray(src.memoryRefs)
        ? src.memoryRefs.map(String).filter(Boolean).slice(0, 20)
        : [],
      relatedEventIds: Array.isArray(src.relatedEventIds)
        ? src.relatedEventIds.map(String).filter(Boolean).slice(0, 20)
        : [],
      evidenceIds: Array.isArray(src.evidenceIds)
        ? src.evidenceIds.map(String).filter(Boolean).slice(0, 40)
        : [],
      visibility: LIFE_VISIBILITY.includes(visibility) ? visibility : "private",
      source: LIFE_EVENT_SOURCES.includes(source) ? source : "seed",
    },
  };
}

/**
 * @param {unknown} raw
 */
export function validateEvidenceItem(raw, { characterId = "", knownEventIds = null } = {}) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, value: null, reason: "not_object" };
  }
  const src = /** @type {Record<string, unknown>} */ (raw);
  const id = String(src.id || "").trim();
  if (!id) return { ok: false, value: null, reason: "missing_id" };

  const eventId = String(src.eventId || "").trim();
  if (!eventId) return { ok: false, value: null, reason: "missing_eventId" };
  if (knownEventIds instanceof Set && !knownEventIds.has(eventId)) {
    return { ok: false, value: null, reason: "unknown_eventId" };
  }

  const app = String(src.app || "").trim();
  if (!EVIDENCE_APPS.includes(app)) {
    return { ok: false, value: null, reason: "bad_app" };
  }

  const occurredAt = String(src.occurredAt || "").trim();
  if (!isValidIsoTime(occurredAt)) {
    return { ok: false, value: null, reason: "bad_occurredAt" };
  }

  // Cross-character leakage guard: optional characterId on evidence must match pack.
  if (src.characterId != null && String(src.characterId).trim()) {
    const ecid = String(src.characterId).trim();
    if (characterId && ecid !== characterId) {
      return { ok: false, value: null, reason: "cross_character" };
    }
  }

  const crossRefs = Array.isArray(src.crossRefs)
    ? [...new Set(src.crossRefs.map(String).filter(Boolean))].slice(0, 20)
    : [];

  return {
    ok: true,
    value: {
      id,
      eventId,
      app,
      kind: String(src.kind || "item").slice(0, 40),
      occurredAt,
      title: String(src.title || "").slice(0, 80),
      content: String(src.content || "").slice(0, 800),
      assetRef: src.assetRef == null ? null : String(src.assetRef).slice(0, 200),
      counterpart: src.counterpart == null ? null : String(src.counterpart).slice(0, 40),
      crossRefs,
      discoverable: src.discoverable !== false,
    },
  };
}

/**
 * Detect cycles in evidence crossRefs graph (evidence id → evidence id).
 * @param {Array<{ id: string, crossRefs: string[] }>} evidence
 */
export function findCrossRefCycles(evidence) {
  const graph = new Map();
  for (const item of evidence) {
    graph.set(item.id, (item.crossRefs || []).filter((id) => graph.has(id) || true));
  }
  // Rebuild with only known ids
  for (const item of evidence) {
    graph.set(
      item.id,
      (item.crossRefs || []).filter((ref) => evidence.some((e) => e.id === ref)),
    );
  }

  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function dfs(node) {
    if (visiting.has(node)) {
      const idx = stack.indexOf(node);
      cycles.push(stack.slice(idx).concat(node));
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) || []) {
      dfs(next);
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }

  for (const id of graph.keys()) dfs(id);
  return cycles;
}

/**
 * Strip cyclic crossRefs (keep first edge that would close a cycle).
 * @param {Array<{ id: string, crossRefs: string[] }>} evidence
 */
export function breakCrossRefCycles(evidence) {
  const cycles = findCrossRefCycles(evidence);
  if (!cycles.length) return { evidence, broken: [] };
  const broken = [];
  const byId = new Map(evidence.map((e) => [e.id, { ...e, crossRefs: [...(e.crossRefs || [])] }]));
  for (const cycle of cycles) {
    // Remove last→first edge
    if (cycle.length < 2) continue;
    const from = cycle[cycle.length - 2];
    const to = cycle[cycle.length - 1] === cycle[0] ? cycle[0] : cycle[cycle.length - 1];
    const node = byId.get(from);
    if (!node) continue;
    const before = node.crossRefs.length;
    node.crossRefs = node.crossRefs.filter((r) => r !== to);
    if (node.crossRefs.length < before) {
      broken.push(`${from}->${to}`);
    }
  }
  return { evidence: [...byId.values()], broken };
}

/**
 * Semantic consistency: times on same localDate, locations/participants aligned per event.
 * @param {object} pack
 */
export function checkDayPackConsistency(pack) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  const localDate = String(pack.localDate || "");
  const events = Array.isArray(pack.events) ? pack.events : [];
  const evidence = Array.isArray(pack.evidence) ? pack.evidence : [];
  const eventById = new Map(events.map((e) => [e.id, e]));

  const eventIds = new Set();
  for (const ev of events) {
    if (eventIds.has(ev.id)) errors.push(`duplicate_event_id:${ev.id}`);
    eventIds.add(ev.id);
    if (pack.characterId && ev.characterId !== pack.characterId) {
      errors.push(`cross_character_event:${ev.id}`);
    }
    const d = localDateFromIso(ev.occurredAt);
    if (localDate && d && d !== localDate) {
      errors.push(`event_date_mismatch:${ev.id}:${d}`);
    }
  }

  const evidenceIds = new Set();
  for (const item of evidence) {
    if (evidenceIds.has(item.id)) errors.push(`duplicate_evidence_id:${item.id}`);
    evidenceIds.add(item.id);
    const parent = eventById.get(item.eventId);
    if (!parent) {
      errors.push(`orphan_evidence:${item.id}`);
      continue;
    }
    const d = localDateFromIso(item.occurredAt);
    if (localDate && d && d !== localDate) {
      errors.push(`evidence_date_mismatch:${item.id}:${d}`);
    }
    // Time should be within event day window (± duration)
    const evT = Date.parse(parent.occurredAt);
    const itT = Date.parse(item.occurredAt);
    if (Number.isFinite(evT) && Number.isFinite(itT)) {
      const span = Math.max(60, (Number(parent.durationMinutes) || 60) * 60_000);
      if (Math.abs(itT - evT) > span * 3) {
        warnings.push(`evidence_time_skew:${item.id}`);
      }
    }
    for (const ref of item.crossRefs || []) {
      if (!evidenceIds.has(ref) && !evidence.some((e) => e.id === ref)) {
        // may not have seen all yet — check after loop
      }
    }
  }

  for (const item of evidence) {
    for (const ref of item.crossRefs || []) {
      if (!evidenceIds.has(ref)) errors.push(`dangling_crossRef:${item.id}->${ref}`);
      if (ref === item.id) errors.push(`self_crossRef:${item.id}`);
    }
  }

  const cycles = findCrossRefCycles(evidence);
  if (cycles.length) {
    errors.push(`cyclic_crossRef:${cycles.length}`);
  }

  // Per-event participant name consistency across linked evidence counterparts
  for (const ev of events) {
    const names = new Set(
      (ev.participants || []).map((p) => String(p.name || "").trim()).filter(Boolean),
    );
    const locs = new Set([String(ev.location || "").trim()].filter(Boolean));
    for (const item of evidence.filter((e) => e.eventId === ev.id)) {
      if (item.counterpart) names.add(String(item.counterpart).trim());
    }
    if (names.size > 6) warnings.push(`many_names:${ev.id}`);
    if (locs.size > 1) {
      /* single event location is authoritative */
    }
  }

  return { errors, warnings };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, value: object|null, reason?: string, repaired?: boolean }}
 */
export function validateDayPack(raw, { characterId = "", repairCycles = true } = {}) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, value: null, reason: "not_object" };
  }
  const src = /** @type {Record<string, unknown>} */ (raw);
  const cid = String(src.characterId || characterId || "").trim();
  if (!cid) return { ok: false, value: null, reason: "missing_characterId" };

  const localDate = String(src.localDate || "").trim();
  if (!isValidLocalDate(localDate)) {
    return { ok: false, value: null, reason: "bad_localDate" };
  }

  const eventsIn = Array.isArray(src.events) ? src.events : [];
  const events = [];
  const eventIds = new Set();
  for (const row of eventsIn) {
    const r = validateLifeEvent(row, { characterId: cid });
    if (!r.ok || !r.value) continue;
    if (eventIds.has(r.value.id)) {
      return { ok: false, value: null, reason: `duplicate_event_id:${r.value.id}` };
    }
    if (r.value.characterId !== cid) {
      return { ok: false, value: null, reason: `cross_character_event:${r.value.id}` };
    }
    eventIds.add(r.value.id);
    events.push(r.value);
  }

  if (!events.length) {
    return { ok: false, value: null, reason: "no_events" };
  }

  let evidenceIn = Array.isArray(src.evidence) ? src.evidence : [];
  const evidence = [];
  const evidenceIds = new Set();
  for (const row of evidenceIn) {
    const r = validateEvidenceItem(row, { characterId: cid, knownEventIds: eventIds });
    if (!r.ok || !r.value) {
      if (r.reason === "cross_character") {
        return { ok: false, value: null, reason: "cross_character_evidence" };
      }
      if (r.reason === "bad_occurredAt") {
        return { ok: false, value: null, reason: "bad_evidence_time" };
      }
      continue; // soft drop other bad items
    }
    if (evidenceIds.has(r.value.id)) {
      return { ok: false, value: null, reason: `duplicate_evidence_id:${r.value.id}` };
    }
    evidenceIds.add(r.value.id);
    evidence.push(r.value);
  }

  let repaired = false;
  let workingEvidence = evidence;
  const cycleHit = findCrossRefCycles(workingEvidence);
  if (cycleHit.length) {
    if (!repairCycles) {
      return { ok: false, value: null, reason: "cyclic_crossRef" };
    }
    const broken = breakCrossRefCycles(workingEvidence);
    workingEvidence = broken.evidence;
    repaired = true;
  }

  // Sync evidenceIds on events
  for (const ev of events) {
    ev.evidenceIds = workingEvidence.filter((e) => e.eventId === ev.id).map((e) => e.id);
  }

  const consistency = checkDayPackConsistency({
    characterId: cid,
    localDate,
    events,
    evidence: workingEvidence,
  });

  // Hard reject remaining cross-character / date / duplicate errors after repair
  const hard = consistency.errors.filter(
    (e) =>
      e.startsWith("cross_character") ||
      e.startsWith("event_date_mismatch") ||
      e.startsWith("evidence_date_mismatch") ||
      e.startsWith("duplicate_"),
  );
  if (hard.length) {
    return { ok: false, value: null, reason: hard[0] };
  }

  // Drop dangling crossRefs rather than reject whole pack
  for (const item of workingEvidence) {
    const before = item.crossRefs.length;
    item.crossRefs = item.crossRefs.filter((ref) => evidenceIds.has(ref) && ref !== item.id);
    if (item.crossRefs.length < before) repaired = true;
  }

  const finalConsistency = checkDayPackConsistency({
    characterId: cid,
    localDate,
    events,
    evidence: workingEvidence,
  });

  const appSummary =
    src.appSummary && typeof src.appSummary === "object"
      ? /** @type {Record<string, unknown>} */ (src.appSummary)
      : {};

  const summary = {};
  for (const app of EVIDENCE_APPS) {
    const items = workingEvidence.filter((e) => e.app === app);
    const fromSrc = appSummary[app] && typeof appSummary[app] === "object"
      ? /** @type {Record<string, unknown>} */ (appSummary[app])
      : {};
    summary[app] = {
      count: items.length,
      headline: String(fromSrc.headline || items[0]?.title || "").slice(0, 80),
    };
  }

  const id = String(src.id || dayPackId(cid, localDate)).trim() || dayPackId(cid, localDate);
  const source = String(src.source || "seed");

  return {
    ok: true,
    repaired,
    value: {
      id,
      schemaVersion: LIFE_SCHEMA_VERSION,
      characterId: cid,
      localDate,
      theme: String(src.theme || "").slice(0, 120),
      generatedAt: isValidIsoTime(src.generatedAt)
        ? String(src.generatedAt)
        : new Date().toISOString(),
      source: [...LIFE_EVENT_SOURCES, "legacy"].includes(source) ? source : "seed",
      events,
      evidence: workingEvidence,
      appSummary: summary,
      consistency: {
        checkedAt: isValidIsoTime(src.consistency?.checkedAt)
          ? String(src.consistency.checkedAt)
          : new Date().toISOString(),
        errors: finalConsistency.errors,
        warnings: finalConsistency.warnings,
      },
    },
  };
}

/**
 * Scale gate for product DayPacks (seed / model).
 * @param {object} pack
 */
export function meetsDayPackScale(pack) {
  const events = Array.isArray(pack?.events) ? pack.events.length : 0;
  const evidence = Array.isArray(pack?.evidence) ? pack.evidence : [];
  let cross = 0;
  for (const item of evidence) {
    cross += Array.isArray(item.crossRefs) ? item.crossRefs.length : 0;
  }
  return {
    ok:
      events >= DAY_PACK_MIN.events &&
      evidence.length >= DAY_PACK_MIN.evidence &&
      cross >= DAY_PACK_MIN.crossRefs,
    events,
    evidence: evidence.length,
    crossRefs: cross,
  };
}

/**
 * @param {unknown} raw
 */
export function validateObservation(raw, { characterId = "" } = {}) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, value: null, reason: "not_object" };
  }
  const src = /** @type {Record<string, unknown>} */ (raw);
  const id = String(src.id || "").trim();
  if (!id) return { ok: false, value: null, reason: "missing_id" };
  const cid = String(src.characterId || characterId || "").trim();
  if (!cid) return { ok: false, value: null, reason: "missing_characterId" };
  const evidenceId = String(src.evidenceId || "").trim();
  if (!evidenceId) return { ok: false, value: null, reason: "missing_evidenceId" };
  const observedAt = String(src.observedAt || "").trim();
  if (!isValidIsoTime(observedAt)) {
    return { ok: false, value: null, reason: "bad_observedAt" };
  }
  const reactionState = String(src.reactionState || "unseen");
  return {
    ok: true,
    value: {
      id,
      characterId: cid,
      dayPackId: String(src.dayPackId || "").trim(),
      evidenceId,
      observedAt,
      dwellMs: Math.max(0, Number(src.dwellMs) || 0),
      reactionState: OBSERVATION_REACTION.includes(reactionState) ? reactionState : "unseen",
    },
  };
}
