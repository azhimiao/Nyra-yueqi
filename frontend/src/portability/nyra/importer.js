/**
 * Staged atomic .nyra / legacy import with merge|replace and rollback.
 *
 * Flow: parse/migrate → plan → capture restore point → commit → refresh
 * On commit failure: restore from in-memory restore point.
 */

import { persistMediaBytes } from "../../platform/media-files.js";
import { scrubExportPayload } from "../../memory/privacy.js";
import { PortabilityError } from "../errors.js";
import { parseNyraArchive } from "./parser.js";
import { detectLegacyBackup, migrateLegacyBackup } from "./legacy.js";
import { mergeUserWorld } from "./merge.js";
import { looksLikeNyraEnvelope } from "../crypto.js";

/**
 * Prepare an import package from file bytes / JSON without writing live stores.
 * @param {Uint8Array|ArrayBuffer|object|string} input
 * @param {{ passphrase?: string, fileName?: string }} [opts]
 */
export async function prepareNyraImport(input, opts = {}) {
  const detected = detectLegacyBackup(input, { fileName: opts.fileName });

  if (detected.kind === "nyra" || (input instanceof Uint8Array && looksLikeNyraEnvelope(input))) {
    const parsed = await parseNyraArchive(toBytes(input), { passphrase: opts.passphrase });
    return {
      ...parsed,
      modeOptions: ["merge", "replace"],
      ready: true,
    };
  }

  if (detected.kind === "legacy-json" || detected.kind === "legacy-zip") {
    const migrated = migrateLegacyBackup(input, { fileName: opts.fileName });
    return {
      ...migrated,
      modeOptions: ["merge", "replace"],
      ready: true,
    };
  }

  throw new PortabilityError("archive_incompatible", detected.kind);
}

/**
 * Build a user-facing import plan after prepare.
 * @param {object} prepared
 * @param {"merge"|"replace"} mode
 * @param {object} [currentSnapshot] optional current world for merge conflict preview
 */
export function buildImportPlan(prepared, mode = "replace", currentSnapshot = null) {
  if (mode !== "merge" && mode !== "replace") {
    throw new PortabilityError("archive_incompatible", "bad_mode");
  }

  const incomingWorld = materializeWorld(prepared);
  let conflicts = [];
  let merged = incomingWorld;
  if (mode === "merge" && currentSnapshot) {
    const outcome = mergeUserWorld(currentSnapshot, incomingWorld, { mode: "merge" });
    merged = outcome.result;
    conflicts = outcome.conflicts;
  }

  return {
    mode,
    preview: prepared.preview,
    warnings: prepared.warnings || [],
    conflicts,
    characterCount: prepared.preview?.characterCount || 0,
    resourceCount: (prepared.resources || prepared.legacyMedia || []).length,
    world: merged,
    prepared,
  };
}

/**
 * Commit import atomically relative to provided restore handlers.
 * @param {object} plan from buildImportPlan
 * @param {object} deps restore handlers (+ optional captureCurrentWorld / exportRestorePoint)
 */
export async function commitNyraImport(plan, deps) {
  if (!plan?.world || !deps) throw new PortabilityError("archive_commit_failed", "missing_plan");

  const restorePoint = await captureRestorePoint(deps);
  let committed = false;

  try {
    if (plan.mode === "replace") {
      await applyWorldReplace(plan.world, plan.prepared, deps);
    } else {
      await applyWorldReplace(plan.world, plan.prepared, deps);
    }
    committed = true;

    try {
      await deps.afterCommit?.({ plan });
    } catch (err) {
      // Projection rebuild failure does not roll back authorities.
      return {
        ok: true,
        committed: true,
        rebuildWarning: String(err?.message || err),
        preview: plan.preview,
      };
    }

    return { ok: true, committed: true, preview: plan.preview, warnings: plan.warnings };
  } catch (err) {
    if (!committed && restorePoint) {
      try {
        await restoreFromPoint(restorePoint, deps);
      } catch (rollbackErr) {
        throw new PortabilityError(
          "archive_commit_failed",
          `rollback_failed:${rollbackErr?.message || rollbackErr}`,
          { cause: err },
        );
      }
    }
    if (err instanceof PortabilityError) throw err;
    throw new PortabilityError("archive_commit_failed", String(err?.message || err), { cause: err });
  }
}

/**
 * One-shot helper: prepare → plan → commit.
 */
export async function importNyraArchive(input, deps, opts = {}) {
  const prepared = await prepareNyraImport(input, opts);
  const current = opts.currentSnapshot || (deps.captureCurrentWorld ? await deps.captureCurrentWorld() : null);
  const plan = buildImportPlan(prepared, opts.mode || "replace", current);
  if (opts.dryRun) return { ok: true, dryRun: true, plan };
  return commitNyraImport(plan, deps);
}

function materializeWorld(prepared) {
  if (prepared.kind === "legacy") {
    return structuredClone(prepared.userData);
  }
  const characters = Object.values(prepared.characters || {});
  return {
    ...structuredClone(prepared.userData || {}),
    settings: structuredClone(prepared.settings || prepared.userData?.settings || {}),
    characters,
  };
}

async function captureRestorePoint(deps) {
  if (typeof deps.captureRestorePoint === "function") {
    return deps.captureRestorePoint();
  }
  if (typeof deps.exportLocalPayload === "function") {
    const payload = scrubExportPayload(await deps.exportLocalPayload());
    let media = [];
    if (deps.getAllRecords && deps.readMediaBytes) {
      const records = await deps.getAllRecords("media");
      for (const record of records || []) {
        const bytes = await deps.readMediaBytes(record);
        if (!bytes?.length) continue;
        media.push({
          id: record.id,
          bytes,
          type: record.type || "application/octet-stream",
          name: record.name || record.id,
          kind: record.kind || "file",
          createdAt: record.createdAt || new Date().toISOString(),
          filePath: record.filePath || "",
        });
      }
    }
    return { payload, media };
  }
  return null;
}

async function restoreFromPoint(point, deps) {
  if (!point?.payload) return;
  // Use a dedicated rollback apply that does not nest another restore-point capture.
  await applyWorldReplace(point.payload, {
    kind: "legacy",
    legacyMedia: point.media || [],
    resources: [],
  }, deps, { isRollback: true });
}

async function applyWorldReplace(world, prepared, deps, opts = {}) {
  // Preserve live auth/session — never overwrite from archive.
  const liveEco = deps.getEcosystemState?.() || {};
  const liveToken = liveEco.token || "";

  await applyPayloadThroughHandlers(world, deps, { preserveToken: liveToken });

  // Media
  if (deps.clearStore && deps.storeRecord) {
    const mediaItems = [];
    if (prepared.kind === "legacy" && Array.isArray(prepared.legacyMedia)) {
      for (const item of prepared.legacyMedia) mediaItems.push(item);
    } else if (Array.isArray(prepared.resources)) {
      for (const resource of prepared.resources) {
        const legacyId = resource.metadata?.extensions?.legacyMediaId
          || resource.legacyMediaId
          || resource.sha256
          || resource.metadata?.id?.replace(/^sha256:/, "");
        if (!legacyId || !resource.bytes?.length) continue;
        mediaItems.push({
          id: String(legacyId).replace(/[^\w.-]/g, "_").slice(0, 120),
          bytes: resource.bytes,
          type: resource.mediaType || resource.metadata?.original?.mediaType || "application/octet-stream",
          name: resource.metadata?.title || resource.metadata?.original?.filename || legacyId,
          kind: resource.metadata?.extensions?.legacyKind || "file",
          createdAt: resource.metadata?.importedAt || new Date().toISOString(),
        });
      }
    }

    if (mediaItems.length || prepared.kind === "nyra" || opts.isRollback) {
      await deps.clearStore("media");
      for (const item of mediaItems) {
        const filePath = await persistMediaBytes(item.id, item.bytes, item.type);
        const blob = filePath ? null : new Blob([item.bytes], { type: item.type });
        await deps.storeRecord("media", {
          id: item.id,
          kind: item.kind || "file",
          name: item.name || item.id,
          type: item.type,
          size: item.bytes.length,
          createdAt: item.createdAt || new Date().toISOString(),
          filePath: filePath || item.filePath || "",
          blob,
        });
      }
    }
  }
}

/**
 * Apply payload fields using the same module importers as legacy restore,
 * but invoked only after staging/validation succeeded.
 */
async function applyPayloadThroughHandlers(payload, deps, opts = {}) {
  // Delegate to existing restoreImportPayload for module coverage, after scrubbing secrets.
  // Atomicity is provided by restore-point rollback in commitNyraImport.
  const { restoreImportPayload } = await import("../../memory/backup.js");
  const safe = scrubExportPayload(structuredClone(payload));
  if (safe.ecosystem) safe.ecosystem.token = "";
  await restoreImportPayload(safe, deps);
  if (opts.preserveToken && deps.getEcosystemState && deps.saveEcosystemState) {
    const current = deps.getEcosystemState();
    deps.saveEcosystemState({ ...current, token: opts.preserveToken });
  }
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input || []);
}
