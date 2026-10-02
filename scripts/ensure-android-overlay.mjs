/**
 * Re-apply Android overlay registration after `cap sync` if MainActivity was reset.
 * Run: node scripts/ensure-android-overlay.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mainPath = join(root, "android/app/src/main/java/app/yueqi/companion/MainActivity.java");
const manifestPath = join(root, "android/app/src/main/AndroidManifest.xml");

if (!existsSync(mainPath)) {
  console.error("MainActivity not found");
  process.exit(1);
}

let main = readFileSync(mainPath, "utf8");
if (!main.includes("CompanionOverlayPlugin")) {
  main = `package app.yueqi.open;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.yueqi.open.overlay.CompanionOverlayPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CompanionOverlayPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
  writeFileSync(mainPath, main);
  console.log("Restored MainActivity plugin registration");
} else {
  console.log("MainActivity already registers CompanionOverlayPlugin");
}

if (existsSync(manifestPath)) {
  const manifest = readFileSync(manifestPath, "utf8");
  if (!manifest.includes("SYSTEM_ALERT_WINDOW") || !manifest.includes("OverlayService")) {
    console.warn("WARNING: AndroidManifest.xml is missing overlay permissions/service. Restore from git or docs.");
    process.exitCode = 2;
  } else {
    console.log("AndroidManifest overlay declarations present");
  }
}
