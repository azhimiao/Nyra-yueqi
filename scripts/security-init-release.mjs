import { spawnSync } from "node:child_process";
import {
  X509Certificate,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import { parseReleaseEnv, publicKeyId } from "./release/release-tools.mjs";

const root = resolve(import.meta.dirname, "..");
const secretDir = resolve(process.env.NYRA_RELEASE_HOME || join(homedir(), ".nyra", "release"));
const keystorePath = join(secretDir, "android-release.jks");
const privateKeyPath = join(secretDir, "update-signing-private.pem");
const externalPublicKeyPath = join(secretDir, "update-signing-public.pem");
const envPath = join(secretDir, "release.env");
const repoPublicKeyPath = join(root, "assets", "security", "update-public-key.pem");
const repoPublicModulePath = join(root, "src", "update", "update-public-key.mjs");
const repoCertificatePath = join(root, "assets", "security", "android-release-cert.sha256");
const keyAlias = "nyra-release";

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

function commandPath(command) {
  const resolver = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(resolver, [command], { encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.split(/\r?\n/).find(Boolean)?.trim() : "";
}

function findKeytool() {
  const candidates = [
    process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "keytool.exe" : "keytool") : "",
    commandPath("keytool"),
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: Object.prototype.hasOwnProperty.call(options, "encoding")
      ? options.encoding
      : "utf8",
    env: options.env || process.env,
    windowsHide: true,
    stdio: options.stdio,
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    fail(`${options.label || command} failed${detail ? `: ${detail}` : "."}`);
  }
  return result;
}

async function lockDown(path, mode) {
  try {
    await chmod(path, mode);
  } catch (error) {
    if (process.platform !== "win32") throw error;
  }
}

function randomSecret() {
  return randomBytes(32).toString("base64url");
}

function envLine(key, value) {
  return `${key}=${JSON.stringify(String(value))}`;
}

async function writeReleaseEnv(config) {
  await writeFile(
    envPath,
    `${Object.entries(config).map(([key, value]) => envLine(key, value)).join("\n")}\n`,
    { mode: 0o600 },
  );
}

async function ensureGitignore() {
  const path = join(root, ".gitignore");
  const current = existsSync(path) ? await readFile(path, "utf8") : "";
  const required = [
    "*.jks",
    "*.keystore",
    "release.env",
    "*update-signing-private*",
    ".nyra-release/",
  ];
  const missing = required.filter((line) => !current.split(/\r?\n/).includes(line));
  if (missing.length) {
    const separator = current && !current.endsWith("\n") ? "\n" : "";
    await writeFile(
      path,
      `${current}${separator}\n# Nyra release secrets (public keys/fingerprints remain tracked)\n${missing.join("\n")}\n`,
      "utf8",
    );
  }
}

function assertNoTrackedSecrets() {
  const result = run("git", ["ls-files"], { label: "git secret scan" });
  const tracked = result.stdout.split(/\r?\n/).filter(Boolean);
  const forbidden = tracked.filter((path) => (
    /\.(?:jks|keystore)$/i.test(path)
    || /(^|\/)release\.env$/i.test(path)
    || /update-signing-private/i.test(path)
  ));
  if (forbidden.length) {
    fail(`release secrets are tracked by git:\n${forbidden.map((path) => `  - ${path}`).join("\n")}`);
  }
}

function exportCertificateFingerprint(keytool, config) {
  const result = run(keytool, [
    "-exportcert",
    "-keystore", config.NYRA_KEYSTORE_PATH,
    "-storetype", "JKS",
    "-storepass:env", "NYRA_KEYTOOL_STORE_PASSWORD",
    "-alias", config.NYRA_KEY_ALIAS,
  ], {
    encoding: null,
    label: "Android certificate export",
    env: {
      ...process.env,
      NYRA_KEYTOOL_STORE_PASSWORD: config.NYRA_STORE_PASSWORD,
    },
  });
  return new X509Certificate(result.stdout).fingerprint256.toUpperCase();
}

async function verifyUpdateKeyPair(config) {
  const privateKeyPem = await readFile(config.NYRA_UPDATE_PRIVATE_KEY_PATH, "utf8");
  const publicKeyPem = await readFile(config.NYRA_UPDATE_PUBLIC_KEY_PATH, "utf8");
  const privateKey = createPrivateKey({
    key: privateKeyPem,
    format: "pem",
    passphrase: config.NYRA_UPDATE_KEY_PASSWORD,
  });
  const publicKey = createPublicKey(publicKeyPem);
  const probe = randomBytes(32);
  const signature = sign(null, probe, privateKey);
  if (!verify(null, probe, publicKey, signature)) {
    fail("the configured Ed25519 private/public keys do not match. Restore the release backup.");
  }
  return publicKeyPem;
}

async function writePublicMaterial(publicKeyPem, certificateSha256) {
  const keyId = publicKeyId(publicKeyPem);
  await mkdir(dirname(repoPublicKeyPath), { recursive: true });
  await writeFile(repoPublicKeyPath, publicKeyPem, "utf8");
  await writeFile(repoCertificatePath, `${certificateSha256}\n`, "utf8");
  await writeFile(
    repoPublicModulePath,
    `// Generated by \`npm run security:init-release\`.\n`
      + `// The private key is stored outside this repository.\n`
      + `export const UPDATE_PUBLIC_KEY_PEM = ${JSON.stringify(publicKeyPem)};\n`
      + `export const UPDATE_PUBLIC_KEY_ID = ${JSON.stringify(keyId)};\n`,
    "utf8",
  );
  return keyId;
}

async function loadExistingConfig() {
  if (!existsSync(envPath)) return null;
  const config = parseReleaseEnv(await readFile(envPath, "utf8"));
  for (const key of [
    "NYRA_KEYSTORE_PATH",
    "NYRA_STORE_PASSWORD",
    "NYRA_KEY_PASSWORD",
    "NYRA_KEY_ALIAS",
    "NYRA_UPDATE_PRIVATE_KEY_PATH",
    "NYRA_UPDATE_PUBLIC_KEY_PATH",
    "NYRA_UPDATE_KEY_PASSWORD",
  ]) {
    if (!config[key]) fail(`existing release.env is missing ${key}; restore the backup instead of rotating keys.`);
  }
  for (const path of [
    config.NYRA_KEYSTORE_PATH,
    config.NYRA_UPDATE_PRIVATE_KEY_PATH,
    config.NYRA_UPDATE_PUBLIC_KEY_PATH,
  ]) {
    if (!existsSync(path)) fail(`release identity is incomplete: ${path} is missing. Restore your backup.`);
  }
  return config;
}

async function createIdentity(keytool) {
  const storePassword = randomSecret();
  const keyPassword = randomSecret();
  const updateKeyPassword = randomSecret();
  run(keytool, [
    "-genkeypair",
    "-v",
    "-keystore", keystorePath,
    "-storetype", "JKS",
    "-storepass:env", "NYRA_KEYTOOL_STORE_PASSWORD",
    "-keypass:env", "NYRA_KEYTOOL_KEY_PASSWORD",
    "-alias", keyAlias,
    "-keyalg", "RSA",
    "-keysize", "4096",
    "-validity", "10000",
    "-dname", "CN=Nyra Release, OU=Release, O=MemPrism, L=Unknown, ST=Unknown, C=CN",
  ], {
    label: "Android release keystore generation",
    env: {
      ...process.env,
      NYRA_KEYTOOL_STORE_PASSWORD: storePassword,
      NYRA_KEYTOOL_KEY_PASSWORD: keyPassword,
    },
  });

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({
    format: "pem",
    type: "pkcs8",
    cipher: "aes-256-cbc",
    passphrase: updateKeyPassword,
  }).toString();
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  await writeFile(privateKeyPath, privateKeyPem, { mode: 0o600 });
  await writeFile(externalPublicKeyPath, publicKeyPem, { mode: 0o644 });

  const config = {
    NYRA_KEYSTORE_PATH: keystorePath,
    NYRA_STORE_PASSWORD: storePassword,
    NYRA_KEY_PASSWORD: keyPassword,
    NYRA_KEY_ALIAS: keyAlias,
    NYRA_UPDATE_PRIVATE_KEY_PATH: privateKeyPath,
    NYRA_UPDATE_PUBLIC_KEY_PATH: externalPublicKeyPath,
    NYRA_UPDATE_KEY_PASSWORD: updateKeyPassword,
    NYRA_DOWNLOAD_URL: "https://download.memprism.com/nyra-latest.apk",
    NYRA_MINIMUM_VERSION: "1.0.0",
    NYRA_RELEASE_NOTES_ZH: "稳定性与安全更新。",
    NYRA_RELEASE_NOTES_EN: "Stability and security update.",
    NYRA_PUBLISH_TARGET: "root@47.83.232.55",
    NYRA_PUBLISH_DIR: "/var/www/download.memprism.com",
    NYRA_MANIFEST_TARGET: "/etc/yueqi-update-manifest.json",
  };
  await writeReleaseEnv(config);
  return config;
}

async function main() {
  if (!process.argv.includes("--yes") && process.stdin.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(
      `Create or verify the permanent Nyra release identity under:\n${secretDir}\nContinue? [y/N] `,
    );
    prompt.close();
    if (!/^y(?:es)?$/i.test(answer.trim())) {
      console.log("Cancelled; no release identity was created.");
      return;
    }
  }

  const keytool = findKeytool();
  if (!keytool) fail("keytool was not found. Install a JDK or set JAVA_HOME, then retry.");
  await mkdir(secretDir, { recursive: true, mode: 0o700 });
  await lockDown(secretDir, 0o700);

  const existingArtifacts = [keystorePath, privateKeyPath, externalPublicKeyPath]
    .filter((path) => existsSync(path));
  let config = await loadExistingConfig();
  if (!config && existingArtifacts.length) {
    fail("partial release identity exists without release.env. Restore the complete backup; keys were not rotated.");
  }
  if (!config) config = await createIdentity(keytool);
  config.NYRA_DOWNLOAD_URL ||= "https://download.memprism.com/nyra-latest.apk";
  config.NYRA_MINIMUM_VERSION ||= "1.0.0";
  config.NYRA_RELEASE_NOTES_ZH ||= "稳定性与安全更新。";
  config.NYRA_RELEASE_NOTES_EN ||= "Stability and security update.";
  config.NYRA_PUBLISH_TARGET ||= "root@47.83.232.55";
  config.NYRA_PUBLISH_DIR ||= "/var/www/download.memprism.com";
  config.NYRA_MANIFEST_TARGET ||= "/etc/yueqi-update-manifest.json";
  await writeReleaseEnv(config);

  await lockDown(config.NYRA_KEYSTORE_PATH, 0o600);
  await lockDown(config.NYRA_UPDATE_PRIVATE_KEY_PATH, 0o600);
  await lockDown(envPath, 0o600);
  const publicKeyPem = await verifyUpdateKeyPair(config);
  const certificateSha256 = exportCertificateFingerprint(keytool, config);
  const keyId = await writePublicMaterial(publicKeyPem, certificateSha256);
  await ensureGitignore();
  assertNoTrackedSecrets();

  console.log("\nNyra release identity is ready.");
  console.log(`Android certificate SHA-256: ${certificateSha256}`);
  console.log(`Update signing key ID: ${keyId}`);
  console.log("\nBACKUP REQUIRED:");
  console.log(`  ${secretDir}`);
  console.log("Losing this directory can prevent installed Android apps from receiving future updates.");
  console.log("Keep at least one encrypted offline backup. Never commit this directory.");
  console.log("\nNext command:");
  console.log("  npm run release:android");
}

main().catch((error) => fail(error?.message || String(error)));
