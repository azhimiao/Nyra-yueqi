import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { readAppBundle } from "./lib/app-sources.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const appJs = readAppBundle(root);
const css = readFileSync(join(root, "styles.css"), "utf8");

check("主题选项", indexHtml.includes('data-theme-option="mist"') && css.includes('[data-theme="pine"]'));
check("主题模块", readFileSync(join(root, "src/ui/theme.js"), "utf8").includes("applyTheme"));
check("语音条组件", readFileSync(join(root, "src/chat/voice-bubble.js"), "utf8").includes("createVoiceBubble"));
check("语音条接线", appJs.includes("appendVoiceMessage") && appJs.includes("synthesizeAiVoiceBar"));
check("一起听", indexHtml.includes("一起听") && indexHtml.includes("data-co-listen"));
check(
  "一起看陪读",
  indexHtml.includes("一起看")
    && readFileSync(join(root, "src/phone-shell/phone-reader.js"), "utf8").includes("askCompanionAboutSelection")
    && readFileSync(join(root, "src/phone-shell/app-screens.js"), "utf8").includes("data-ebook-ask"),
);
check("视频通话", indexHtml.includes("videoCallModal") && readFileSync(join(root, "src/call/video-call.js"), "utf8").includes("captureVideoFrame"));
check("bootstrap 接入", appJs.includes("wireCompanionPresence") && appJs.includes("applyTheme"));

const productShell = readFileSync(join(root, "src/ui/product-shell.css"), "utf8");
const overlayService = readFileSync(join(root, "android/app/src/main/java/app/yueqi/companion/overlay/OverlayService.java"), "utf8");
const overlayPlugin = readFileSync(join(root, "android/app/src/main/java/app/yueqi/companion/overlay/CompanionOverlayPlugin.java"), "utf8");
const overlayBoot = readFileSync(join(root, "android/app/src/main/java/app/yueqi/companion/overlay/OverlayBootReceiver.java"), "utf8");
const manifest = readFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
const phoneScreens = readFileSync(join(root, "src/phone-shell/app-screens.js"), "utf8");
const desktopWire = readFileSync(join(root, "src/ui/desktop-presence-wire.js"), "utf8");

check(
  "小手机不再强制隐藏桌宠浮窗",
  !/body\[data-app-mode="phone"\] \.companion-float\s*\{\s*display:\s*none/.test(productShell),
);
check("小手机桌宠页有保活入口", phoneScreens.includes("data-overlay-oem-battery") && phoneScreens.includes("data-overlay-android-only"));
check("安卓 overlay 可在划掉任务后恢复", overlayService.includes("onTaskRemoved") && overlayService.includes("restoreIfNeeded"));
check("解锁后尝试恢复桌宠", overlayBoot.includes("ACTION_USER_PRESENT") && overlayBoot.includes("restoreIfNeeded"));
check("可请求忽略电池优化", overlayPlugin.includes("requestBatteryExemption") && manifest.includes("REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"));
check(
  "App 内浮窗在 overlay 自称运行时仍可在前台显示",
  desktopWire.includes("syncInAppFloatToOverlay")
    && desktopWire.includes("shouldHideInAppFloat"),
);
check("聊天开关与桌宠页开关共用同一套电源按钮", desktopWire.includes("[data-desktop-pet-power], [data-chat-pet-toggle]"));
check("应用在前台时不因 overlay 声称运行而藏浮宠", desktopWire.includes("shouldHideInAppFloat"));
check("悬浮窗把 /assets 映射到 /public/assets", overlayService.includes("rewriteOverlayAssetUri") && overlayService.includes("/public"));
check(
  "App 在前台时把 overlay 停在屏外以免挡点击",
  overlayService.includes("parkOverlayWindow") && overlayService.includes("ghost window cannot eat hits"),
);
check(
  "离开 App 后延迟把桌宠挂回桌面",
  overlayService.includes("revealOverlayWindow") && overlayService.includes("REVEAL_DELAYS_MS"),
);
check("start 等到窗口真正挂上才回报 running", overlayPlugin.includes("waitUntilAttached"));
check(
  "已有 overlay 实例时不再二次 startForegroundService",
  overlayService.includes("second startForegroundService"),
);
check(
  "updateStateJson 必须回到主线程",
  overlayService.includes("Looper.myLooper()") && overlayService.includes("Looper.getMainLooper()"),
);
check(
  "overlayStopped 只在用户关闭时广播",
  overlayService.includes("requestedStop && !stillWanted") && overlayService.includes("emitOverlayStopped"),
);
check(
  "桌宠库开关关闭不被 petBusy 卡住",
  desktopWire.includes("isPowerOn()") && desktopWire.includes("beginCloseGeneration"),
);

const floatJs = readFileSync(join(root, "src/ui/companion-float.js"), "utf8");
const floatCss = `${css}\n${productShell}`;
check(
  "桌宠操作面板贴着角色而不是整窗 top",
  floatJs.includes("decideCompanionFloatPanelLayout")
    && !/panel\.style\.position\s*=\s*"fixed"/.test(floatJs)
    && floatCss.includes("bottom: calc(100% + 8px)"),
);
check(
  "拖过的桌宠不再被 CSS bottom 拉高",
  floatJs.includes('root.style.bottom = "auto"')
    && /body\[data-active-panel="chat"\] \.companion-float:not\(\.is-positioned\)/.test(css),
);

const placementTest = spawnSync(process.execPath, [join(root, "src/ui/companion-float-placement.test.mjs")], {
  cwd: root,
  encoding: "utf8",
});
check(
  "桌宠面板贴边单测",
  placementTest.status === 0,
  (placementTest.stderr || placementTest.stdout || "").trim().split("\n").pop() || "",
);

const powerTest = spawnSync(process.execPath, [join(root, "src/ui/pet-power-control.test.mjs")], {
  cwd: root,
  encoding: "utf8",
});
check(
  "桌宠开关决策单测",
  powerTest.status === 0,
  (powerTest.stderr || powerTest.stdout || "").trim().split("\n").pop() || "",
);

const visibilityTest = spawnSync(process.execPath, [join(root, "src/ui/pet-presence-visibility.test.mjs")], {
  cwd: root,
  encoding: "utf8",
});
check(
  "前台可见性规则单测",
  visibilityTest.status === 0,
  (visibilityTest.stderr || visibilityTest.stdout || "").trim().split("\n").pop() || "",
);

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`Companion presence failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`Companion presence passed: ${checks.length}/${checks.length}`);
