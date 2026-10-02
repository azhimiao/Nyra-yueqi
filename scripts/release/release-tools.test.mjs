import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import {
  buildSignedManifest,
  parseReleaseEnv,
  semverToVersionCode,
  verifySignedManifestNode,
} from "./release-tools.mjs";

assert.equal(semverToVersionCode("1.2.3"), 1_002_003);
assert.equal(semverToVersionCode("0.1.0-beta.1"), 1_000);
assert.throws(() => semverToVersionCode("1.1000.0"), /version/);

assert.deepEqual(parseReleaseEnv([
  "NYRA_KEY_ALIAS=nyra-release",
  "NYRA_STORE_PASSWORD=abc_123",
  "NYRA_KEY_PASSWORD='quoted-value'",
  "# comment",
  "",
].join("\n")), {
  NYRA_KEY_ALIAS: "nyra-release",
  NYRA_STORE_PASSWORD: "abc_123",
  NYRA_KEY_PASSWORD: "quoted-value",
});

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
const manifest = buildSignedManifest({
  version: "1.2.3",
  minimumVersion: "1.0.0",
  mandatory: false,
  downloadUrl: "https://download.memprism.com/nyra-latest.apk",
  apkSha256: "a".repeat(64),
  apkSize: 1234,
  certificateSha256: "AA:".repeat(31) + "AA",
  notesZh: "更新",
  notesEn: "Update",
  publishedAt: "2026-08-17T00:00:00.000Z",
  privateKeyPem,
  publicKeyPem,
});

assert.equal(manifest.payload.latestVersion, "1.2.3");
assert.equal(verifySignedManifestNode(manifest, publicKeyPem), true);
assert.equal(verifySignedManifestNode({
  ...manifest,
  payload: { ...manifest.payload, mandatory: true },
}, publicKeyPem), false);

console.log("release-tools.test: ok");
