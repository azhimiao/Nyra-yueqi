/**
 * E6 共创 store — yueqi.cocreate.v1 (legacy drafts)
 * C5 keeps this as migration source; session/artifact live in session-store / artifact-store.
 */

import { validateCocreateDraft } from "./schema.js";

export const COCREATE_STORE_KEY = "yueqi.cocreate.v1";
const MAX_DRAFTS = 20;

function nowIso() {
  return new Date().toISOString();
}

function readBag() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return { drafts: [] };
    return JSON.parse(window.localStorage.getItem(COCREATE_STORE_KEY) || "{}") || { drafts: [] };
  } catch {
    return { drafts: [] };
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(COCREATE_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

export function listDrafts() {
  const bag = readBag();
  return Array.isArray(bag.drafts) ? bag.drafts.slice(0, MAX_DRAFTS) : [];
}

export function saveDraft(draft) {
  const v = validateCocreateDraft(draft);
  if (!v.ok) throw new Error(`cocreate_draft_invalid:${v.errors.join(",")}`);
  const bag = readBag();
  const drafts = Array.isArray(bag.drafts) ? bag.drafts : [];
  const next = {
    ...draft,
    id: String(draft.id || `cc-${Date.now().toString(36)}`),
    createdAt: draft.createdAt || nowIso(),
  };
  const idx = drafts.findIndex((item) => item.id === next.id);
  if (idx >= 0) drafts[idx] = next;
  else drafts.unshift(next);
  bag.drafts = drafts.slice(0, MAX_DRAFTS);
  writeBag(bag);
  return next;
}

export function markDraftApplied(id) {
  const bag = readBag();
  const drafts = Array.isArray(bag.drafts) ? bag.drafts : [];
  const idx = drafts.findIndex((item) => item.id === id);
  if (idx < 0) return null;
  drafts[idx] = { ...drafts[idx], appliedAt: nowIso() };
  writeBag(bag);
  return drafts[idx];
}

export function exportCocreateBag() {
  const SESSION_STORE_KEY = "yueqi.cocreate.session.v1";
  const ARTIFACT_STORE_KEY = "yueqi.cocreate.artifact.v1";
  let sessions = [];
  let artifacts = [];
  let versions = [];
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const s = JSON.parse(window.localStorage.getItem(SESSION_STORE_KEY) || "{}");
      const a = JSON.parse(window.localStorage.getItem(ARTIFACT_STORE_KEY) || "{}");
      sessions = Array.isArray(s.sessions) ? s.sessions : [];
      artifacts = Array.isArray(a.artifacts) ? a.artifacts : [];
      versions = Array.isArray(a.versions) ? a.versions : [];
    }
  } catch {
    /* ignore */
  }
  return {
    drafts: listDrafts(),
    v2: { schemaVersion: 2, sessions, artifacts, versions },
  };
}

export function importCocreateBag(payload) {
  if (!payload || typeof payload !== "object") return;
  const drafts = Array.isArray(payload.drafts) ? payload.drafts.slice(0, MAX_DRAFTS) : [];
  writeBag({ drafts });
  const v2 = payload.v2 && typeof payload.v2 === "object" ? payload.v2 : payload;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      if (Array.isArray(v2.sessions)) {
        window.localStorage.setItem(
          "yueqi.cocreate.session.v1",
          JSON.stringify({ sessions: v2.sessions }),
        );
      }
      if (Array.isArray(v2.artifacts) || Array.isArray(v2.versions)) {
        window.localStorage.setItem(
          "yueqi.cocreate.artifact.v1",
          JSON.stringify({
            artifacts: Array.isArray(v2.artifacts) ? v2.artifacts : [],
            versions: Array.isArray(v2.versions) ? v2.versions : [],
          }),
        );
      }
    }
  } catch {
    /* ignore */
  }
}
