const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const CERT_SHA256_RE = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;

function updateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function decodeBase64(value) {
  const binary = globalThis.atob(String(value || ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function publicKeyBytes(publicKeyPem) {
  const body = String(publicKeyPem || "")
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  if (!body) throw updateError("update_public_key_missing", "Update verification public key is missing.");
  try {
    return decodeBase64(body);
  } catch {
    throw updateError("update_public_key_invalid", "Update verification public key is invalid.");
  }
}

function requireSubtleCrypto() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw updateError("update_crypto_unavailable", "This runtime cannot verify signed updates.");
  }
  return subtle;
}

export async function updatePublicKeyId(publicKeyPem) {
  const subtle = requireSubtleCrypto();
  const digest = await subtle.digest("SHA-256", publicKeyBytes(publicKeyPem));
  return encodeHex(digest).slice(0, 32);
}

function validatePayload(payload, allowedDownloadHosts) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw updateError("update_manifest_invalid", "Signed update payload is invalid.");
  }
  if (Number(payload.schemaVersion) !== 2) {
    throw updateError("update_manifest_invalid", "Signed update manifest schema is unsupported.");
  }
  for (const field of ["latestVersion", "minimumVersion"]) {
    if (!VERSION_RE.test(String(payload[field] || ""))) {
      throw updateError("update_manifest_invalid", `${field} is invalid.`);
    }
  }
  let downloadUrl;
  try {
    downloadUrl = new URL(String(payload.downloadUrl || ""));
  } catch {
    throw updateError("update_manifest_invalid", "Update download URL is invalid.");
  }
  if (downloadUrl.protocol !== "https:") {
    throw updateError("update_manifest_invalid", "Update download URL must use HTTPS.");
  }
  const allowedHosts = new Set(
    (Array.isArray(allowedDownloadHosts) ? allowedDownloadHosts : [])
      .map((host) => String(host || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (!allowedHosts.has(downloadUrl.hostname.toLowerCase())) {
    throw updateError("update_download_host_forbidden", "Update download host is not trusted.");
  }
  if (
    !payload.apk
    || !SHA256_RE.test(String(payload.apk.sha256 || "").toLowerCase())
    || !Number.isSafeInteger(payload.apk.size)
    || payload.apk.size <= 0
    || !CERT_SHA256_RE.test(String(payload.apk.certificateSha256 || "").toUpperCase())
  ) {
    throw updateError("update_manifest_invalid", "APK integrity metadata is invalid.");
  }
  return {
    ...payload,
    downloadUrl: downloadUrl.href,
    apk: {
      ...payload.apk,
      sha256: String(payload.apk.sha256).toLowerCase(),
      certificateSha256: String(payload.apk.certificateSha256).toUpperCase(),
    },
  };
}

export async function verifySignedUpdateManifest(envelope, {
  publicKeyPem,
  allowedDownloadHosts = [],
} = {}) {
  const payload = validatePayload(envelope?.payload, allowedDownloadHosts);
  const signature = envelope?.signature;
  if (
    !signature
    || signature.algorithm !== "Ed25519"
    || typeof signature.keyId !== "string"
    || typeof signature.value !== "string"
  ) {
    throw updateError("update_manifest_invalid", "Update manifest signature metadata is invalid.");
  }

  const subtle = requireSubtleCrypto();
  const spki = publicKeyBytes(publicKeyPem);
  const expectedKeyId = await updatePublicKeyId(publicKeyPem);
  if (signature.keyId !== expectedKeyId) {
    throw updateError("update_key_mismatch", "Update manifest was signed by an unexpected key.");
  }
  let signatureBytes;
  try {
    signatureBytes = decodeBase64(signature.value);
  } catch {
    throw updateError("update_signature_invalid", "Update manifest signature is invalid.");
  }
  const key = await subtle.importKey("spki", spki, { name: "Ed25519" }, false, ["verify"]);
  const valid = await subtle.verify(
    { name: "Ed25519" },
    key,
    signatureBytes,
    new TextEncoder().encode(canonicalJson(envelope.payload)),
  );
  if (!valid) {
    throw updateError("update_signature_invalid", "Update manifest signature verification failed.");
  }
  return payload;
}
