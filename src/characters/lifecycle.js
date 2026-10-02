/**
 * Character copy / delete / tombstone / export privacy.
 */

import { exportCharacterWithoutPrivate } from "./editor-sections.js";
import { createRevisionRepository } from "./revision-repository.js";

export function tombstoneCharacter(record, at = new Date().toISOString()) {
  return {
    ...record,
    deletedAt: at,
    tombstone: true,
    profile: record.profile,
  };
}

export function copyCharacter(record, nextId) {
  const copy = exportCharacterWithoutPrivate(record);
  copy.id = nextId;
  copy.name = `${record.name || "角色"} 副本`;
  copy.revision = 1;
  copy.copiedFromId = record.id;
  delete copy.deletedAt;
  delete copy.tombstone;
  return copy;
}

export function overwriteCreatesRevision(previous, next, repo = createRevisionRepository()) {
  if (previous?.id) repo.snapshot(previous, "overwrite");
  return next;
}

export function exportPrivacyScan(payload) {
  const json = JSON.stringify(payload);
  const forbidden = ["userId", "conversations", "memories", "wallet", "apiKey", "password", "billing"];
  return {
    ok: forbidden.every((key) => !Object.prototype.hasOwnProperty.call(payload, key) && !json.includes(`"${key}"`)),
    forbiddenHits: forbidden.filter((key) => json.includes(`"${key}"`)),
  };
}
