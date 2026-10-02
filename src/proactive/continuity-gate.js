/**
 * C3 — Gate proactive Continuity nudges on confirmed openLoop / evidence.
 * Dedupe by fingerprint + sourceRef. Respects proactive feature flag + autonomy prefs.
 */

import { isFeatureEnabled } from "../features/flags.js";
import { shouldAllowProactiveWake } from "../companion/autonomy-prefs.js";
import { getCompanionSurfaceModel } from "../relationship/surface-service.js";

export const CONTINUITY_PROACTIVE_NOTIFIED_KEY = "yueqi.proactive.continuity.notified.v1";

/** @type {null | Storage | { getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }} */
let testStorage = null;

export function __setContinuityProactiveStorageForTests(storage) {
  testStorage = storage;
}

export function clearContinuityProactiveNotifiedForTests() {
  try {
    ls()?.removeItem?.(CONTINUITY_PROACTIVE_NOTIFIED_KEY);
  } catch {
    /* ignore */
  }
}

function ls() {
  if (testStorage) return testStorage;
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* ignore */
  }
  try {
    if (typeof globalThis !== "undefined" && globalThis.localStorage) return globalThis.localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

function readBag() {
  try {
    const raw = ls()?.getItem(CONTINUITY_PROACTIVE_NOTIFIED_KEY);
    const bag = raw ? JSON.parse(raw) : null;
    if (!bag || typeof bag !== "object") return { schemaVersion: 1, keys: {} };
    if (!bag.keys || typeof bag.keys !== "object") bag.keys = {};
    return bag;
  } catch {
    return { schemaVersion: 1, keys: {} };
  }
}

function writeBag(bag) {
  try {
    ls()?.setItem(CONTINUITY_PROACTIVE_NOTIFIED_KEY, JSON.stringify(bag));
    return true;
  } catch {
    return false;
  }
}

export function continuityProactiveDedupeKey(fingerprint, sourceRef) {
  return `${String(fingerprint || "").trim()}::${String(sourceRef || "").trim()}`;
}

export function wasContinuityProactiveNotified(fingerprint, sourceRef) {
  const key = continuityProactiveDedupeKey(fingerprint, sourceRef);
  if (!key || key === "::") return false;
  return Boolean(readBag().keys[key]);
}

export function markContinuityProactiveNotified(fingerprint, sourceRef, at = new Date().toISOString()) {
  const key = continuityProactiveDedupeKey(fingerprint, sourceRef);
  if (!key || key === "::") return { ok: false, reason: "missing_key" };
  const bag = readBag();
  bag.keys[key] = { at: String(at || new Date().toISOString()) };
  // Cap growth
  const keys = Object.keys(bag.keys);
  if (keys.length > 200) {
    keys.slice(0, keys.length - 160).forEach((k) => { delete bag.keys[k]; });
  }
  writeBag(bag);
  return { ok: true, key };
}

/**
 * Whether a Continuity-backed proactive trigger may fire.
 *
 * @param {{
 *   companionId: string,
 *   userId?: string,
 *   relationshipId?: string,
 *   sourceRef?: string,
 *   now?: Date|number|string,
 *   snapshot?: object,
 *   locale?: string,
 *   wakeSource?: string,
 *   requireOpenLoop?: boolean,
 *   markNotified?: boolean,
 * }} input
 */
export function evaluateContinuityProactiveGate(input = {}) {
  if (!isFeatureEnabled("proactive")) {
    return { ok: false, reason: "proactive_flag_off", model: null };
  }
  if (!isFeatureEnabled("relationshipContinuityV1")) {
    return { ok: false, reason: "continuity_flag_off", model: null };
  }
  if (!shouldAllowProactiveWake(input.wakeSource || "continuity_open_loop")) {
    return { ok: false, reason: "autonomy_blocked", model: null };
  }

  const companionId = String(input.companionId || "").trim();
  if (!companionId) {
    return { ok: false, reason: "missing_companionId", model: null };
  }

  const model = getCompanionSurfaceModel({
    companionId,
    userId: input.userId,
    relationshipId: input.relationshipId,
    surface: "proactive",
    now: input.now,
    snapshot: input.snapshot,
    locale: input.locale,
  });

  const hasOpenLoop = Boolean(model.openLoop);
  const hasEvidence = Array.isArray(model.evidenceRefs) && model.evidenceRefs.length > 0;
  if (input.requireOpenLoop !== false && !hasOpenLoop && !hasEvidence) {
    return { ok: false, reason: "no_confirmed_evidence", model };
  }
  if (!hasOpenLoop && !hasEvidence) {
    return { ok: false, reason: "no_confirmed_evidence", model };
  }

  const sourceRef = String(input.sourceRef || model.evidenceRefs[0] || model.openLoop || "").trim();
  if (!sourceRef) {
    return { ok: false, reason: "missing_sourceRef", model };
  }

  if (wasContinuityProactiveNotified(model.fingerprint, sourceRef)) {
    return { ok: false, reason: "deduped", model, sourceRef, fingerprint: model.fingerprint };
  }

  if (input.markNotified !== false) {
    markContinuityProactiveNotified(model.fingerprint, sourceRef);
  }

  return {
    ok: true,
    reason: "allowed",
    model,
    sourceRef,
    fingerprint: model.fingerprint,
  };
}
