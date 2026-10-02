#!/usr/bin/env node
/**
 * CP-17 — Desktop pet / overlay presence aligned with companion life-state.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const node =
  process.env.OPENCLAW_NODE ||
  (existsSync("F:\\clawtry\\node-v22.22.3-win-x64\\node.exe")
    ? "F:\\clawtry\\node-v22.22.3-win-x64\\node.exe"
    : process.execPath);

if (process.platform === "win32") {
  spawnSync("chcp", ["65001"], { stdio: "ignore", shell: true });
}

const failures = [];
function check(name, pass, detail = "") {
  if (!pass) failures.push(name);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const bridgeJs = readFileSync(join(root, "src/companion/pet-presence-bridge.js"), "utf8");
const desktopWire = readFileSync(join(root, "src/ui/desktop-presence-wire.js"), "utf8");
const overlayWire = readFileSync(join(root, "src/ui/overlay-presence-wire.js"), "utf8");
const runtimeJs = readFileSync(join(root, "src/runtime/companion-runtime.js"), "utf8");
const lifeWake = readFileSync(join(root, "src/companion/life-wake.js"), "utf8");
const appJs = readFileSync(join(root, "src/app.js"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

check("bridge module exists", bridgeJs.includes("derivePetPresenceFromLifeState"));
check("life mood → emotion map", bridgeJs.includes("LIFE_MOOD_TO_EMOTION"));
check("life mood → idle action map", bridgeJs.includes("LIFE_MOOD_TO_IDLE_ACTION"));
check("companion life event", bridgeJs.includes("yueqi:companion-life"));
check("desktop wire uses bridge", desktopWire.includes("pet-presence-bridge"));
check("overlay wire uses bridge", overlayWire.includes("pet-presence-bridge"));
check("resolvePetSpritePack for character media", bridgeJs.includes("resolvePetSpritePack"));
check("pet stays hidden until user opens it",
  existsSync(join(root, "src/ui/pet-visibility-pref.js"))
  && readFileSync(join(root, "src/ui/pet-visibility-pref.js"), "utf8").includes('=== "1"')
  && desktopWire.includes("pet-visibility-pref"));
check("runtime syncLifePresence", runtimeJs.includes("syncLifePresence"));
check("life wake emits presence", lifeWake.includes("emitCompanionLifeChanged"));
check("app binds bridge", appJs.includes("bindPetPresenceBridge"));
check("npm script verify:pet-cp17", packageJson.includes("verify:pet-cp17"));
check("docs report exists", existsSync(join(root, "docs/NYRA_CP17_PET_PRESENCE_REPORT.md")));
check(
  "phone and app share overlay keep-alive",
  desktopWire.includes("syncInAppFloatToOverlay")
    && overlayWire.includes("[data-overlay-oem-battery]")
    && existsSync(join(root, "android/app/src/main/java/app/yueqi/companion/overlay/OverlayService.java"))
    && readFileSync(join(root, "android/app/src/main/java/app/yueqi/companion/overlay/OverlayService.java"), "utf8").includes("restoreIfNeeded"),
);

console.log("\n--- integration ---");
const r = spawnSync(node, ["./tests/integration/pet-cp17.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--enable-source-maps"].filter(Boolean).join(" "),
  },
});
if ((r.status ?? 1) !== 0) failures.push("integration pet-cp17.mjs");

console.log("\n--- pet-boundary regression ---");
const b = spawnSync(node, ["./scripts/verify-pet-surface-boundary.mjs"], {
  cwd: root,
  stdio: "inherit",
});
if ((b.status ?? 1) !== 0) failures.push("verify-pet-boundary");

console.log("");
if (failures.length) {
  console.error(`verify:pet-cp17 failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("verify:pet-cp17 passed");
