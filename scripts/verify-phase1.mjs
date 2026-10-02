/**
 * Phase 1 verification — Android overlay host (plugin, service, UI, permission flow).
 * Run: node scripts/verify-phase1.mjs
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

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const phoneScreens = readFileSync(join(root, "src/phone-shell/app-screens.js"), "utf8");
const overlayHtml = readFileSync(join(root, "overlay.html"), "utf8");
const appJs = readAppBundle(root);
const manifest = readFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
const mainActivity = readFileSync(
  join(root, "android/app/src/main/java/app/yueqi/companion/MainActivity.java"),
  "utf8"
);
const servicePath = join(
  root,
  "android/app/src/main/java/app/yueqi/companion/overlay/OverlayService.java"
);
const pluginPath = join(
  root,
  "android/app/src/main/java/app/yueqi/companion/overlay/CompanionOverlayPlugin.java"
);
const platformJs = readFileSync(join(root, "src/platform/companion-overlay.js"), "utf8");
const wireJs = readFileSync(join(root, "src/ui/overlay-presence-wire.js"), "utf8");
const desktopWire = readFileSync(join(root, "src/ui/desktop-presence-wire.js"), "utf8");
const vite = readFileSync(join(root, "vite.config.js"), "utf8");
const plan = readFileSync(join(root, "docs/FLOATING_COMPANION_PLATFORM_PLAN.md"), "utf8");

check("Overlay HTML exists", existsSync(join(root, "overlay.html")));
check("Overlay app script exists", existsSync(join(root, "src/overlay/overlay-app.js")));
check("Vite builds overlay page", vite.includes("overlay: \"overlay.html\"") || vite.includes("overlay.html"));
check("Vite relative base for file:// overlay", /base:\s*["']\.\/["']/.test(vite));

check("Manifest SYSTEM_ALERT_WINDOW", manifest.includes("SYSTEM_ALERT_WINDOW"));
check("Manifest FOREGROUND_SERVICE", manifest.includes("FOREGROUND_SERVICE"));
check("Manifest SPECIAL_USE", manifest.includes("FOREGROUND_SERVICE_SPECIAL_USE"));
check("Manifest OverlayService", manifest.includes(".overlay.OverlayService"));
check("Manifest specialUse subtype", manifest.includes("PROPERTY_SPECIAL_USE_FGS_SUBTYPE"));

check("OverlayService.java present", existsSync(servicePath));
check("CompanionOverlayPlugin.java present", existsSync(pluginPath));
check("MainActivity registers plugin", mainActivity.includes("CompanionOverlayPlugin"));

const service = readFileSync(servicePath, "utf8");
const plugin = readFileSync(pluginPath, "utf8");
check("Service uses TYPE_APPLICATION_OVERLAY", service.includes("TYPE_APPLICATION_OVERLAY"));
check("Service foreground notification actions", service.includes("返回月栖") && service.includes("关闭悬浮"));
check("Service persists position", service.includes("KEY_X") && service.includes("KEY_Y"));
check("Service restores state to WebView", service.includes("pushStateToWeb"));
check("Overlay remaps catalog /assets onto /public/assets", service.includes("rewriteOverlayAssetUri"));
check("Plugin start waits until the overlay window is attached", plugin.includes("waitUntilAttached"));
check("Plugin check/request/start/stop", ["checkPermission", "requestPermission", "start", "stop", "updateState"].every((m) => plugin.includes(m)));

check("JS bridge CompanionOverlay", platformJs.includes("CompanionOverlay") && platformJs.includes("startOverlay"));
check("Presence UI in index", indexHtml.includes("data-overlay-presence") && indexHtml.includes("data-overlay-start"));
check("Permission + OEM buttons", indexHtml.includes("data-overlay-request-permission") && indexHtml.includes("data-overlay-oem-battery"));
check(
  "In-app float stays visible while Yueqi is foreground",
  desktopWire.includes("shouldHideInAppFloat")
    && desktopWire.includes("isAppShellVisible")
    && appJs.includes("is-system-overlay-hidden"),
);
check(
  "Overlay remaps app paths under /public",
  service.includes("rewriteOverlayAssetUri") && service.includes('"/public" + path'),
);
check(
  "Overlay hides while Yueqi is foreground",
  service.includes("setHostAppForeground") && mainActivity.includes("setHostAppForeground"),
);
check(
  "Chat and companion share one pet power",
  indexHtml.includes("data-chat-pet-toggle")
    && indexHtml.includes('data-chat-pet-toggle data-desktop-pet-power')
    && desktopWire.includes("PET_POWER_SELECTOR"),
);
check("App wires overlay presence", appJs.includes("wireOverlayPresence"));
check("Overlay three modes in page", overlayHtml.includes("collapsed") && overlayHtml.includes("bubble") && overlayHtml.includes("chat"));
const zhLocale = readFileSync(join(root, "src/i18n/locales/zh-CN.js"), "utf8");
check(
  "Honest degrade copy",
  wireJs.includes("tKeepAlive")
    && zhLocale.includes("网页里只能在月栖内部看到悬浮")
    && zhLocale.includes("没有它，退出月栖后桌宠会消失")
    && desktopWire.includes("overlayPermissionNeeded"),
);
check(
  "Desk pet requires overlay permission",
  desktopWire.includes("writePendingEnable(true)")
    && desktopWire.includes("overlayPermissionGuide")
    && !/if \(!permission\.granted\)[\s\S]{0,200}setInAppFloatHidden\(false\)/.test(desktopWire),
);
check("Play checklist doc", existsSync(join(root, "docs/ANDROID_OVERLAY_PLAY_CHECKLIST.md")));
check("OEM matrix doc", existsSync(join(root, "docs/ANDROID_OEM_TEST_MATRIX.md")));
check("POST_NOTIFICATIONS request on start", plugin.includes("POST_NOTIFICATIONS") || plugin.includes("requestPostNotificationsIfNeeded"));
check("Plan Phase 1 marked in progress or done", plan.includes("Android Overlay") || plan.includes("Phase 1"));

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`Phase 1 verification failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`Phase 1 verification passed: ${checks.length}/${checks.length}`);
