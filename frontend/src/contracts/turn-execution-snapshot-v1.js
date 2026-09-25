/**
 * TurnExecutionSnapshotV1 — immutable per-turn compile authority (§5.3).
 * create() freezes; validate() accepts plain stored objects (frozen not required).
 */

import { mintId } from "./ids.js";
import {
  COMPANION_V2_LIMITS as L,
  checkArray,
  checkId,
  checkNumber,
  checkObject,
  checkPlainObject,
  checkSchemaAndRevision,
  checkString,
  checkStringArray,
  checkTopLevel,
  error,
  isPlainObject,
  result,
  shallowFreeze,
  stableHash,
} from "./companion-v2-shared.js";

export const TURN_EXECUTION_SNAPSHOT_V1_SCHEMA_VERSION = 1;

const ALLOWED = Object.freeze([
  "schemaVersion",
  "revision",
  "turnExecutionId",
  "conversationId",
  "sessionId",
  "conversationRevision",
  "speakerCharacterId",
  "participants",
  "userId",
  "relationshipScope",
  "preferenceRevision",
  "locale",
  "conversationLanguage",
  "preset",
  "promptSettings",
  "budgetProfile",
  "cutoverProfile",
  "providerCapabilities",
  "runtimeCapabilities",
  "temporalSnapshot",
  "historyBoundaryIds",
  "currentInput",
  "characterRevisions",
  "frozen",
  "snapshotHash",
]);

function participantErrors(list) {
  const errors = checkArray(list, "participants", { min: 1, max: L.participantsMax });
  if (errors.length || !Array.isArray(list)) return errors;
  list.forEach((item, index) => {
    const path = `participants[${index}]`;
    if (!isPlainObject(item)) {
      errors.push(error("invalid_type", path));
      return;
    }
    errors.push(...checkId(item.characterId, `${path}.characterId`));
    if (!Number.isInteger(item.revision) || item.revision < 1) {
      errors.push(error("invalid_revision", `${path}.revision`));
    }
  });
  return errors;
}

function derivedRevisions(participants) {
  const out = {};
  if (!Array.isArray(participants)) return out;
  for (const item of participants) {
    if (isPlainObject(item) && typeof item.characterId === "string" && item.characterId.trim()) {
      out[item.characterId] = item.revision;
    }
  }
  return out;
}

export function validateTurnExecutionSnapshotV1(raw) {
  const objectError = checkObject(raw);
  if (objectError) return objectError;
  const errors = [
    ...checkTopLevel(raw, ALLOWED),
    ...checkSchemaAndRevision(raw, TURN_EXECUTION_SNAPSHOT_V1_SCHEMA_VERSION),
    ...checkId(raw.turnExecutionId, "turnExecutionId"),
    ...checkId(raw.conversationId, "conversationId"),
    ...checkId(raw.sessionId, "sessionId"),
    ...checkId(raw.speakerCharacterId, "speakerCharacterId"),
    ...checkId(raw.userId, "userId"),
    ...checkString(raw.relationshipScope, "relationshipScope", { nonEmpty: true, max: L.relationshipScope }),
    ...checkString(raw.locale, "locale", { nonEmpty: true, max: L.locale }),
    ...checkString(raw.conversationLanguage, "conversationLanguage", { nonEmpty: true, max: L.conversationLanguage }),
    ...checkString(raw.cutoverProfile, "cutoverProfile", { nonEmpty: true, max: L.cutoverProfile }),
    ...checkString(raw.snapshotHash, "snapshotHash", { nonEmpty: true, max: 128 }),
    ...checkNumber(raw.conversationRevision, "conversationRevision", { integer: true, min: 1 }),
    ...checkNumber(raw.preferenceRevision, "preferenceRevision", { integer: true, min: 1 }),
    ...checkPlainObject(raw.promptSettings, "promptSettings"),
    ...checkPlainObject(raw.budgetProfile, "budgetProfile"),
    ...checkPlainObject(raw.providerCapabilities, "providerCapabilities"),
    ...checkPlainObject(raw.runtimeCapabilities, "runtimeCapabilities"),
    ...checkStringArray(raw.historyBoundaryIds, "historyBoundaryIds", { max: L.historyBoundaryIdsMax, maxItem: 200 }),
    ...participantErrors(raw.participants),
  ];

  if (raw.temporalSnapshot !== null && raw.temporalSnapshot !== undefined) {
    errors.push(...checkPlainObject(raw.temporalSnapshot, "temporalSnapshot"));
  }

  if (raw.preset === undefined) errors.push(error("missing_field", "preset"));
  else if (!isPlainObject(raw.preset)) errors.push(error("invalid_type", "preset"));
  else {
    errors.push(...checkId(raw.preset.id, "preset.id"));
    if (!Number.isInteger(raw.preset.revision) || raw.preset.revision < 1) {
      errors.push(error("invalid_revision", "preset.revision"));
    }
  }

  if (raw.currentInput === undefined) errors.push(error("missing_field", "currentInput"));
  else if (!isPlainObject(raw.currentInput)) errors.push(error("invalid_type", "currentInput"));
  else {
    errors.push(...checkString(raw.currentInput.text, "currentInput.text", { max: 64000 }));
    errors.push(
      ...checkStringArray(raw.currentInput.attachmentRefs, "currentInput.attachmentRefs", {
        max: L.attachmentRefsMax,
        maxItem: 500,
      }),
    );
  }

  if (raw.characterRevisions === undefined) errors.push(error("missing_field", "characterRevisions"));
  else if (!isPlainObject(raw.characterRevisions)) errors.push(error("invalid_type", "characterRevisions"));
  else if (Array.isArray(raw.participants)) {
    const expected = derivedRevisions(raw.participants);
    for (const [characterId, revision] of Object.entries(expected)) {
      if (raw.characterRevisions[characterId] !== revision) {
        errors.push(error("invalid_revision", `characterRevisions.${characterId}`));
      }
    }
    for (const characterId of Object.keys(raw.characterRevisions)) {
      if (!Object.prototype.hasOwnProperty.call(expected, characterId)) {
        errors.push(error("invalid_id", `characterRevisions.${characterId}`));
      }
    }
  }

  if (Array.isArray(raw.participants) && raw.participants.length) {
    const speakerKnown = raw.participants.some(
      (item) => isPlainObject(item) && item.characterId === raw.speakerCharacterId,
    );
    if (raw.speakerCharacterId && !speakerKnown) {
      errors.push(error("invalid_id", "speakerCharacterId"));
    }
  }

  return result(errors);
}

function hashableSnapshot(record) {
  const { frozen, snapshotHash, ...rest } = record;
  return rest;
}

export function createTurnExecutionSnapshotV1(input = {}) {
  const src = isPlainObject(input) ? input : {};
  const participants = Array.isArray(src.participants)
    ? src.participants.map((item) => ({
      characterId: String(item?.characterId || "").trim(),
      revision: Number.isInteger(item?.revision) && item.revision >= 1 ? item.revision : 1,
    }))
    : [];
  const characterRevisions = isPlainObject(src.characterRevisions)
    ? { ...derivedRevisions(participants), ...src.characterRevisions }
    : derivedRevisions(participants);
  const preset = isPlainObject(src.preset) ? src.preset : {};
  const currentInput = isPlainObject(src.currentInput) ? src.currentInput : {};

  const record = {
    schemaVersion: TURN_EXECUTION_SNAPSHOT_V1_SCHEMA_VERSION,
    revision: Number.isInteger(src.revision) && src.revision >= 1 ? src.revision : 1,
    turnExecutionId: String(src.turnExecutionId || "").trim() || mintId("turnExecutionId"),
    conversationId: String(src.conversationId || "").trim(),
    sessionId: String(src.sessionId || "").trim(),
    conversationRevision: Number.isInteger(src.conversationRevision) && src.conversationRevision >= 1
      ? src.conversationRevision
      : 1,
    speakerCharacterId: String(src.speakerCharacterId || "").trim(),
    participants,
    userId: String(src.userId || "").trim(),
    relationshipScope: String(src.relationshipScope || "").trim() || "dm",
    preferenceRevision: Number.isInteger(src.preferenceRevision) && src.preferenceRevision >= 1
      ? src.preferenceRevision
      : 1,
    locale: String(src.locale || "").trim() || "zh-CN",
    conversationLanguage: String(src.conversationLanguage || "").trim() || "zh-CN",
    preset: {
      id: String(preset.id || "").trim(),
      revision: Number.isInteger(preset.revision) && preset.revision >= 1 ? preset.revision : 1,
    },
    promptSettings: isPlainObject(src.promptSettings) ? { ...src.promptSettings } : {},
    budgetProfile: isPlainObject(src.budgetProfile) ? { ...src.budgetProfile } : {},
    cutoverProfile: String(src.cutoverProfile || "").trim(),
    providerCapabilities: isPlainObject(src.providerCapabilities) ? { ...src.providerCapabilities } : {},
    runtimeCapabilities: isPlainObject(src.runtimeCapabilities) ? { ...src.runtimeCapabilities } : {},
    temporalSnapshot: src.temporalSnapshot === null
      ? null
      : isPlainObject(src.temporalSnapshot)
        ? { ...src.temporalSnapshot }
        : null,
    historyBoundaryIds: Array.isArray(src.historyBoundaryIds)
      ? src.historyBoundaryIds.map((item) => String(item))
      : [],
    currentInput: {
      text: String(currentInput.text ?? ""),
      attachmentRefs: Array.isArray(currentInput.attachmentRefs)
        ? currentInput.attachmentRefs.map((item) => String(item))
        : [],
    },
    characterRevisions,
    frozen: true,
    snapshotHash: "",
  };
  record.snapshotHash = stableHash(hashableSnapshot(record));
  return shallowFreeze(record, ["participants", "preset", "currentInput", "characterRevisions"]);
}

/**
 * Fail closed if speaker/participants are missing from records or revision mismatches.
 * Never silently substitutes another character.
 */
export function assertSnapshotReferences(snapshot, records) {
  const errors = [];
  if (!isPlainObject(snapshot)) return { ok: false, errors: [error("not_object", "$")] };
  const list = Array.isArray(records) ? records : [];
  const byId = new Map();
  for (const record of list) {
    const id = String(record?.characterId || record?.id || "").trim();
    if (id) byId.set(id, record);
  }
  const needed = [];
  if (snapshot.speakerCharacterId) needed.push({ characterId: snapshot.speakerCharacterId, path: "speakerCharacterId" });
  if (Array.isArray(snapshot.participants)) {
    snapshot.participants.forEach((item, index) => {
      needed.push({
        characterId: item?.characterId,
        revision: item?.revision,
        path: `participants[${index}]`,
      });
    });
  }
  for (const item of needed) {
    const id = String(item.characterId || "").trim();
    const found = byId.get(id);
    if (!found) {
      errors.push(error("invalid_id", item.path));
      continue;
    }
    const expectedRevision = item.revision ?? snapshot.characterRevisions?.[id];
    const actualRevision = found.revision;
    if (
      expectedRevision !== undefined
      && actualRevision !== undefined
      && actualRevision !== expectedRevision
    ) {
      errors.push(error("invalid_revision", item.path));
    }
  }
  return result(errors);
}
