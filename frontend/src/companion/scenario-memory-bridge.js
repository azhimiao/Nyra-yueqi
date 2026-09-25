/**
 * Scenario finale → Pop-visible shared memory (not raw theater turns).
 * Idempotent by `scenario-finale:{runId}`; feeds context graph + life confluence consumers.
 *
 * M5: when unifiedMemoryAdaptersV1 OR contextGraphProjectionOnlyV1 is on, route through
 * the scenario FeatureMemoryAdapter — one shared_fiction Timeline finale, no ordinary
 * intimacy writeback, fiction graph stays shared_fiction, never reality Stable.
 */

import { ingestCandidate } from "../context/pipeline.js";
import { listItems } from "../context/store.js";
import { isFeatureEnabled } from "../features/flags.js";
import { findSharedByRunId, listSharedLifeSummaries } from "../life/confluence.js";
import {
  ensureScenarioAdapterRegistered,
  isScenarioAdapterPathEnabled,
  onScenarioFinale,
  SCENARIO_REALITY_NAMESPACE,
} from "../memory/adapters/scenario.js";
import { subscribeAppEvent } from "../world/app-events.js";
import { planRelationship, detectImportantEvent } from "./relationship-planner.js";
import { isAutonomyCapabilityEnabled } from "./autonomy-prefs.js";
import { appendActivity } from "./activity-log.js";

export const SCENARIO_MEMORY_STORE_KEY = "yueqi.companion.scenario-memory.v1";
export const SCENARIO_FINALE_IDEMPOTENT_PREFIX = "scenario-finale:";

/** @type {object|null} */
let testBag = null;

/** @type {(() => void)|null} */
let eventUnbind = null;

export function __setScenarioMemoryBagForTests(bag) {
  testBag = bag && typeof bag === "object" ? bag : null;
}

export function __clearScenarioMemoryForTests() {
  testBag = null;
  eventUnbind?.();
  eventUnbind = null;
  try {
    globalThis?.localStorage?.removeItem(SCENARIO_MEMORY_STORE_KEY);
  } catch {
    /* ignore */
  }
}

function readBag() {
  if (testBag) return testBag;
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) {
      const parsed = JSON.parse(
        globalThis.localStorage.getItem(SCENARIO_MEMORY_STORE_KEY) || "{}",
      );
      return parsed && typeof parsed === "object" ? parsed : { committed: {} };
    }
  } catch {
    /* ignore */
  }
  return { committed: {} };
}

function writeBag(bag) {
  const next = { committed: {}, ...(bag && typeof bag === "object" ? bag : {}) };
  if (testBag) {
    Object.keys(testBag).forEach((k) => delete testBag[k]);
    Object.assign(testBag, next);
    return;
  }
  try {
    globalThis?.localStorage?.setItem(SCENARIO_MEMORY_STORE_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}

export function scenarioFinaleIdempotentKey(runId) {
  return `${SCENARIO_FINALE_IDEMPOTENT_PREFIX}${String(runId || "").trim()}`;
}

/**
 * @param {object} runOrState — run.directorState or flat state
 */
export function deriveRelationshipDeltaFromRun(runOrState = {}) {
  const ds = runOrState?.directorState || runOrState || {};
  const intimacy = Number(ds.intimacy) || 0;
  const trust = Number(ds.trust) || 0;
  const tension = Number(ds.tension) || 0;
  return {
    intimacyDelta: Math.min(0.25, 0.05 + intimacy * 0.04),
    trustDelta: Math.min(0.2, 0.03 + trust * 0.035),
    tensionDelta: tension >= 2 ? 0.05 : -0.03,
    kind: "shared_experience",
  };
}

/**
 * @param {string} summary
 * @param {string} [memoryCandidate]
 */
export function deriveImportantFactCandidates(summary = "", memoryCandidate = "") {
  const facts = [];
  const seen = new Set();
  const add = (text) => {
    const t = String(text || "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    facts.push(t);
  };
  add(memoryCandidate);
  const s = String(summary || "").trim();
  if (/喜欢|偏好|约定|记住|答应|纪念|秘密|雨|车站|屋顶/.test(s)) {
    add(s.slice(0, 120));
  }
  return facts.slice(0, 4);
}

function formatExperienceSummaryForMemory(record) {
  const title = String(record.scriptTitle || "情景剧").trim();
  const body = String(record.narrativeSummary || "").trim();
  return `共同经历《${title}》：${body}`.slice(0, 480);
}

/**
 * Durable 经历摘要 for companion / Pop consumers.
 * @param {{
 *   runId: string,
 *   scriptId?: string,
 *   scriptTitle?: string,
 *   summary?: string,
 *   characterId?: string,
 *   diaryId?: string,
 *   eventId?: string,
 *   memoryCandidate?: string,
 *   directorState?: object,
 * }} input
 */
export function buildScenarioExperienceRecord(input = {}) {
  const runId = String(input.runId || "").trim();
  const narrativeSummary = String(input.summary || "").trim();
  const characterId = String(input.characterId || "").trim();
  const idempotentKey = scenarioFinaleIdempotentKey(runId);
  const relationshipDeltaCandidates = [
    deriveRelationshipDeltaFromRun({ directorState: input.directorState || {} }),
  ];
  const importantFactCandidates = deriveImportantFactCandidates(
    narrativeSummary,
    input.memoryCandidate,
  );
  return {
    id: `scenario-experience:${runId}`,
    idempotentKey,
    runId,
    scriptId: String(input.scriptId || "").trim(),
    scriptTitle: String(input.scriptTitle || "").trim(),
    characterId,
    narrativeSummary,
    relationshipDeltaCandidates,
    importantFactCandidates,
    diaryId: String(input.diaryId || "").trim(),
    eventId: String(input.eventId || "").trim(),
    committedAt: new Date().toISOString(),
  };
}

export function getCommittedScenarioExperience(runId) {
  const key = scenarioFinaleIdempotentKey(runId);
  const bag = readBag();
  return bag.committed?.[key] || null;
}

function adapterPathEnabled() {
  try {
    return isScenarioAdapterPathEnabled() || isFeatureEnabled("unifiedMemoryAdaptersV1") === true
      || isFeatureEnabled("contextGraphProjectionOnlyV1") === true;
  } catch {
    return false;
  }
}

function graphProjectionOnly() {
  try {
    return isFeatureEnabled("contextGraphProjectionOnlyV1") === true;
  } catch {
    return false;
  }
}

/**
 * Fiction graph candidate fields — always shared_fiction namespace.
 */
function fictionGraphCandidate(base = {}) {
  return {
    ...base,
    realityNamespace: SCENARIO_REALITY_NAMESPACE,
    namespace: SCENARIO_REALITY_NAMESPACE,
    meta: {
      ...(base.meta && typeof base.meta === "object" ? base.meta : {}),
      realityNamespace: SCENARIO_REALITY_NAMESPACE,
      fiction: true,
      allowNumericRelationship: false,
    },
    tags: Array.from(
      new Set([...(Array.isArray(base.tags) ? base.tags : []), "shared_fiction", "cp12"]),
    ),
  };
}

/**
 * Idempotent write into companion context graph (+ optional relationship plan).
 * Does not append scenario dialogue to Pop IM history.
 *
 * M5 adapter path: one Timeline finale via scenario adapter; no ordinary intimacy
 * writeback; skip direct accepted graph writes when contextGraphProjectionOnlyV1.
 */
export function ingestScenarioFinaleToCompanion(input = {}) {
  if (!isAutonomyCapabilityEnabled("scenarioMemory")) {
    return { ok: false, reason: "scenario_memory_disabled", record: null };
  }
  const record = buildScenarioExperienceRecord(input);
  if (!record.runId || !record.narrativeSummary || !record.characterId) {
    return { ok: false, reason: "missing_fields", record: null };
  }

  const bag = readBag();
  bag.committed = bag.committed || {};
  if (bag.committed[record.idempotentKey]) {
    return {
      ok: true,
      alreadyCommitted: true,
      record: bag.committed[record.idempotentKey],
    };
  }

  const nowIso = record.committedAt;
  const summaryContent = formatExperienceSummaryForMemory(record);
  const useAdapter = adapterPathEnabled();

  /** @type {object|null} */
  let adapterResult = null;
  /** @type {object|null} */
  let episodicResult = null;
  /** @type {object[]} */
  let factsIngested = [];
  /** @type {object|null} */
  let relationshipPlan = null;

  if (useAdapter) {
    ensureScenarioAdapterRegistered();
    adapterResult = onScenarioFinale(
      {
        runId: record.runId,
        scriptId: record.scriptId,
        scriptTitle: record.scriptTitle,
        summary: record.narrativeSummary,
        narrativeSummary: record.narrativeSummary,
        characterId: record.characterId,
        companionId: record.characterId,
        diaryId: record.diaryId,
        eventId: record.eventId,
        idempotencyKey: record.idempotentKey,
        occurredAt: nowIso,
        includeFictionCandidate: false,
      },
      {
        appendTimeline: typeof input.appendTimeline === "function"
          ? input.appendTimeline
          : undefined,
      },
    );

    // Dual-run fiction graph only when projection-only is OFF — always shared_fiction.
    if (!graphProjectionOnly()) {
      episodicResult = ingestCandidate(
        fictionGraphCandidate({
          id: record.id,
          kind: "episodic",
          characterId: record.characterId,
          content: summaryContent,
          summary: summaryContent.slice(0, 240),
          source: "companion.scenario_finale",
          sourceRef: record.idempotentKey,
          tags: ["cp12", "scenario", "shared_experience"],
          whyRemembered: "情景剧谢幕经历摘要，非剧场对白原文",
          memoryStatus: "accepted",
          retention: "rolling_90d",
        }),
        { nowIso },
      );
      for (const fact of record.importantFactCandidates) {
        factsIngested.push(
          ingestCandidate(
            fictionGraphCandidate({
              kind: "semantic",
              characterId: record.characterId,
              content: fact,
              summary: fact.slice(0, 80),
              source: "companion.scenario_finale",
              sourceRef: `${record.idempotentKey}:fact:${fact.slice(0, 24)}`,
              tags: ["cp12", "scenario-fact"],
              whyRemembered: "情景剧谢幕提炼的可提及事实",
              memoryStatus: "accepted",
              retention: "rolling_90d",
            }),
            { nowIso },
          ),
        );
      }
    }

    // W1 reinforce: adapter path never applies ordinary intimacy/trust/tension writeback.
    relationshipPlan = {
      applied: false,
      allowNumericRelationship: false,
      realityNamespace: SCENARIO_REALITY_NAMESPACE,
      skipped: "scenario_adapter_no_ordinary_intimacy",
    };
  } else {
    // Legacy path when adapterPathEnabled() is false (unifiedMemoryAdaptersV1 /
    // contextGraphProjectionOnlyV1 off). Unreachable under internal_v1 / production_v1.
    episodicResult = ingestCandidate(
      fictionGraphCandidate({
        id: record.id,
        kind: "episodic",
        characterId: record.characterId,
        content: summaryContent,
        summary: summaryContent.slice(0, 240),
        source: "companion.scenario_finale",
        sourceRef: record.idempotentKey,
        tags: ["cp12", "scenario", "shared_experience"],
        whyRemembered: "情景剧谢幕经历摘要，非剧场对白原文",
        memoryStatus: "accepted",
        retention: "rolling_90d",
      }),
      { nowIso },
    );

    for (const fact of record.importantFactCandidates) {
      factsIngested.push(
        ingestCandidate(
          fictionGraphCandidate({
            kind: "semantic",
            characterId: record.characterId,
            content: fact,
            summary: fact.slice(0, 80),
            source: "companion.scenario_finale",
            sourceRef: `${record.idempotentKey}:fact:${fact.slice(0, 24)}`,
            tags: ["cp12", "scenario-fact"],
            whyRemembered: "情景剧谢幕提炼的可提及事实",
            memoryStatus: "accepted",
            retention: "rolling_90d",
          }),
          { nowIso },
        ),
      );
    }

    const detected = detectImportantEvent({ userText: record.narrativeSummary });
    if (detected.type || record.relationshipDeltaCandidates.length) {
      // Legacy path may still plan scenario-scoped metrics; never ordinary chat intimacy.
      relationshipPlan = planRelationship({
        characterId: record.characterId,
        sessionId: record.runId,
        userText: record.narrativeSummary,
        eventType: detected.type || undefined,
        meta: {
          scenarioFinale: true,
          runId: record.runId,
          realityNamespace: SCENARIO_REALITY_NAMESPACE,
          // Experience-internal only — W1: do not write ordinary relationship numbers.
          allowNumericRelationship: false,
        },
        allowNumericRelationship: false,
        realityNamespace: SCENARIO_REALITY_NAMESPACE,
        apply: true,
        projectionKey: record.idempotentKey,
      });
    }
  }

  bag.committed[record.idempotentKey] = record;
  writeBag(bag);

  appendActivity({
    title: "情景剧经历生成了一条关系记忆",
    reason: "情景剧谢幕",
    capability: "情景剧记忆",
    resourcesRead: ["情景剧摘要"],
    changes: [String(record.narrativeSummary || "").slice(0, 80)],
    usedModel: false,
    undoable: false,
    source: "scenario_memory",
    characterId: record.characterId,
  });

  return {
    ok: true,
    alreadyCommitted: false,
    record,
    adapterResult,
    adapterPath: useAdapter,
    episodicResult,
    factsIngested,
    relationshipPlan,
    realityNamespace: SCENARIO_REALITY_NAMESPACE,
    allowNumericRelationship: false,
    promptBlock: formatScenarioExperiencePromptBlock(record.characterId),
  };
}

/**
 * Pop / compilePrompt block — summaries only, never theater turn dialogue.
 * @param {string} characterId
 * @param {{ limit?: number }} [opts]
 */
export function formatScenarioExperiencePromptBlock(characterId, { limit = 4 } = {}) {
  const cid = String(characterId || "").trim();
  if (!cid) return "";

  const cap = Math.max(1, Number(limit) || 4);
  const lines = [];
  const seen = new Set();

  const graphItems = listItems({ characterId: cid, limit: 500 })
    .filter(
      (item) =>
        item.source === "companion.scenario_finale"
        || (Array.isArray(item.tags) && item.tags.includes("cp12")),
    )
    .sort((a, b) =>
      String(b.updatedAt || b.occurredAt || "").localeCompare(
        String(a.updatedAt || a.occurredAt || ""),
      ),
    );

  for (const item of graphItems) {
    const line = `- ${String(item.summary || item.content || "").slice(0, 120)}`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
    if (lines.length >= cap) break;
  }

  if (lines.length < cap) {
    for (const row of listSharedLifeSummaries(cid, { limit: cap * 2 })) {
      if (row.kind !== "finale" && !/谢幕/.test(String(row.summary || ""))) continue;
      const line = `- ${String(row.summary || "").slice(0, 120)}`;
      if (seen.has(line)) continue;
      seen.add(line);
      lines.push(line);
      if (lines.length >= cap) break;
    }
  }

  if (!lines.length) return "";
  return ["共同经历摘要（情景剧谢幕，非剧场对白原文）：", ...lines].join("\n");
}

/**
 *  filtered event handler — idempotent fallback when persistence already ran.
 * @param {{ detail?: object }} evt
 */
export function onScenarioEventCompleted(evt = {}) {
  const detail = evt.detail && typeof evt.detail === "object" ? evt.detail : {};
  const runId = String(detail.runId || "").trim();
  const characterId = String(detail.characterId || "").trim();
  const summary = String(detail.narrativeSummary || detail.summary || "").trim();
  if (!runId || !characterId || !summary) {
    return { ok: false, reason: "missing_event_detail" };
  }

  const existing = getCommittedScenarioExperience(runId) || findSharedByRunId(characterId, runId);
  if (existing) {
    return { ok: true, alreadyCommitted: true, record: existing };
  }

  return ingestScenarioFinaleToCompanion({
    runId,
    scriptId: detail.scriptId,
    scriptTitle: detail.scriptTitle,
    summary,
    characterId,
    diaryId: detail.diaryId,
    eventId: detail.eventId,
    memoryCandidate: Array.isArray(detail.importantFactCandidates)
      ? detail.importantFactCandidates[0]
      : "",
    directorState: detail.directorState || {},
  });
}

export function bindScenarioMemoryBridgeListeners() {
  eventUnbind?.();
  eventUnbind = subscribeAppEvent("scenario.event.completed", (evt) => {
    try {
      onScenarioEventCompleted(evt);
    } catch (error) {
      console.warn("scenario memory bridge event failed", error);
    }
  });
  return () => {
    eventUnbind?.();
    eventUnbind = null;
  };
}

export function unbindScenarioMemoryBridgeListeners() {
  eventUnbind?.();
  eventUnbind = null;
}
