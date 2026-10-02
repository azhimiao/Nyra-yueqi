import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, posix, resolve } from "node:path";

import {
  parseReleaseEnv,
  verifySignedManifestNode,
} from "./release/release-tools.mjs";

const root = resolve(import.meta.dirname, "..");
const releaseHome = resolve(process.env.NYRA_RELEASE_HOME || join(homedir(), ".nyra", "release"));
const releaseEnvPath = join(releaseHome, "release.env");
const outputDir = join(root, "dist", "release");

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`${label} failed.`);
}

function validTarget(value) {
  const target = String(value || "").trim();
  if (!/^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9.-]+$/.test(target)) {
    fail("NYRA_PUBLISH_TARGET must be an SSH host or user@host without shell syntax.");
  }
  return target;
}

function validAbsoluteRemotePath(value, field) {
  const path = String(value || "").trim();
  if (!/^\/[A-Za-z0-9._/-]+$/.test(path) || path.includes("..")) {
    fail(`${field} must be a simple absolute POSIX path.`);
  }
  return path.replace(/\/+$/, "");
}

async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function main() {
  if (!existsSync(releaseEnvPath)) {
    fail("release configuration is missing. Run `npm run security:init-release`.");
  }
  const config = parseReleaseEnv(await readFile(releaseEnvPath, "utf8"));
  const target = validTarget(process.env.NYRA_PUBLISH_TARGET || config.NYRA_PUBLISH_TARGET);
  const publishDir = validAbsoluteRemotePath(
    process.env.NYRA_PUBLISH_DIR || config.NYRA_PUBLISH_DIR,
    "NYRA_PUBLISH_DIR",
  );
  const manifestTarget = validAbsoluteRemotePath(
    process.env.NYRA_MANIFEST_TARGET
      || config.NYRA_MANIFEST_TARGET
      || "/etc/yueqi-update-manifest.json",
    "NYRA_MANIFEST_TARGET",
  );

  const apkPath = join(outputDir, "nyra-latest.apk");
  const manifestPath = join(outputDir, "update-manifest.json");
  const sumsPath = join(outputDir, "SHA256SUMS.txt");
  for (const path of [apkPath, manifestPath, sumsPath, config.NYRA_UPDATE_PUBLIC_KEY_PATH]) {
    if (!existsSync(path)) fail(`release artifact is missing: ${path}. Run \`npm run release:android\`.`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const publicKeyPem = await readFile(config.NYRA_UPDATE_PUBLIC_KEY_PATH, "utf8");
  if (!verifySignedManifestNode(manifest, publicKeyPem)) {
    fail("update-manifest.json has an invalid Ed25519 signature.");
  }
  const apkSha256 = await sha256File(apkPath);
  const apkSize = (await stat(apkPath)).size;
  if (apkSha256 !== manifest.payload.apk.sha256 || apkSize !== manifest.payload.apk.size) {
    fail("APK bytes do not match the signed update manifest.");
  }
  if (process.argv.includes("--dry-run")) {
    console.log(`release-publish dry run: ok (${manifest.payload.latestVersion})`);
    console.log(`Target APK directory: ${target}:${publishDir}`);
    console.log(`Target manifest: ${target}:${manifestTarget}`);
    return;
  }

  const releaseId = `${manifest.payload.latestVersion}-${randomBytes(6).toString("hex")}`;
  const incomingDir = posix.join(publishDir, `.incoming-${releaseId}`);
  const remoteApk = posix.join(incomingDir, "nyra-latest.apk");
  const remoteManifest = posix.join(incomingDir, "update-manifest.json");
  const remoteSums = posix.join(incomingDir, "SHA256SUMS.txt");
  run("ssh", [target, `umask 077 && mkdir -p '${incomingDir}'`], "remote staging creation");
  try {
    run("scp", [
      apkPath,
      manifestPath,
      sumsPath,
      `${target}:${incomingDir}/`,
    ], "release upload");
    const versionedName = `nyra-${manifest.payload.latestVersion}.apk`;
    const remoteCommand = [
      "set -euo pipefail",
      `test "$(sha256sum '${remoteApk}' | awk '{print $1}')" = '${apkSha256}'`,
      `test "$(wc -c < '${remoteApk}' | tr -d ' ')" = '${apkSize}'`,
      `install -m 0644 '${remoteApk}' '${posix.join(publishDir, versionedName)}'`,
      `mv -f '${remoteApk}' '${posix.join(publishDir, "nyra-latest.apk")}'`,
      `mv -f '${remoteSums}' '${posix.join(publishDir, "SHA256SUMS.txt")}'`,
      `install -D -o root -g yueqi -m 0640 '${remoteManifest}' '${manifestTarget}'`,
      `rm -rf '${incomingDir}'`,
    ].join(" && ");
    run("ssh", [target, remoteCommand], "remote release activation");
  } catch (error) {
    try {
      run("ssh", [target, `rm -rf '${incomingDir}'`], "remote staging cleanup");
    } catch {
      // Preserve the original publish failure; the hidden staging directory is inert.
    }
    throw error;
  }

  console.log(`Published and activated Nyra ${manifest.payload.latestVersion}.`);
  console.log(`APK: ${target}:${posix.join(publishDir, basename(apkPath))}`);
  console.log(`Manifest: ${target}:${manifestTarget}`);
}

main().catch((error) => fail(error?.message || String(error)));
