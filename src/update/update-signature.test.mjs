import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";

import {
  canonicalJson,
  updatePublicKeyId,
  verifySignedUpdateManifest,
} from "./update-signature.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
const payload = {
  schemaVersion: 2,
  channel: "stable",
  latestVersion: "1.2.3",
  minimumVersion: "1.0.0",
  mandatory: false,
  downloadUrl: "https://download.memprism.com/nyra-latest.apk",
  publishedAt: "2026-08-17T00:00:00.000Z",
  apk: {
    sha256: "a".repeat(64),
    size: 123456,
    certificateSha256: "B1:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:B1:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00",
  },
  notes: { "zh-CN": "安全更新", en: "Security update" },
};
const signature = sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString("base64");
const envelope = {
  payload,
  signature: {
    algorithm: "Ed25519",
    keyId: await updatePublicKeyId(publicKeyPem),
    value: signature,
  },
};

assert.deepEqual(
  JSON.parse(canonicalJson({ z: 1, a: { y: 2, x: 3 } })),
  { a: { x: 3, y: 2 }, z: 1 },
);

const verified = await verifySignedUpdateManifest(envelope, {
  publicKeyPem,
  allowedDownloadHosts: ["download.memprism.com"],
});
assert.equal(verified.latestVersion, "1.2.3");
assert.equal(verified.apk.size, 123456);

await assert.rejects(
  () => verifySignedUpdateManifest({
    ...envelope,
    payload: { ...payload, latestVersion: "9.9.9" },
  }, { publicKeyPem, allowedDownloadHosts: ["download.memprism.com"] }),
  (error) => error?.code === "update_signature_invalid",
);

await assert.rejects(
  () => verifySignedUpdateManifest({
    ...envelope,
    payload: { ...payload, downloadUrl: "https://evil.example/nyra.apk" },
  }, { publicKeyPem, allowedDownloadHosts: ["download.memprism.com"] }),
  (error) => error?.code === "update_download_host_forbidden",
);

await assert.rejects(
  () => verifySignedUpdateManifest(envelope, {
    publicKeyPem: "",
    allowedDownloadHosts: ["download.memprism.com"],
  }),
  (error) => error?.code === "update_public_key_missing",
);

console.log("update-signature.test: ok");
