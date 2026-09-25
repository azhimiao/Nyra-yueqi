import { modelServiceUrl, safeFetch, fetchJson } from "../lib/utils.js";
import { SYNC_PAYLOAD_VERSION } from "../constants.js";
import { scrubExportPayload } from "../memory/privacy.js";
import {
  uploadNyraCloudArchive,
  downloadNyraCloudArchive,
  restoreCloudThroughNyraPipeline,
} from "../portability/cloud/bridge.js";

export async function fetchSyncStatus(token) {
  if (!token || token.startsWith("local-")) return { hasPayload: false };
  return safeFetch(modelServiceUrl("/sync/status"), {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function downloadCloudPayload(token) {
  if (!token || token.startsWith("local-")) {
    throw new Error("offline account");
  }
  return safeFetch(modelServiceUrl("/sync/download"), {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** @deprecated Prefer uploadNyraCloudArchive — kept for legacy callers. */
export async function uploadCloudPayload(token, payload) {
  if (!token || token.startsWith("local-")) {
    throw new Error("offline account");
  }
  return fetchJson(modelServiceUrl("/sync/upload"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      format: "legacy-json",
      version: SYNC_PAYLOAD_VERSION,
      payload,
      exportedAt: payload.exportedAt || new Date().toISOString(),
    }),
  });
}

export {
  uploadNyraCloudArchive,
  downloadNyraCloudArchive,
  restoreCloudThroughNyraPipeline,
};

let autoSyncTimer = null;

export function scheduleAutoSync(callback, delayMs = 30000) {
  if (autoSyncTimer) window.clearTimeout(autoSyncTimer);
  autoSyncTimer = window.setTimeout(() => {
    callback().catch(() => {});
  }, delayMs);
}

export function cancelAutoSync() {
  if (autoSyncTimer) window.clearTimeout(autoSyncTimer);
  autoSyncTimer = null;
}

export function stripSecretsFromPayload(payload) {
  return scrubExportPayload(payload);
}
