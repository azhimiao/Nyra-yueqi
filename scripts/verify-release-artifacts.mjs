import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { UPDATE_PUBLIC_KEY_PEM } from "../src/update/update-public-key.mjs";
import { verifySignedUpdateManifest } from "../src/update/update-signature.mjs";
import { verifySignedManifestNode } from "./release/release-tools.mjs";

const root = resolve(import.meta.dirname, "..");
const releaseDir = join(root, "dist", "release");
const apkPath = join(releaseDir, "nyra-latest.apk");
const manifest = JSON.parse(await readFile(join(releaseDir, "update-manifest.json"), "utf8"));
const apk = await readFile(apkPath);
const apkSha256 = createHash("sha256").update(apk).digest("hex");
const apkSize = (await stat(apkPath)).size;

assert.ok(UPDATE_PUBLIC_KEY_PEM, "repository update public key is missing");
assert.equal(verifySignedManifestNode(manifest, UPDATE_PUBLIC_KEY_PEM), true);
const payload = await verifySignedUpdateManifest(manifest, {
  publicKeyPem: UPDATE_PUBLIC_KEY_PEM,
  allowedDownloadHosts: ["download.memprism.com"],
});
assert.equal(payload.apk.sha256, apkSha256);
assert.equal(payload.apk.size, apkSize);

console.log(`release-artifacts: ok (${payload.latestVersion}, ${apkSize} bytes)`);
