/**
 * Resolve the DayPack that TA's phone should show for a character.
 * No-key / offline: Xingli seed; otherwise best stored pack (prefer §5.2 density).
 */

import {
  ensureXingliSeedPack,
  getDayPack,
  listDayPacks,
  recordObservation,
  listObservations,
} from "../life/store.js";
import { measureAppDensity } from "../life/projections.js";
import { recordObservationConfluence } from "../life/confluence.js";
import { XINGLI_CHARACTER_ID, XINGLI_DAY_001_DATE } from "../life/fixtures/xingli-day-001.js";
import { LS_KEYS } from "./constants.js";

/**
 * Pick the DayPack best suited for TA phone exploration.
 * Skips thin cohabit dual-write packs that would empty the six apps.
 * @param {string} characterId
 * @returns {{ pack: object|null, source: "seed"|"stored"|"empty", staleHint: string|null }}
 */
export function resolveDayPackForCharacter(characterId) {
  const cid = String(characterId || "").trim();
  if (!cid) return { pack: null, source: "empty", staleHint: null };

  ensureXingliSeedPack();

  const packs = listDayPacks(cid, { limit: 60 });
  const dense = packs.find((p) => measureAppDensity(p).ok);
  if (dense) {
    return {
      pack: dense,
      source: dense.source === "seed" ? "seed" : "stored",
      staleHint: null,
    };
  }

  const withEvidence = packs.find((p) => (p.evidence || []).length >= 8);
  if (withEvidence) {
    return {
      pack: withEvidence,
      source: withEvidence.source === "seed" ? "seed" : "stored",
      staleHint: "今天还没有更新",
    };
  }

  if (cid === XINGLI_CHARACTER_ID) {
    const seed = getDayPack(XINGLI_CHARACTER_ID, XINGLI_DAY_001_DATE) || ensureXingliSeedPack();
    return {
      pack: seed ? { ...seed, source: "seed", demo: true } : null,
      source: "seed",
      // P0: seed must not read as lived shared experience.
      staleHint: "演示日数据（非真实共同经历）",
    };
  }

  return {
    pack: null,
    source: "empty",
    staleHint: "今天还没有更新",
  };
}

/**
 * @param {{
 *   characterId: string,
 *   dayPackId: string,
 *   evidenceId: string,
 *   dwellMs?: number,
 *   discoverable?: boolean,
 * }} input
 */
export function observeEvidence(input = {}) {
  const characterId = String(input.characterId || "").trim();
  const evidenceId = String(input.evidenceId || "").trim();
  const dayPackId = String(input.dayPackId || "").trim();
  if (!characterId || !evidenceId || !dayPackId) {
    return { ok: false, reason: "missing_fields" };
  }
  markEvidenceRead(characterId, evidenceId);
  const result = recordObservation({
    id: `obs-${characterId}-${evidenceId}`,
    characterId,
    dayPackId,
    evidenceId,
    observedAt: new Date().toISOString(),
    dwellMs: Math.max(0, Number(input.dwellMs) || 0),
    reactionState: input.discoverable === false ? "unseen" : "eligible",
  });

  // C6: eligible observations also enter shared life confluence (summary only)
  if (result.ok && input.discoverable !== false) {
    try {
      const pack = listDayPacks(characterId, { limit: 60 }).find((p) => p.id === dayPackId) || null;
      const evidence = (pack?.evidence || []).find((e) => e.id === evidenceId);
      recordObservationConfluence({
        characterId,
        evidenceId,
        dayPackId,
        title: evidence?.title || "",
        snippet: evidence?.content || "",
      });
    } catch {
      /* never block UI */
    }
  }

  return result;
}

/**
 * @param {string} characterId
 */
export function listObservedEvidenceIds(characterId) {
  const cid = String(characterId || "").trim();
  const fromLife = listObservations(cid, { limit: 400 }).map((o) => o.evidenceId);
  const fromUi = loadReadMap()[cid] || [];
  return new Set([...fromLife, ...fromUi]);
}

function loadReadMap() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(LS_KEYS.readState);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveReadMap(map) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LS_KEYS.readState, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/**
 * @param {string} characterId
 * @param {string} evidenceId
 */
export function markEvidenceRead(characterId, evidenceId) {
  const cid = String(characterId || "").trim();
  const eid = String(evidenceId || "").trim();
  if (!cid || !eid) return;
  const map = loadReadMap();
  const list = Array.isArray(map[cid]) ? map[cid] : [];
  if (!list.includes(eid)) {
    map[cid] = [eid, ...list].slice(0, 400);
    saveReadMap(map);
  }
}

/**
 * @param {string} characterId
 */
export function hasAcceptedBoundary(characterId) {
  const cid = String(characterId || "").trim();
  if (!cid) return false;
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(LS_KEYS.boundaryAck);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.[cid]);
  } catch {
    return false;
  }
}

/**
 * @param {string} characterId
 */
export function acceptBoundary(characterId) {
  const cid = String(characterId || "").trim();
  if (!cid) return;
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(LS_KEYS.boundaryAck);
    const parsed = raw ? JSON.parse(raw) : {};
    const next = parsed && typeof parsed === "object" ? parsed : {};
    next[cid] = new Date().toISOString();
    localStorage.setItem(LS_KEYS.boundaryAck, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
