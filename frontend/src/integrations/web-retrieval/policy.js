/**
 * Web retrieval product policy (plan §11.3).
 * - Only explicit user queries may hit the network.
 * - Results default to turn-scoped / research artifact — NOT stable memory.
 * - User-save → Sourced Artifact only.
 */

import { createWebEvidenceV1, validateWebEvidenceV1 } from "../../contracts/web-evidence-v1.js";

/**
 * @param {{ query?: string, explicit?: boolean, kind?: string }} input
 */
export function mayRequestWeb(input = {}) {
  const query = String(input.query || "").trim();
  if (!query) {
    return { ok: false, reason: "empty_query" };
  }
  if (input.explicit === false) {
    return { ok: false, reason: "not_explicit" };
  }
  // Default: treat callers that omit explicit as allowed only when kind is explicit search/weather
  if (input.explicit !== true && input.kind !== "weather" && input.kind !== "search") {
    return { ok: false, reason: "not_explicit" };
  }
  return { ok: true, query };
}

/**
 * Default memory write policy for web results.
 */
export function memoryWritePolicy() {
  return Object.freeze({
    writeStableMemory: false,
    writeTimeline: false,
    writePalaceAuthority: false,
    saveAsArtifactRequiresUserConfirm: true,
    distinguishFromUserMemory: true,
  });
}

/**
 * Build a Sourced Artifact payload from WebEvidence (user-save path only).
 * Does not persist — caller must confirm then write via task-store.
 *
 * @param {object[]} evidenceList
 * @param {{ query?: string, characterId?: string, title?: string }} [opts]
 */
export function buildSourcedArtifact(evidenceList, opts = {}) {
  const list = Array.isArray(evidenceList) ? evidenceList : [];
  const validated = [];
  for (const raw of list) {
    const ev = raw?.schemaVersion ? raw : createWebEvidenceV1(raw || {});
    const check = validateWebEvidenceV1(ev);
    if (!check.ok) continue;
    validated.push(ev);
  }
  if (!validated.length) {
    return { ok: false, reason: "no_valid_evidence", artifact: null };
  }
  const query = String(opts.query || validated[0].query || "").trim();
  const title = String(opts.title || `联网资料：${query}`).slice(0, 120);
  return {
    ok: true,
    artifact: {
      kind: "sourced_web_artifact",
      title,
      characterId: String(opts.characterId || ""),
      query,
      sources: validated,
      body: validated
        .map((e) => `• ${e.title}\n  ${e.url}\n  ${e.excerpt}\n  fetchedAt=${e.fetchedAt}`)
        .join("\n\n"),
      memoryPolicy: memoryWritePolicy(),
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Hard gate: a web completion must carry ≥1 valid WebEvidence.
 * @param {object[]} evidenceList
 */
export function requireWebEvidenceSources(evidenceList) {
  const list = Array.isArray(evidenceList) ? evidenceList : [];
  if (!list.length) {
    return { ok: false, reason: "no_source", evidence: [] };
  }
  const valid = [];
  for (const raw of list) {
    const check = validateWebEvidenceV1(raw);
    if (check.ok) valid.push(raw);
  }
  if (!valid.length) {
    return { ok: false, reason: "no_valid_web_evidence", evidence: [] };
  }
  return { ok: true, evidence: valid };
}
