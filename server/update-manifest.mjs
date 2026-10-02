const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const CERT_SHA256_RE = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;
const KEY_ID_RE = /^[a-f0-9]{32}$/;

function versionParts(value) {
  return String(value).split("-", 1)[0].split(".").map(Number);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function requiredVersion(value, field) {
  const normalized = String(value || "").trim().replace(/^v/i, "");
  if (!VERSION_RE.test(normalized)) throw new TypeError(`${field} is invalid`);
  return normalized;
}

export function normalizeUpdateManifest(input) {
  const payload = input?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("payload is invalid");
  }
  if (Number(payload.schemaVersion) !== 2) {
    throw new TypeError("schemaVersion is invalid");
  }
  const latestVersion = requiredVersion(payload.latestVersion, "latestVersion");
  const minimumVersion = requiredVersion(payload.minimumVersion, "minimumVersion");
  if (compareVersions(minimumVersion, latestVersion) > 0) {
    throw new TypeError("minimumVersion cannot exceed latestVersion");
  }
  let downloadUrl;
  try {
    downloadUrl = new URL(String(payload.downloadUrl || ""));
  } catch {
    throw new TypeError("downloadUrl is invalid");
  }
  if (
    downloadUrl.protocol !== "https:"
    || downloadUrl.hostname.toLowerCase() !== "download.memprism.com"
  ) {
    throw new TypeError("downloadUrl must use the trusted HTTPS release host");
  }
  const apkSha256 = String(payload.apk?.sha256 || "").toLowerCase();
  const apkSize = Number(payload.apk?.size);
  const certificateSha256 = String(payload.apk?.certificateSha256 || "").toUpperCase();
  if (
    !SHA256_RE.test(apkSha256)
    || !Number.isSafeInteger(apkSize)
    || apkSize <= 0
    || !CERT_SHA256_RE.test(certificateSha256)
  ) {
    throw new TypeError("apk integrity metadata is invalid");
  }
  const signature = input?.signature;
  if (
    signature?.algorithm !== "Ed25519"
    || !KEY_ID_RE.test(String(signature?.keyId || ""))
    || !String(signature?.value || "").trim()
  ) {
    throw new TypeError("signature metadata is invalid");
  }
  return {
    payload: {
      schemaVersion: 2,
      channel: String(payload.channel || "stable").slice(0, 32),
      latestVersion,
      minimumVersion,
      mandatory: payload.mandatory === true,
      downloadUrl: downloadUrl.href,
      publishedAt: String(payload.publishedAt || new Date().toISOString()),
      apk: {
        sha256: apkSha256,
        size: apkSize,
        certificateSha256,
      },
      notes: {
        "zh-CN": String(payload.notes?.["zh-CN"] || "").slice(0, 4000),
        en: String(payload.notes?.en || "").slice(0, 4000),
      },
    },
    signature: {
      algorithm: "Ed25519",
      keyId: String(signature.keyId),
      value: String(signature.value),
    },
  };
}
