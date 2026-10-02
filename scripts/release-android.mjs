import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  buildSignedManifest,
  normalizeCertificateSha256,
  parseReleaseEnv,
  semverToVersionCode,
  verifySignedManifestNode,
} from "./release/release-tools.mjs";

const root = resolve(import.meta.dirname, "..");
const androidDir = join(root, "android");
const isWindows = process.platform === "win32";
const gradlew = join(androidDir, isWindows ? "gradlew.bat" : "gradlew");
const releaseHome = resolve(process.env.NYRA_RELEASE_HOME || join(homedir(), ".nyra", "release"));
const releaseEnvPath = join(releaseHome, "release.env");
const outputDir = join(root, "dist", "release");

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

function run(command, args, { cwd = root, env = process.env, capture = false, label = command } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    windowsHide: true,
    shell: isWindows && (
      command === "npm"
      || command === "npx"
      || /\.(?:bat|cmd)$/i.test(command)
    ),
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    const detail = capture ? String(result.stderr || result.stdout || "").trim() : "";
    fail(`${label} failed${detail ? `: ${detail}` : "."}`);
  }
  return result;
}

function commandPath(command) {
  const resolver = isWindows ? "where.exe" : "which";
  const result = spawnSync(resolver, [command], { encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.split(/\r?\n/).find(Boolean)?.trim() : "";
}

function sdkRootFromLocalProperties() {
  const path = join(androidDir, "local.properties");
  if (!existsSync(path)) return "";
  const source = readFileSync(path, "utf8");
  const match = source.match(/^sdk\.dir=(.+)$/m);
  return match ? match[1].trim().replace(/\\\\/g, "\\").replace(/\\:/g, ":") : "";
}

function compareVersions(left, right) {
  const a = left.split(".").map((value) => Number(value.replace(/\D.*$/, "")) || 0);
  const b = right.split(".").map((value) => Number(value.replace(/\D.*$/, "")) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}

function findApksigner() {
  const direct = commandPath(isWindows ? "apksigner.bat" : "apksigner");
  if (direct) return direct;
  const sdk = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    sdkRootFromLocalProperties(),
  ].find((candidate) => candidate && existsSync(candidate));
  if (!sdk) return "";
  const buildTools = join(sdk, "build-tools");
  if (!existsSync(buildTools)) return "";
  const versions = readdirSync(buildTools, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareVersions)
    .reverse();
  for (const version of versions) {
    const candidate = join(buildTools, version, isWindows ? "apksigner.bat" : "apksigner");
    if (existsSync(candidate)) return candidate;
  }
  return "";
}

function parseArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

async function sha256File(path) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

function certificateFromApksigner(output) {
  const match = String(output || "").match(/certificate SHA-256 digest:\s*([a-fA-F0-9:]+)/i);
  if (!match) fail("apksigner did not report the APK certificate SHA-256 digest.");
  return normalizeCertificateSha256(match[1]);
}

async function loadConfig() {
  if (!existsSync(releaseEnvPath)) {
    fail("release signing material is missing. Run `npm run security:init-release`.");
  }
  const config = parseReleaseEnv(await readFile(releaseEnvPath, "utf8"));
  for (const key of [
    "NYRA_KEYSTORE_PATH",
    "NYRA_STORE_PASSWORD",
    "NYRA_KEY_PASSWORD",
    "NYRA_KEY_ALIAS",
    "NYRA_UPDATE_PRIVATE_KEY_PATH",
    "NYRA_UPDATE_PUBLIC_KEY_PATH",
    "NYRA_UPDATE_KEY_PASSWORD",
  ]) {
    if (!config[key]) fail(`release configuration is missing ${key}. Run \`npm run security:init-release\`.`);
  }
  for (const path of [
    config.NYRA_KEYSTORE_PATH,
    config.NYRA_UPDATE_PRIVATE_KEY_PATH,
    config.NYRA_UPDATE_PUBLIC_KEY_PATH,
  ]) {
    if (!existsSync(path)) fail(`release signing material is missing: ${path}`);
  }
  return config;
}

async function main() {
  const config = await loadConfig();
  if (!existsSync(gradlew)) fail("Android Gradle wrapper is missing.");
  const apksigner = findApksigner();
  if (!apksigner) fail("apksigner was not found in Android SDK build-tools.");

  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const version = String(parseArg("--version") || packageJson.version || "").trim();
  const versionCode = semverToVersionCode(version);
  const minimumVersion = parseArg("--minimum-version")
    || config.NYRA_MINIMUM_VERSION
    || version;
  const mandatory = process.argv.includes("--mandatory");
  const downloadUrl = config.NYRA_DOWNLOAD_URL
    || "https://download.memprism.com/nyra-latest.apk";

  const releaseEnv = {
    ...process.env,
    ...config,
    NYRA_VERSION_NAME: version,
    NYRA_VERSION_CODE: String(versionCode),
    VITE_APP_VERSION: version,
  };
  console.log(`Building Nyra Android release ${version} (${versionCode})...`);
  run(process.execPath, ["scripts/verify-apk-hardening-l1.mjs"], {
    env: releaseEnv,
    label: "L1 APK hardening source gate",
  });
  run(process.execPath, ["scripts/verify-apk-hardening-l2.mjs"], {
    env: releaseEnv,
    label: "L2 native secrets and SQLite encryption gate",
  });
  run("npm", ["run", "build"], { env: releaseEnv, label: "web production build" });
  run("npx", ["cap", "sync", "android"], { env: releaseEnv, label: "Capacitor Android sync" });
  run(process.execPath, ["scripts/ensure-android-overlay.mjs"], {
    env: releaseEnv,
    label: "Android overlay verification",
  });
  run(process.execPath, ["scripts/ensure-android-release-hardening.mjs"], {
    env: releaseEnv,
    label: "Android L1 hardening verification",
  });
  run(gradlew, ["clean", "assembleRelease"], {
    cwd: androidDir,
    env: releaseEnv,
    label: "signed Android release build",
  });

  const builtApk = join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
  if (!existsSync(builtApk)) fail(`release APK was not produced: ${builtApk}`);
  const verification = run(apksigner, ["verify", "--verbose", "--print-certs", builtApk], {
    capture: true,
    label: "APK signature verification",
  });
  run(process.execPath, ["scripts/verify-apk-hardening-l1.mjs", "--built", "--apk", builtApk], {
    env: releaseEnv,
    label: "L1 APK hardening built-artifact gate",
  });

  const actualCertificate = certificateFromApksigner(verification.stdout);
  const expectedCertificate = normalizeCertificateSha256(
    await readFile(join(root, "assets", "security", "android-release-cert.sha256"), "utf8"),
  );
  if (actualCertificate !== expectedCertificate) {
    fail(`APK signer mismatch. Expected ${expectedCertificate}, got ${actualCertificate}.`);
  }

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  const versionedApk = join(outputDir, `nyra-${version}.apk`);
  const latestApk = join(outputDir, "nyra-latest.apk");
  await copyFile(builtApk, versionedApk);
  await copyFile(builtApk, latestApk);
  const apkSha256 = await sha256File(versionedApk);
  const apkSize = (await stat(versionedApk)).size;
  const privateKeyPem = await readFile(config.NYRA_UPDATE_PRIVATE_KEY_PATH, "utf8");
  const publicKeyPem = await readFile(config.NYRA_UPDATE_PUBLIC_KEY_PATH, "utf8");
  const manifest = buildSignedManifest({
    version,
    minimumVersion,
    mandatory,
    downloadUrl,
    apkSha256,
    apkSize,
    certificateSha256: actualCertificate,
    notesZh: parseArg("--notes-zh") || config.NYRA_RELEASE_NOTES_ZH || "",
    notesEn: parseArg("--notes-en") || config.NYRA_RELEASE_NOTES_EN || "",
    privateKeyPem,
    privateKeyPassphrase: config.NYRA_UPDATE_KEY_PASSWORD,
    publicKeyPem,
  });
  if (!verifySignedManifestNode(manifest, publicKeyPem)) {
    fail("generated update manifest did not pass Ed25519 verification.");
  }

  const manifestPath = join(outputDir, "update-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(outputDir, "update-manifest.sig"), `${manifest.signature.value}\n`, "ascii");
  await writeFile(
    join(outputDir, "SHA256SUMS.txt"),
    `${apkSha256}  ${basename(versionedApk)}\n${apkSha256}  ${basename(latestApk)}\n`,
    "ascii",
  );
  await copyFile(config.NYRA_UPDATE_PUBLIC_KEY_PATH, join(outputDir, "update-public-key.pem"));
  await copyFile(
    join(root, "assets", "security", "android-release-cert.sha256"),
    join(outputDir, "android-release-cert.sha256"),
  );

  console.log("\nRelease verified and ready:");
  console.log(`  ${outputDir}`);
  console.log(`  APK SHA-256: ${apkSha256}`);
  console.log(`  APK bytes: ${apkSize}`);
  console.log(`  Certificate: ${actualCertificate}`);
  console.log(`  Manifest key: ${manifest.signature.keyId}`);
  console.log("\nNo debug signing fallback was used.");
}

main().catch((error) => fail(error?.message || String(error)));
