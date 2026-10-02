/**
 * C5 — Artifact + version store with undo/restore.
 */

import {
  normalizeArtifact,
  normalizeArtifactVersion,
  summarizeContent,
  uid,
  nowIso,
} from "./session-schema.js";

export const ARTIFACT_STORE_KEY = "yueqi.cocreate.artifact.v1";
const MAX_ARTIFACTS = 40;
const MAX_VERSIONS = 200;

function readBag() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return { artifacts: [], versions: [] };
    }
    return JSON.parse(window.localStorage.getItem(ARTIFACT_STORE_KEY) || "{}") || {
      artifacts: [],
      versions: [],
    };
  } catch {
    return { artifacts: [], versions: [] };
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(ARTIFACT_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

function ensureBag() {
  const bag = readBag();
  if (!Array.isArray(bag.artifacts)) bag.artifacts = [];
  if (!Array.isArray(bag.versions)) bag.versions = [];
  return bag;
}

export function listArtifacts() {
  return ensureBag().artifacts
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, MAX_ARTIFACTS);
}

export function getArtifact(id) {
  return ensureBag().artifacts.find((a) => a.id === id) || null;
}

export function getVersion(id) {
  return ensureBag().versions.find((v) => v.id === id) || null;
}

export function listVersionsForArtifact(artifactId) {
  const bag = ensureBag();
  const art = bag.artifacts.find((a) => a.id === artifactId);
  if (!art) return [];
  const ids = new Set(art.versionIds || []);
  return bag.versions
    .filter((v) => ids.has(v.id) || v.artifactId === artifactId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

/**
 * @param {{
 *   characterId: string,
 *   type: string,
 *   title?: string,
 *   sessionId?: string,
 *   content: object,
 *   summary?: string,
 *   sourceTurnIds?: string[],
 * }} input
 */
export function createArtifactWithVersion(input) {
  const bag = ensureBag();
  const artifactId = uid("art");
  const versionId = uid("ver");
  const version = normalizeArtifactVersion({
    id: versionId,
    artifactId,
    parentVersionId: null,
    content: input.content,
    summary: input.summary || summarizeContent(input.content),
    sourceTurnIds: input.sourceTurnIds || [],
    createdAt: nowIso(),
  }).value;
  const artifact = normalizeArtifact({
    id: artifactId,
    characterId: input.characterId,
    type: input.type,
    title: input.title,
    sessionId: input.sessionId || "",
    currentVersionId: versionId,
    versionIds: [versionId],
    undoStack: [],
    redoStack: [],
    complete: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }).value;
  bag.artifacts.unshift(artifact);
  bag.versions.unshift(version);
  bag.artifacts = bag.artifacts.slice(0, MAX_ARTIFACTS);
  bag.versions = bag.versions.slice(0, MAX_VERSIONS);
  writeBag(bag);
  return { artifact, version };
}

/**
 * Accept a proposal patch → new version; push previous onto undo.
 * @param {string} artifactId
 * @param {object} nextContent
 * @param {{ summary?: string, sourceTurnIds?: string[], markComplete?: boolean }} [opts]
 */
export function commitVersion(artifactId, nextContent, opts = {}) {
  const bag = ensureBag();
  const idx = bag.artifacts.findIndex((a) => a.id === artifactId);
  if (idx < 0) throw new Error("artifact_not_found");
  const art = bag.artifacts[idx];
  const parentId = art.currentVersionId || null;
  const versionId = uid("ver");
  const version = normalizeArtifactVersion({
    id: versionId,
    artifactId,
    parentVersionId: parentId,
    content: nextContent,
    summary: opts.summary || summarizeContent(nextContent),
    sourceTurnIds: opts.sourceTurnIds || [],
    createdAt: nowIso(),
  }).value;
  const undoStack = [...(art.undoStack || [])];
  if (parentId) undoStack.push(parentId);
  const next = {
    ...art,
    currentVersionId: versionId,
    versionIds: [...(art.versionIds || []), versionId],
    undoStack,
    redoStack: [],
    complete: opts.markComplete === true ? true : art.complete,
    updatedAt: nowIso(),
  };
  bag.artifacts[idx] = next;
  bag.versions.unshift(version);
  bag.versions = bag.versions.slice(0, MAX_VERSIONS);
  writeBag(bag);
  return { artifact: next, version };
}

/**
 * Undo to previous version id (persists across refresh).
 * @param {string} artifactId
 */
export function undoVersion(artifactId) {
  const bag = ensureBag();
  const idx = bag.artifacts.findIndex((a) => a.id === artifactId);
  if (idx < 0) return null;
  const art = bag.artifacts[idx];
  const undoStack = [...(art.undoStack || [])];
  if (!undoStack.length) return { artifact: art, version: getVersion(art.currentVersionId), changed: false };
  const prevId = undoStack.pop();
  const redoStack = [...(art.redoStack || [])];
  if (art.currentVersionId) redoStack.push(art.currentVersionId);
  const next = {
    ...art,
    currentVersionId: prevId,
    undoStack,
    redoStack,
    updatedAt: nowIso(),
  };
  bag.artifacts[idx] = next;
  writeBag(bag);
  return { artifact: next, version: bag.versions.find((v) => v.id === prevId) || null, changed: true };
}

/**
 * Restore (redo) after undo.
 * @param {string} artifactId
 */
export function restoreVersion(artifactId) {
  const bag = ensureBag();
  const idx = bag.artifacts.findIndex((a) => a.id === artifactId);
  if (idx < 0) return null;
  const art = bag.artifacts[idx];
  const redoStack = [...(art.redoStack || [])];
  if (!redoStack.length) return { artifact: art, version: getVersion(art.currentVersionId), changed: false };
  const nextId = redoStack.pop();
  const undoStack = [...(art.undoStack || [])];
  if (art.currentVersionId) undoStack.push(art.currentVersionId);
  const next = {
    ...art,
    currentVersionId: nextId,
    undoStack,
    redoStack,
    updatedAt: nowIso(),
  };
  bag.artifacts[idx] = next;
  writeBag(bag);
  return { artifact: next, version: bag.versions.find((v) => v.id === nextId) || null, changed: true };
}

/**
 * Jump to a historical version (adds current to undo).
 * @param {string} artifactId
 * @param {string} versionId
 */
export function restoreToVersion(artifactId, versionId) {
  const bag = ensureBag();
  const idx = bag.artifacts.findIndex((a) => a.id === artifactId);
  if (idx < 0) return null;
  const ver = bag.versions.find((v) => v.id === versionId && v.artifactId === artifactId);
  if (!ver) return null;
  const art = bag.artifacts[idx];
  if (art.currentVersionId === versionId) {
    return { artifact: art, version: ver, changed: false };
  }
  const undoStack = [...(art.undoStack || [])];
  if (art.currentVersionId) undoStack.push(art.currentVersionId);
  const next = {
    ...art,
    currentVersionId: versionId,
    undoStack,
    redoStack: [],
    updatedAt: nowIso(),
  };
  bag.artifacts[idx] = next;
  writeBag(bag);
  return { artifact: next, version: ver, changed: true };
}

export function updateArtifactMeta(artifactId, patch = {}) {
  const bag = ensureBag();
  const idx = bag.artifacts.findIndex((a) => a.id === artifactId);
  if (idx < 0) return null;
  const next = {
    ...bag.artifacts[idx],
    ...patch,
    id: bag.artifacts[idx].id,
    updatedAt: nowIso(),
  };
  bag.artifacts[idx] = next;
  writeBag(bag);
  return next;
}

export function getCurrentContent(artifactId) {
  const art = getArtifact(artifactId);
  if (!art) return null;
  return getVersion(art.currentVersionId)?.content || null;
}

export function exportArtifactBag() {
  const bag = ensureBag();
  return { artifacts: bag.artifacts, versions: bag.versions };
}

export function importArtifactBag(payload) {
  if (!payload || typeof payload !== "object") return;
  writeBag({
    artifacts: Array.isArray(payload.artifacts) ? payload.artifacts.slice(0, MAX_ARTIFACTS) : [],
    versions: Array.isArray(payload.versions) ? payload.versions.slice(0, MAX_VERSIONS) : [],
  });
}

export function clearArtifactBagForTests() {
  writeBag({ artifacts: [], versions: [] });
}
