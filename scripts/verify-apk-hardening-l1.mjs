/**
 * L1 APK hardening gate: R8, no source maps, no cleartext, no backup, no
 * release WebView inspect. Source checks always run. Pass --built after a
 * production web/Android build to also inspect www/, mapping.txt, and the APK.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const requireBuilt = process.argv.includes("--built");
const apkArgIndex = process.argv.indexOf("--apk");
const apkPath = apkArgIndex >= 0
  ? String(process.argv[apkArgIndex + 1] || "").trim()
  : join(root, "android/app/build/outputs/apk/release/app-release.apk");
const mappingPath = join(root, "android/app/build/outputs/mapping/release/mapping.txt");
const wwwDir = join(root, "www");

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function listZipEntries(zipPath) {
  const tar = spawnSync("tar", ["-tf", zipPath], { encoding: "utf8", windowsHide: true });
  if (tar.status === 0) {
    return String(tar.stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  const jar = spawnSync("jar", ["tf", zipPath], { encoding: "utf8", windowsHide: true });
  if (jar.status === 0) {
    return String(jar.stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  throw new Error(`could not list zip entries for ${zipPath}`);
}

function extractBlock(source, startToken) {
  const start = source.indexOf(startToken);
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

const gradle = read("android/app/build.gradle");
const buildTypes = extractBlock(gradle, "buildTypes");
const releaseBlock = extractBlock(buildTypes, "release");
check("release minifyEnabled", /minifyEnabled\s+true/.test(releaseBlock));
check("release shrinkResources", /shrinkResources\s+true/.test(releaseBlock));
check("BuildConfig generated for debug gate", /buildFeatures[\s\S]*buildConfig\s+true/.test(gradle));
check(
  "release uses optimize ProGuard defaults",
  releaseBlock.includes("proguard-android-optimize.txt") && releaseBlock.includes("proguard-rules.pro"),
);

const proguard = read("android/app/proguard-rules.pro");
check("ProGuard keeps Capacitor runtime", proguard.includes("-keep class com.getcapacitor.**"));
check("ProGuard keeps CapacitorPlugin methods", proguard.includes("@com.getcapacitor.annotation.CapacitorPlugin"));
check("ProGuard keeps JavascriptInterface", proguard.includes("@android.webkit.JavascriptInterface"));
check("ProGuard keeps Yueqi plugins", proguard.includes("app.yueqi.open.overlay") && proguard.includes("app.yueqi.open.capability") && proguard.includes("app.yueqi.open.secure"));
check("ProGuard dontwarn Tink annotation holes", proguard.includes("com.google.errorprone.annotations") && proguard.includes("javax.annotation"));
check("ProGuard dontwarn Tink optional HTTP/Joda", proguard.includes("com.google.api.client") && proguard.includes("org.joda.time"));

const manifest = read("android/app/src/main/AndroidManifest.xml");
check("backup disabled", /android:allowBackup="false"/.test(manifest));
check("data extraction rules", /android:dataExtractionRules="@xml\/data_extraction_rules"/.test(manifest));
check("legacy backup rules", /android:fullBackupContent="@xml\/backup_rules"/.test(manifest));
check("network security config", /android:networkSecurityConfig="@xml\/network_security_config"/.test(manifest));
check("cleartext disabled", /android:usesCleartextTraffic="false"/.test(manifest));

const network = read("android/app/src/main/res/xml/network_security_config.xml");
check("network config forbids cleartext", /cleartextTrafficPermitted="false"/.test(network));
check("network config trusts system CAs only", network.includes('certificates src="system"') && !network.includes('src="user"'));

const extraction = read("android/app/src/main/res/xml/data_extraction_rules.xml");
check("cloud backup excluded", extraction.includes("<cloud-backup>") && extraction.includes('<exclude domain="database"'));
check("device transfer excluded", extraction.includes("<device-transfer>"));

const backup = read("android/app/src/main/res/xml/backup_rules.xml");
check("full-backup excludes sharedpref", backup.includes("<full-backup-content>") && backup.includes('<exclude domain="sharedpref"'));

const keepXml = read("android/app/src/main/res/raw/keep.xml");
check("resource shrinker keep file", keepXml.includes("tools:keep") && keepXml.includes("@xml/network_security_config"));

const main = read("android/app/src/main/java/app/yueqi/companion/MainActivity.java");
check(
  "WebView inspect only in debug",
  /setWebContentsDebuggingEnabled\(\s*BuildConfig\.DEBUG\s*\)/.test(main)
    && !/setWebContentsDebuggingEnabled\(\s*true\s*\)/.test(main),
);

const capacitor = JSON.parse(read("capacitor.config.json"));
check("Capacitor cleartext off", capacitor?.server?.cleartext === false);
check("Capacitor androidScheme https", capacitor?.server?.androidScheme === "https");

const vite = read("vite.config.js");
check("Vite sourcemap disabled", /sourcemap:\s*false/.test(vite));
check("Vite drops console on build", /drop:\s*\[\s*"console"/.test(vite));

if (requireBuilt) {
  const assetConfigPath = join(root, "android/app/src/main/assets/capacitor.config.json");
  if (existsSync(assetConfigPath)) {
    const assetConfig = JSON.parse(readFileSync(assetConfigPath, "utf8"));
    check("synced Capacitor cleartext off", assetConfig?.server?.cleartext === false);
  }
  const wwwFiles = walkFiles(wwwDir);
  check("www exists", wwwFiles.length > 0, wwwFiles.length ? `${wwwFiles.length} files` : wwwDir);
  const wwwMaps = wwwFiles.filter((file) => file.endsWith(".map"));
  check("www has no source maps", wwwMaps.length === 0, wwwMaps.map((file) => relative(root, file)).join(", "));
  check("mapping.txt exists (R8 ran)", existsSync(mappingPath) && statSync(mappingPath).size > 64, mappingPath);
  if (existsSync(mappingPath)) {
    const mapping = readFileSync(mappingPath, "utf8");
    check("mapping.txt records obfuscation", mapping.includes(" -> "));
  }
  check("release APK exists", existsSync(apkPath), apkPath);
  if (existsSync(apkPath)) {
    const entries = listZipEntries(apkPath);
    const maps = entries.filter((entry) => entry.endsWith(".map"));
    check("APK has no source maps", maps.length === 0, maps.slice(0, 8).join(", "));
    check("APK contains dex", entries.some((entry) => entry.endsWith(".dex")));
    check("APK contains web assets", entries.some((entry) => entry.includes("index.html")));
  }
}

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`L1 hardening failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`L1 hardening passed: ${checks.length}/${checks.length}${requireBuilt ? " (built artifacts)" : " (source)"}`);
