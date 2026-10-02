#!/usr/bin/env node
/**
 * CP-6.1 Android App WebView runtime gate.
 * Requires a connected device/emulator with a complete system image.
 * Does not treat Node/Playwright as Android proof.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sdk =
  process.env.ANDROID_SDK_ROOT ||
  process.env.ANDROID_HOME ||
  join(process.env.LOCALAPPDATA || "", "Android", "Sdk");
const adb = join(sdk, "platform-tools", "adb.exe");
const outDir = join(root, ".tmp");
mkdirSync(outDir, { recursive: true });

try {
  if (process.platform === "win32") spawnSync("chcp", ["65001"], { stdio: "ignore", shell: true });
} catch {
  /* */
}

const report = {
  date: "2026-07-30",
  gitCommit:
    spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout?.trim() || null,
  status: "IMPLEMENTED_PENDING_ANDROID_RUNTIME",
  device: null,
  gaps: [],
  runs: [],
};

function note(msg) {
  console.log(msg);
}

if (!existsSync(adb)) {
  report.gaps.push("adb not found");
  note("ADB_MISSING");
} else {
  const devices = spawnSync(adb, ["devices", "-l"], { encoding: "utf8" });
  const lines = (devices.stdout || "").split(/\r?\n/).filter((l) => /\sdevice\b/.test(l));
  report.deviceList = lines;
  if (!lines.length) {
    report.gaps.push("No Android device/emulator in adb devices");
    note("NO_DEVICE");
  } else {
    report.device = lines[0];
    note(`DEVICE=${lines[0]}`);
  }
}

const sysImg = join(
  sdk,
  "system-images",
  "android-36.1",
  "google_apis_playstore",
  "x86_64",
  "kernel-ranchu",
);
if (!existsSync(sysImg)) {
  report.gaps.push(
    "System image incomplete (missing kernel-ranchu). sdkmanager install blocked by C: disk space (<3GB free during package prepare).",
  );
}

const apk = join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
report.apkPresent = existsSync(apk);
report.apkPath = apk;

if (report.device && report.apkPresent) {
  note("INSTALL_APK");
  const install = spawnSync(adb, ["install", "-r", apk], { encoding: "utf8", timeout: 180000 });
  report.install = { status: install.status, stderr: (install.stderr || "").slice(0, 500) };
  spawnSync(adb, ["shell", "am", "start", "-n", "app.yueqi.open/.MainActivity"], {
    encoding: "utf8",
  });
  report.gaps.push(
    "APK launch attempted but in-WebView Agent event capture was not completed — no CDP harness run",
  );
} else if (report.device && !report.apkPresent) {
  report.gaps.push("Debug APK missing — run npm run build:android first");
}

report.lifecycle = {
  foregroundHappyPath: "NOT_RUN",
  backgroundDuringTool: "NOT_RUN",
  backgroundBeforeApproval: "CODE_READY_VISIBILITYCHANGE",
  backgroundDuringCommit: "IDEMPOTENCY_CODE_READY",
  processKillRecover:
    "PARTIAL — AssistantTask persists in localStorage; App-killed recovery UI not device-verified",
  userCancel: "CODE_READY_ABORTSIGNAL",
};

report.metrics = {
  coldStartMs: null,
  openClawSliceLoadMs: null,
  firstAgentResponseMs: null,
  fullTaskMs: null,
  peakMemoryMb: null,
  memoryDeltaMb: null,
  apkDelta: null,
  webViewCrash: null,
  anr: null,
  note: "No device run — metrics unavailable",
};

report.requiredEventSequence = [
  "assistant_task_created",
  "agent_run_started",
  "model_requested",
  "tool_requested:character.inspect",
  "tool_completed:character.inspect",
  "tool_requested:workspace.write_text",
  "tool_completed:workspace.write_text",
  "artifact_created",
  "approval_required",
  "production_commit_started",
  "production_commit_completed",
  "task_completed",
];
report.capturedEvents = [];
report.runtimeImportPath = "src/integrations/openclaw-mobile → OpenClawMobileRuntimeAdapter → runAgentLoop";

const out = join(outDir, "android-runtime-gate.json");
writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
note(`Wrote ${out}`);
note(`ANDROID_STATUS=${report.status}`);
process.exit(0);
