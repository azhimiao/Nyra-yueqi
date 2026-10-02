/**
 * Phase 2 verification — Windows Electron desktop pet host.
 * Run: node scripts/verify-phase2.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readAppBundle } from "./lib/app-sources.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const main = readFileSync(join(root, "electron/main.mjs"), "utf8");
const preloadPet = readFileSync(join(root, "electron/preload-pet.cjs"), "utf8");
const preloadApp = readFileSync(join(root, "electron/preload-app.cjs"), "utf8");
const overlayApp = readFileSync(join(root, "src/overlay/overlay-app.js"), "utf8");
const desktopHost = readFileSync(join(root, "src/platform/desktop-host.js"), "utf8");
const wire = readFileSync(join(root, "src/ui/desktop-presence-wire.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const appJs = readAppBundle(root);
const docs = readFileSync(join(root, "docs/DESKTOP_ELECTRON.md"), "utf8");

check("electron dependency present", Boolean(pkg.dependencies?.electron || pkg.devDependencies?.electron));
check("desktop npm scripts", Boolean(pkg.scripts?.desktop && pkg.scripts?.["desktop:dev"]));
check("main process exists", existsSync(join(root, "electron/main.mjs")));
check("transparent alwaysOnTop", main.includes("transparent: true") && main.includes("alwaysOnTop"));
check("frameless pet window", main.includes("frame: false"));
check("single instance lock", main.includes("requestSingleInstanceLock"));
check("tray menu", main.includes("Tray") && main.includes("开机启动"));
check("open at login", main.includes("setLoginItemSettings"));
check("click-through IPC", main.includes("setIgnoreMouseEvents") && preloadPet.includes("setClickThrough"));
check("snap to edge", main.includes("snapPetToEdge") || main.includes("pet:snap"));
check("multi-display clamp", main.includes("getDisplayMatching") || main.includes("workArea"));
check("crash/store persistence", main.includes("desktop-host.json") && main.includes("writeStore"));
check("preload pet bridge", preloadPet.includes("yueqiPet") && preloadPet.includes("contextBridge"));
check("preload app bridge", preloadApp.includes("yueqiDesktop"));
check("overlay supports electron", overlayApp.includes("yueqiPet") && overlayApp.includes("snapToEdge"));
check("desktop host module", desktopHost.includes("updateDesktopPetState"));
check("desktop presence UI", indexHtml.includes("data-desktop-presence") && indexHtml.includes("data-desktop-pet-power"));
check("app wires desktop presence", appJs.includes("wireDesktopPresence"));
check("look sync to pet", wire.includes("yueqi:avatar-look") && wire.includes("updateDesktopPetState"));
check("docs DESKTOP_ELECTRON", docs.includes("Electron") && docs.includes("点击穿透"));
check("no Live2D in electron host", !main.toLowerCase().includes("live2d") && !main.toLowerCase().includes("spine"));

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`Phase 2 verification failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`Phase 2 verification passed: ${checks.length}/${checks.length}`);
