/**
 * L2: native secret vault + SQLite encryption. Source checks always run.
 * Does not claim a device/Keystore round-trip; that needs a signed APK on hardware.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const secureStore = read("src/platform/secure-store.js");
const webSecrets = read("src/platform/web-secrets.js");
const sqlite = read("src/storage/sqlite-adapter.js");
const db = read("src/storage/db.js");
const privacy = read("src/memory/privacy.js");
const java = read("android/app/src/main/java/app/yueqi/companion/secure/NativeSecureStorePlugin.java");
const main = read("android/app/src/main/java/app/yueqi/companion/MainActivity.java");
const gradle = read("android/app/build.gradle");
const proguard = read("android/app/proguard-rules.pro");
const swift = existsSync(join(root, "ios/App/App/NativeSecureStorePlugin.swift"))
  ? read("ios/App/App/NativeSecureStorePlugin.swift")
  : "";
const capacitor = JSON.parse(read("capacitor.config.json"));
const sqlitePlugin = capacitor?.plugins?.CapacitorSQLite || {};

check("Web secrets stay in sessionStorage", webSecrets.includes("sessionStorage") && !webSecrets.includes("localStorage.setItem"));
check("Web path still uses setWebSecret", secureStore.includes("setWebSecret") && secureStore.includes("getWebSecret"));
check("Native vault plugin is registered in JS", secureStore.includes('registerPlugin("NativeSecureStore")'));
check("Native reads vault before Preferences", secureStore.includes("readVault") && secureStore.includes("readPrefs"));
check("Native migrates Preferences into vault", secureStore.includes("migratePrefsIntoVault"));
check("Native write success deletes Preferences copy", secureStore.includes("prefs.remove") && secureStore.includes("writeVault"));
check("Vault failure still writes Preferences", secureStore.includes("writePrefs"));

check("Android plugin uses EncryptedSharedPreferences", java.includes("EncryptedSharedPreferences") && java.includes("MasterKey"));
check("Android plugin stays off below API 23", java.includes("VERSION_CODES.M"));
check("MainActivity registers NativeSecureStore", main.includes("NativeSecureStorePlugin"));
check("App depends on security-crypto", gradle.includes("androidx.security:security-crypto"));
check("ProGuard keeps the secure plugin", proguard.includes("app.yueqi.open.secure"));
check("iOS plugin talks to Keychain", swift.includes("kSecClassGenericPassword") && swift.includes("NativeSecureStore"));

check("SQLite encryption flag is on", sqlitePlugin.androidIsEncryption === true);
check("SQLite biometric prompt stays off", sqlitePlugin?.androidBiometric?.biometricAuth === false);
check("SQLite open plan can migrate plaintext", sqlite.includes('mode: "encryption"') && sqlite.includes("resolveSqliteOpenPlan"));
check("SQLite encryption failure falls back to no-encryption", sqlite.includes('"no-encryption"') && sqlite.includes("connectSqliteDatabase"));
check("Web memory path is still IndexedDB fallback", db.includes("SQLite 初始化失败，回退 IndexedDB") && db.includes("openIndexedDb"));
check("Backup still scrubs API keys", privacy.includes("scrubExportPayload") && privacy.includes("ttsApiKey"));
check("Hosted model keys stay off the client store", !secureStore.includes("YUEQI_MODEL_API_KEY") && !java.includes("YUEQI_MODEL_API_KEY"));

function runUnit(rel) {
  const result = spawnSync(process.execPath, [join(root, rel)], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  check(`unit ${rel}`, result.status === 0, result.status === 0 ? "" : String(result.stderr || result.stdout || "").trim());
}

runUnit("src/platform/secure-store.test.mjs");
runUnit("src/storage/sqlite-adapter.test.mjs");

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`L2 hardening failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`L2 hardening passed: ${checks.length}/${checks.length}`);
