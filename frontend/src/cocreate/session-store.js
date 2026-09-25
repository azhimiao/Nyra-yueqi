/**
 * C5 — CreationSession store + legacy draft migration entry.
 */

import {
  emptyArtifactContent,
  getTaskTemplate,
  normalizeCreationSession,
  normalizeCreationTurn,
  uid,
  nowIso,
} from "./session-schema.js";
import {
  createArtifactWithVersion,
  getArtifact,
  updateArtifactMeta,
  exportArtifactBag,
  ARTIFACT_STORE_KEY,
} from "./artifact-store.js";
import { listDrafts, COCREATE_STORE_KEY } from "./store.js";

export const SESSION_STORE_KEY = "yueqi.cocreate.session.v1";
const MAX_SESSIONS = 30;
const MIGRATION_FLAG = "yueqi.cocreate.migrated.v2";

function readBag() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return { sessions: [] };
    return JSON.parse(window.localStorage.getItem(SESSION_STORE_KEY) || "{}") || { sessions: [] };
  } catch {
    return { sessions: [] };
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(SESSION_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

function ensureBag() {
  const bag = readBag();
  if (!Array.isArray(bag.sessions)) bag.sessions = [];
  return bag;
}

export function listSessions() {
  return ensureBag().sessions
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, MAX_SESSIONS);
}

export function getSession(id) {
  return ensureBag().sessions.find((s) => s.id === id) || null;
}

export function getActiveSession() {
  return listSessions().find((s) => s.status === "active" || s.status === "paused") || null;
}

export function getLastResumableSession() {
  return listSessions().find((s) => s.status === "active" || s.status === "paused") || null;
}

/**
 * @param {{
 *   characterId: string,
 *   type: string,
 *   characterName?: string,
 *   title?: string,
 * }} input
 */
export function startSession(input) {
  const tmpl = getTaskTemplate(input.type);
  if (!tmpl) throw new Error("unknown_task_type");
  const characterId = String(input.characterId || "").trim();
  if (!characterId) throw new Error("missing_characterId");

  const { artifact, version } = createArtifactWithVersion({
    characterId,
    type: input.type,
    title: input.title || tmpl.title,
    content: emptyArtifactContent(input.type, { characterName: input.characterName }),
    summary: "起稿",
  });

  const session = normalizeCreationSession({
    id: uid("sess"),
    characterId,
    type: input.type,
    title: input.title || tmpl.title,
    goal: tmpl.goal,
    status: "active",
    turns: [],
    artifactId: artifact.id,
    activeVersionId: version.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }).value;

  updateArtifactMeta(artifact.id, { sessionId: session.id });

  const bag = ensureBag();
  // Pause other actives
  bag.sessions = bag.sessions.map((s) => (
    s.status === "active" ? { ...s, status: "paused", updatedAt: nowIso() } : s
  ));
  bag.sessions.unshift(session);
  bag.sessions = bag.sessions.slice(0, MAX_SESSIONS);
  writeBag(bag);
  return { session, artifact, version };
}

export function saveSession(session) {
  const n = normalizeCreationSession(session);
  if (!n.ok || !n.value) throw new Error(`session_invalid:${(n.errors || []).join(",")}`);
  const bag = ensureBag();
  const idx = bag.sessions.findIndex((s) => s.id === n.value.id);
  const next = { ...n.value, updatedAt: nowIso() };
  if (idx >= 0) bag.sessions[idx] = next;
  else bag.sessions.unshift(next);
  bag.sessions = bag.sessions.slice(0, MAX_SESSIONS);
  writeBag(bag);
  return next;
}

/**
 * @param {string} sessionId
 * @param {object} turnInput
 */
export function appendTurn(sessionId, turnInput) {
  const session = getSession(sessionId);
  if (!session) throw new Error("session_not_found");
  const n = normalizeCreationTurn(turnInput);
  if (!n.value) throw new Error(`turn_invalid:${(n.errors || []).join(",")}`);
  const turns = [...(session.turns || []), n.value];
  return saveSession({ ...session, turns, status: "active" });
}

export function updateTurn(sessionId, turnId, patch) {
  const session = getSession(sessionId);
  if (!session) throw new Error("session_not_found");
  const turns = (session.turns || []).map((t) => (
    t.id === turnId ? { ...t, ...patch, id: t.id } : t
  ));
  return saveSession({ ...session, turns });
}

export function setSessionStatus(sessionId, status) {
  const session = getSession(sessionId);
  if (!session) return null;
  return saveSession({ ...session, status });
}

export function syncActiveVersion(sessionId, versionId) {
  const session = getSession(sessionId);
  if (!session) return null;
  return saveSession({ ...session, activeVersionId: versionId });
}

/**
 * Map legacy one-shot draft → single-version artifact (+ archived session stub).
 * Idempotent via migration flag + draft id tagging.
 */
export function migrateLegacyDrafts(opts = {}) {
  try {
    if (typeof window !== "undefined" && window.localStorage?.getItem(MIGRATION_FLAG) === "1") {
      if (!opts.force) return { migrated: 0, skipped: true };
    }
  } catch {
    /* ignore */
  }

  const drafts = listDrafts();
  let migrated = 0;
  for (const draft of drafts) {
    const type = draft.target === "script" ? "date_scene" : "backstory";
    let content;
    if (type === "date_scene") {
      const p = draft.output?.scriptPatch || {};
      content = {
        kind: "date_scene",
        title: p.title || "共创一幕",
        premise: p.premise || "",
        openingBeat: p.openingBeat || "",
        mood: p.mood || "warm",
        beats: [],
      };
    } else {
      const p = draft.output?.characterPatch || {};
      content = {
        kind: "backstory",
        text: p.text || "",
        fieldIndex: Number.isInteger(p.fieldIndex) ? p.fieldIndex : 4,
        tokens: Array.isArray(p.tokens) ? p.tokens : [],
      };
    }
    const { artifact, version } = createArtifactWithVersion({
      characterId: draft.characterId || "unknown",
      type,
      title: content.title || content.text?.slice(0, 20) || "旧草稿",
      content,
      summary: "迁移自旧共创草稿",
      sourceTurnIds: [],
    });
    updateArtifactMeta(artifact.id, {
      complete: true,
      publishedAt: draft.appliedAt || null,
      sessionId: `migrated-${draft.id}`,
    });
    const session = normalizeCreationSession({
      id: `migrated-${draft.id}`,
      characterId: draft.characterId || "unknown",
      type,
      title: artifact.title,
      goal: "（迁移）旧一键草稿",
      status: draft.appliedAt ? "published" : "archived",
      turns: [
        {
          id: uid("turn"),
          role: "user",
          text: draft.input?.prompt || "（旧草稿）",
          proposals: [],
          createdAt: draft.createdAt || nowIso(),
        },
        {
          id: uid("turn"),
          role: "assistant",
          text: "这是从旧共创一键草稿迁移的单版本作品。",
          proposals: [],
          createdAt: draft.createdAt || nowIso(),
        },
      ],
      artifactId: artifact.id,
      activeVersionId: version.id,
      createdAt: draft.createdAt || nowIso(),
      updatedAt: nowIso(),
    }).value;
    const bag = ensureBag();
    if (!bag.sessions.some((s) => s.id === session.id)) {
      bag.sessions.push(session);
      writeBag(bag);
      migrated += 1;
    }
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(MIGRATION_FLAG, "1");
    }
  } catch {
    /* ignore */
  }
  return { migrated, skipped: false };
}

export function exportSessionBag() {
  return { sessions: listSessions() };
}

export function importSessionBag(payload) {
  if (!payload || typeof payload !== "object") return;
  writeBag({
    sessions: Array.isArray(payload.sessions) ? payload.sessions.slice(0, MAX_SESSIONS) : [],
  });
}

/** Combined bag for backup / verify */
export function exportCocreateV2Bag() {
  return {
    schemaVersion: 2,
    sessions: listSessions(),
    ...exportArtifactBag(),
    legacyDraftsKey: COCREATE_STORE_KEY,
    artifactKey: ARTIFACT_STORE_KEY,
  };
}

export function clearSessionBagForTests() {
  writeBag({ sessions: [] });
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(MIGRATION_FLAG);
    }
  } catch {
    /* ignore */
  }
}

export { getArtifact };
