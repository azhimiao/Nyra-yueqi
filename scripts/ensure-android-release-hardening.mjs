/**
 * Re-apply L1 release hardening after `cap sync` if the manifest/activity was reset.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mainPath = join(root, "android/app/src/main/java/app/yueqi/companion/MainActivity.java");
const manifestPath = join(root, "android/app/src/main/AndroidManifest.xml");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(mainPath) || !existsSync(manifestPath)) {
  fail("Android app sources are missing.");
}

let main = readFileSync(mainPath, "utf8");
if (!main.includes("setWebContentsDebuggingEnabled(BuildConfig.DEBUG)")) {
  fail("MainActivity lost WebView debug gating. Restore L1 hardening before packaging.");
}
if (!main.includes("CompanionOverlayPlugin") || !main.includes("NativeCapabilityPlugin") || !main.includes("NativeSecureStorePlugin")) {
  fail("MainActivity lost plugin registration. Restore overlay/capability/secure-store plugins before packaging.");
}

let manifest = readFileSync(manifestPath, "utf8");
const required = [
  'android:allowBackup="false"',
  "android:networkSecurityConfig=",
  "android:dataExtractionRules=",
  "android:fullBackupContent=",
  'android:usesCleartextTraffic="false"',
];
const missing = required.filter((token) => !manifest.includes(token));
if (missing.length) {
  fail(`AndroidManifest.xml lost L1 hardening: ${missing.join(", ")}`);
}

console.log("Android L1 hardening still present after sync");
