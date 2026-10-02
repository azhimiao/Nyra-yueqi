import assert from "node:assert/strict";
import { normalizeUpdateManifest } from "./update-manifest.mjs";

const manifest = normalizeUpdateManifest({
  payload: {
    schemaVersion: 2,
    channel: "stable",
    latestVersion: "1.2.0",
    minimumVersion: "1.0.0",
    mandatory: false,
    downloadUrl: "https://download.memprism.com/nyra-latest.apk",
    publishedAt: "2026-08-17T00:00:00.000Z",
    apk: {
      sha256: "a".repeat(64),
      size: 123456,
      certificateSha256: "AA:".repeat(31) + "AA",
    },
    notes: { "zh-CN": "更新说明", en: "Release notes" },
  },
  signature: {
    algorithm: "Ed25519",
    keyId: "b".repeat(32),
    value: Buffer.alloc(64, 1).toString("base64"),
  },
});

assert.equal(manifest.payload.latestVersion, "1.2.0");
assert.equal(manifest.payload.mandatory, false);
assert.throws(() => normalizeUpdateManifest({
  ...manifest,
  payload: { ...manifest.payload, minimumVersion: "2.0.0" },
}), /minimumVersion/);
assert.throws(() => normalizeUpdateManifest({
  ...manifest,
  payload: { ...manifest.payload, downloadUrl: "http://download.memprism.com/nyra-latest.apk" },
}), /downloadUrl/);
assert.throws(() => normalizeUpdateManifest({
  ...manifest,
  payload: { ...manifest.payload, downloadUrl: "https://evil.example/nyra-latest.apk" },
}), /downloadUrl/);
assert.throws(() => normalizeUpdateManifest({
  ...manifest,
  signature: { ...manifest.signature, value: "" },
}), /signature/);

console.log("update-manifest.test: ok");
