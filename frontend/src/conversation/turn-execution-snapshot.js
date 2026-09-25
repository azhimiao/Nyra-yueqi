import {
  assertSnapshotReferences,
  createTurnExecutionSnapshotV1,
  validateTurnExecutionSnapshotV1,
} from "../contracts/turn-execution-snapshot-v1.js";
import { stableHash } from "../contracts/companion-v2-shared.js";
import { getCutoverProfile } from "../features/cutover-profile.js";

const heldSnapshots = new Map();
let latestHeldSnapshot = null;
const MAX_HELD_SNAPSHOTS = 64;

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
    );
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) deepFreeze(item);
    }
    return value;
  }
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function recordId(record) {
  return String(record?.characterId || record?.id || "").trim();
}

function revisionFor(characterId, record, expected = {}) {
  if (Object.prototype.hasOwnProperty.call(expected, characterId)) {
    return expected[characterId];
  }
  return record?.revision;
}

/**
 * Stable payload identity independent of execution bookkeeping.
 */
export function hashSnapshotPayload(snapshot = {}) {
  const {
    turnExecutionId: _turnExecutionId,
    frozen: _frozen,
    snapshotHash: _snapshotHash,
    ...payload
  } = snapshot && typeof snapshot === "object" ? snapshot : {};
  return stableHash(payload);
}

/**
 * Keep the immutable snapshot beside the existing TurnExecutionScope.
 */
export function holdTurnSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !Object.isFrozen(snapshot)) {
    throw new TypeError("turn_snapshot_must_be_frozen");
  }
  const id = String(snapshot.turnExecutionId || "").trim();
  if (!id) throw new TypeError("turn_snapshot_missing_id");
  heldSnapshots.set(id, snapshot);
  while (heldSnapshots.size > MAX_HELD_SNAPSHOTS) {
    heldSnapshots.delete(heldSnapshots.keys().next().value);
  }
  latestHeldSnapshot = snapshot;
  return snapshot;
}

export function getHeldTurnSnapshot(turnExecutionId = "") {
  const id = String(turnExecutionId || "").trim();
  return id ? heldSnapshots.get(id) || null : latestHeldSnapshot;
}

/**
 * Build a complete, immutable snapshot strictly from injected repository records.
 * Reference mismatches fail closed; this function never consults active UI state.
 */
export function buildTurnExecutionSnapshot(input = {}) {
  const focus = input.focus && typeof input.focus === "object" ? input.focus : {};
  const characters = Array.isArray(input.characters) ? input.characters : [];
  const byId = new Map(characters.map((record) => [recordId(record), record]).filter(([id]) => id));
  const isGroup = focus.kind === "group";
  const speakerCharacterId = String(
    input.speakerCharacterId || (!isGroup ? focus.characterId : "") || "",
  ).trim();
  const participantIds = isGroup
    ? [...new Set((focus.memberIds || []).map((id) => String(id || "").trim()).filter(Boolean))]
    : [speakerCharacterId || String(focus.characterId || "").trim()].filter(Boolean);
  const expectedRevisions = input.characterRevisions
    && typeof input.characterRevisions === "object"
    ? input.characterRevisions
    : {};
  const participants = participantIds.map((characterId) => ({
    characterId,
    revision: revisionFor(characterId, byId.get(characterId), expectedRevisions),
  }));
  const recordErrors = participants.flatMap((participant, index) => {
    const record = byId.get(participant.characterId);
    if (record && (!Number.isInteger(record.revision) || record.revision < 1)) {
      return [{ code: "invalid_revision", path: `participants[${index}]` }];
    }
    return [];
  });
  const sessionId = String(focus.sessionId || input.sessionId || "").trim();
  const currentInput = input.currentInput && typeof input.currentInput === "object"
    ? input.currentInput
    : {};

  const snapshot = createTurnExecutionSnapshotV1({
    turnExecutionId: input.turnExecutionId,
    conversationId: String(input.conversationId || sessionId).trim(),
    sessionId,
    conversationRevision: input.conversationRevision,
    speakerCharacterId,
    participants,
    userId: input.userId,
    relationshipScope: String(
      input.relationshipScope || (isGroup ? `group:${sessionId}` : `dm:${speakerCharacterId}`),
    ).trim(),
    preferenceRevision: input.preference?.revision ?? input.preferenceRevision,
    locale: input.locale,
    conversationLanguage: input.conversationLanguage,
    preset: cloneValue(input.preset || { id: "default", revision: 1 }),
    promptSettings: cloneValue(input.promptSettings || {}),
    budgetProfile: cloneValue(input.budgetProfile || {}),
    cutoverProfile: input.cutoverProfile || getCutoverProfile(),
    providerCapabilities: cloneValue(input.providerCapabilities || {}),
    runtimeCapabilities: cloneValue(input.runtimeCapabilities || {}),
    temporalSnapshot: input.temporalSnapshot == null ? null : cloneValue(input.temporalSnapshot),
    historyBoundaryIds: cloneValue(input.historyBoundaryIds || []),
    currentInput: {
      text: currentInput.text ?? "",
      attachmentRefs: cloneValue(currentInput.attachmentRefs || []),
    },
  });

  const validation = validateTurnExecutionSnapshotV1(snapshot);
  const references = assertSnapshotReferences(snapshot, characters);
  const errors = [...recordErrors, ...validation.errors, ...references.errors];
  if (errors.length) return { ok: false, errors };
  return { ok: true, snapshot: deepFreeze(snapshot) };
}
