import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";

import { canonicalJson } from "../../src/update/update-signature.mjs";

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const CERT_SHA256_RE = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;

export function semverToVersionCode(version) {
  const match = String(version || "").trim().match(VERSION_RE);
  if (!match) throw new TypeError("Android release version must be SemVer.");
  const [, majorRaw, minorRaw, patchRaw] = match;
  const major = Number(majorRaw);
  const minor = Number(minorRaw);
  const patch = Number(patchRaw);
  if (major > 2_147 || minor > 999 || patch > 999) {
    throw new RangeError("Android release version components exceed versionCode limits.");
  }
  const code = major * 1_000_000 + minor * 1_000 + patch;
  if (!Number.isSafeInteger(code) || code <= 0 || code > 2_147_483_647) {
    throw new RangeError("Android release version cannot produce a valid versionCode.");
  }
  return code;
}

export function parseReleaseEnv(source) {
  const result = {};
  for (const rawLine of String(source || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) throw new TypeError(`Invalid release.env line: ${rawLine}`);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new TypeError(`Invalid release.env key: ${key}`);
    if (value.startsWith("\"")) {
      value = JSON.parse(value);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function publicKeyId(publicKeyPem) {
  const publicKey = publicKeyPem?.type === "public"
    ? publicKeyPem
    : createPublicKey(publicKeyPem);
  const spki = publicKey.export({ format: "der", type: "spki" });
  return createHash("sha256").update(spki).digest("hex").slice(0, 32);
}

function requireVersion(value, field) {
  const version = String(value || "").trim();
  if (!VERSION_RE.test(version)) throw new TypeError(`${field} must be SemVer.`);
  return version;
}

function requireTrustedDownloadUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "download.memprism.com") {
    throw new TypeError("downloadUrl must use https://download.memprism.com.");
  }
  return url.href;
}

export function normalizeCertificateSha256(value) {
  const compact = String(value || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (compact.length !== 64) throw new TypeError("Android certificate SHA-256 is invalid.");
  const formatted = compact.match(/.{2}/g).join(":");
  if (!CERT_SHA256_RE.test(formatted)) throw new TypeError("Android certificate SHA-256 is invalid.");
  return formatted;
}

export function buildSignedManifest({
  version,
  minimumVersion,
  mandatory = false,
  downloadUrl,
  apkSha256,
  apkSize,
  certificateSha256,
  notesZh = "",
  notesEn = "",
  publishedAt = new Date().toISOString(),
  privateKeyPem,
  privateKeyPassphrase,
  publicKeyPem,
}) {
  const latestVersion = requireVersion(version, "version");
  const minimum = requireVersion(minimumVersion || version, "minimumVersion");
  const sha256 = String(apkSha256 || "").toLowerCase();
  if (!SHA256_RE.test(sha256)) throw new TypeError("APK SHA-256 is invalid.");
  const size = Number(apkSize);
  if (!Number.isSafeInteger(size) || size <= 0) throw new TypeError("APK size is invalid.");

  const privateKey = createPrivateKey(
    privateKeyPassphrase
      ? { key: privateKeyPem, format: "pem", passphrase: privateKeyPassphrase }
      : privateKeyPem,
  );
  const publicKey = createPublicKey(publicKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519" || publicKey.asymmetricKeyType !== "ed25519") {
    throw new TypeError("Update signing keys must be Ed25519.");
  }
  const payload = {
    schemaVersion: 2,
    channel: "stable",
    latestVersion,
    minimumVersion: minimum,
    mandatory: mandatory === true,
    downloadUrl: requireTrustedDownloadUrl(downloadUrl),
    publishedAt: new Date(publishedAt).toISOString(),
    apk: {
      sha256,
      size,
      certificateSha256: normalizeCertificateSha256(certificateSha256),
    },
    notes: {
      "zh-CN": String(notesZh || "").slice(0, 4000),
      en: String(notesEn || "").slice(0, 4000),
    },
  };
  const signature = sign(
    null,
    Buffer.from(canonicalJson(payload), "utf8"),
    privateKey,
  ).toString("base64");
  return {
    payload,
    signature: {
      algorithm: "Ed25519",
      keyId: publicKeyId(publicKey),
      value: signature,
    },
  };
}

export function verifySignedManifestNode(envelope, publicKeyPem) {
  try {
    if (
      envelope?.signature?.algorithm !== "Ed25519"
      || envelope.signature.keyId !== publicKeyId(publicKeyPem)
    ) {
      return false;
    }
    return verify(
      null,
      Buffer.from(canonicalJson(envelope.payload), "utf8"),
      createPublicKey(publicKeyPem),
      Buffer.from(envelope.signature.value, "base64"),
    );
  } catch {
    return false;
  }
}
