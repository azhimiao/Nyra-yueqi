/**
 * Cloud backup bridge — upload/download the same .nyra ciphertext.
 * Legacy JSON payloads remain readable through the shared importer.
 */

import { modelServiceUrl, safeFetch, fetchJson } from "../../lib/utils.js";
import { SYNC_PAYLOAD_VERSION } from "../../constants.js";
import { sha256Hex } from "../hash.js";
import { PortabilityError } from "../errors.js";
import { prepareNyraImport, buildImportPlan, commitNyraImport } from "../nyra/importer.js";

function bytesToBase64(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (typeof Buffer !== "undefined") return Buffer.from(buf).toString("base64");
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(String(base64 || ""), "base64"));
  const binary = atob(String(base64 || ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * @param {string} token
 * @param {Uint8Array} nyraBytes
 * @param {{ archiveId?: string, exportedAt?: string, version?: number }} [meta]
 */
export async function uploadNyraCloudArchive(token, nyraBytes, meta = {}) {
  if (!token || token.startsWith("local-")) throw new Error("offline account");
  const archiveBase64 = bytesToBase64(nyraBytes);
  const digest = await sha256Hex(nyraBytes);
  return fetchJson(modelServiceUrl("/sync/upload"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      format: "nyra-v1",
      version: meta.version ?? SYNC_PAYLOAD_VERSION,
      archiveBase64,
      archiveId: meta.archiveId || "",
      sha256: digest,
      exportedAt: meta.exportedAt || new Date().toISOString(),
    }),
  });
}

/**
 * Download cloud snapshot and normalize to bytes or legacy payload.
 * @param {string} token
 */
export async function downloadNyraCloudArchive(token) {
  if (!token || token.startsWith("local-")) throw new Error("offline account");
  const remote = await safeFetch(modelServiceUrl("/sync/download"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!remote) throw new PortabilityError("archive_incompatible", "empty_cloud");

  if (remote.format === "nyra-v1" && remote.archiveBase64) {
    const bytes = base64ToBytes(remote.archiveBase64);
    if (remote.sha256) {
      const actual = await sha256Hex(bytes);
      if (actual !== remote.sha256) {
        throw new PortabilityError("archive_checksum_mismatch", "cloud");
      }
    }
    return {
      kind: "nyra",
      bytes,
      updatedAt: remote.updatedAt,
      version: remote.version,
      archiveId: remote.archiveId,
    };
  }

  if (remote.payload) {
    return {
      kind: "legacy-json",
      payload: remote.payload,
      updatedAt: remote.updatedAt,
      version: remote.version,
    };
  }

  return { kind: "empty", updatedAt: remote.updatedAt || null, version: remote.version || 0 };
}

/**
 * Restore cloud snapshot through the same importer as local .nyra files.
 */
export async function restoreCloudThroughNyraPipeline(token, deps, opts = {}) {
  const remote = await downloadNyraCloudArchive(token);
  if (remote.kind === "empty") throw new Error("云端没有可恢复的备份。");

  const input = remote.kind === "nyra" ? remote.bytes : remote.payload;
  const prepared = await prepareNyraImport(input, { passphrase: opts.passphrase ?? "" });
  const current = deps.captureCurrentWorld ? await deps.captureCurrentWorld() : null;
  const plan = buildImportPlan(prepared, opts.mode || "replace", current);
  const result = await commitNyraImport(plan, deps);
  return { ...result, updatedAt: remote.updatedAt, cloudKind: remote.kind };
}
