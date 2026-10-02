/** Open-source tree: cloud backup upload and download are removed. */

export async function fetchSyncStatus() {
  return { ok: false, skipped: true };
}

export async function downloadCloudPayload() {
  return { ok: false, skipped: true };
}

export async function uploadCloudPayload() {
  return { ok: false, skipped: true };
}

export async function uploadNyraCloudArchive() {
  return { ok: false, skipped: true };
}

export async function downloadNyraCloudArchive() {
  return { ok: false, skipped: true };
}

export async function restoreCloudThroughNyraPipeline() {
  return { ok: false, skipped: true };
}

export function scheduleAutoSync() {}

export function cancelAutoSync() {}

export function stripSecretsFromPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  delete next.token;
  delete next.apiKey;
  delete next.password;
  return next;
}
