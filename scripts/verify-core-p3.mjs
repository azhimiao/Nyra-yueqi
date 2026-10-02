/**
 * PAIOS P3 contract checks — host adapters, consent gate, isolation boundaries.
 * Marks implementation_green / device_pending readiness; not L3 product acceptance.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const requiredFiles = [
  "src/host/index.js",
  "src/host/constants.js",
  "src/host/screen-capture-gate.js",
  "src/host/task-state-projection.js",
  "src/host/desk-pet-host-adapter.js",
  "src/host/overlay-host-adapter.js",
  "src/host/isolation.js",
  "src/host/android-permission-stubs.js",
  "electron/host-core.mjs",
  "electron/main.mjs",
  "electron/preload-pet.cjs",
  "electron/preload-app.cjs",
  "docs/qa/paios/P3/REVIEW.md",
  "docs/qa/paios/P3/DEVICE_PENDING.md",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const {
  HOST_SCHEMA_VERSION,
  HOST_TASK_STATES,
  SCREEN_CAPTURE_GRANT_KEY,
  createScreenCaptureGate,
  __setScreenCaptureStorageForTests,
  __memoryStorageForTests,
  mapAgentStateToHost,
  projectTaskState,
  projectTaskList,
  createDeskPetHostAdapter,
  createOverlayHostAdapter,
  createAndroidOverlayStubAdapter,
  ANDROID_FGS_CHECKLIST,
  WINDOWS_ISOLATION,
  ANDROID_ISOLATION,
  listIsolationRules,
  detectIsolationViolation,
} = await import("../src/host/index.js");

check("host schema version 1", HOST_SCHEMA_VERSION === 1);
check("grant key yueqi.host.screenCaptureGrant.v1", SCREEN_CAPTURE_GRANT_KEY === "yueqi.host.screenCaptureGrant.v1");
check("four host task states", HOST_TASK_STATES.length === 4);

// --- ScreenCaptureGate ---
{
  const storage = __memoryStorageForTests();
  const gate = createScreenCaptureGate({ storage });
  check("no grant by default", gate.hasActiveGrant() === false);
  check("capture denied without grant", gate.assertCanCapture().ok === false);

  const autoWouldCapture = gate.canCapture();
  check("never auto-capture without grant", autoWouldCapture === false);

  const bad = gate.grant({ surface: "not-a-surface" });
  check("reject invalid surface", bad.ok === false);

  const granted = gate.grant({ surface: "simulator", scope: "session", ttlMs: 60_000 });
  check("explicit grant stored", granted.ok === true && gate.hasActiveGrant());
  check("capture allowed after grant", gate.assertCanCapture({ surface: "simulator" }).ok === true);
  check("grant persisted in storage", Boolean(storage.getItem(SCREEN_CAPTURE_GRANT_KEY)));

  gate.revoke();
  check("revoke clears grant", gate.hasActiveGrant() === false);
  check("capture denied after revoke", gate.canCapture() === false);

  // expired grant
  const gate2 = createScreenCaptureGate({ storage: __memoryStorageForTests() });
  gate2.grant({ surface: "windows-electron", scope: "session", ttlMs: 1 });
  await new Promise((r) => setTimeout(r, 5));
  check("expired session grant inactive", gate2.hasActiveGrant() === false);

  __setScreenCaptureStorageForTests(__memoryStorageForTests());
}

// --- TaskStateProjection ---
{
  check("draft → waiting", mapAgentStateToHost("draft") === "waiting");
  check("awaiting_approval → waiting", mapAgentStateToHost("awaiting_approval") === "waiting");
  check("running → running", mapAgentStateToHost("running") === "running");
  check("completed → done", mapAgentStateToHost("completed") === "done");
  check("paused → blocked", mapAgentStateToHost("paused") === "blocked");
  check("failed → blocked", mapAgentStateToHost("failed") === "blocked");

  const proj = projectTaskState({
    id: "t1",
    state: "awaiting_approval",
    characterId: "xingli",
    intent: { title: "日历草稿", summary: "周三复盘" },
  });
  check(
    "projection bubble waiting",
    proj.state === "waiting" && proj.bubbleText.includes("等你确认") && proj.taskId === "t1",
  );

  const list = projectTaskList([
    { id: "a", state: "completed", intent: { title: "A" } },
    { id: "b", state: "running", intent: { title: "B" } },
    { id: "c", state: "awaiting_approval", intent: { title: "C" } },
  ]);
  check("list orders waiting first", list[0]?.taskId === "c" && list[1]?.taskId === "b");
}

// --- DeskPetHostAdapter ---
{
  /** @type {Record<string, unknown>} */
  let pet = { mode: "collapsed", bubbleText: "" };
  let phoneOpens = 0;
  const desk = createDeskPetHostAdapter({
    getPetState: () => pet,
    updatePetState: async (patch) => {
      pet = { ...pet, ...patch };
    },
    openPhone: async () => {
      phoneOpens += 1;
    },
  });
  check("desk mayExecuteAgent false", desk.mayExecuteAgent === false);
  check("desk describe isolation", desk.describe().isolationRules.includes("capture_requires_stored_grant"));

  await desk.pushPetState({ name: "星梨", mode: "collapsed" });
  check("desk push pet state", pet.name === "星梨");

  await desk.openPhone();
  check("desk open phone", phoneOpens === 1);

  const bubble = await desk.showTaskBubble({
    id: "task-9",
    state: "running",
    intent: { title: "整理笔记", characterId: "xingli" },
  });
  check(
    "desk task bubble",
    bubble.ok && pet.mode === "bubble" && String(pet.bubbleText).includes("正在做") && bubble.projection.state === "running",
  );
}

// --- OverlayHostAdapter + Android stubs ---
{
  const overlay = createAndroidOverlayStubAdapter();
  check("overlay device_pending", overlay.devicePending === true);
  check("overlay mayExecuteAgent false", overlay.mayExecuteAgent === false);

  const perms = await overlay.checkPermissions();
  check("overlay stub permissions", perms.stub === true && perms.devicePending === true);

  const start = await overlay.startOverlay({ mode: "collapsed" });
  check("overlay start stubbed", start.ok === false && start.reason === "device_pending");

  const bubble = await overlay.showTaskBubble({
    id: "t-android",
    state: "paused",
    intent: { title: "看屏摘要" },
  });
  check("overlay task bubble projection", bubble.ok && bubble.projection.state === "blocked");

  const checklist = overlay.foregroundServiceChecklist();
  check("fgs checklist ≥6", checklist.length >= 6);
  check("ANDROID_FGS_CHECKLIST aligned", ANDROID_FGS_CHECKLIST.length === checklist.length);

  const bare = createOverlayHostAdapter({ devicePending: true, plugin: null });
  const req = await bare.requestOverlayPermission();
  check("null plugin → device_pending", req.reason === "device_pending");
}

// --- Isolation boundaries ---
{
  const winRules = listIsolationRules("windows-electron");
  const andRules = listIsolationRules("android-capacitor");
  check("windows isolation rules", winRules.includes("pet_renderer_must_not_import_agent"));
  check("android isolation rules", andRules.includes("media_projection_per_session_consent"));
  check("windows pet mayExecuteAgent false", WINDOWS_ISOLATION.processes.petRenderer.mayExecuteAgent === false);
  check("android overlay mayExecuteAgent false", ANDROID_ISOLATION.processes.overlayWebView.mayExecuteAgent === false);

  const petPreload = readFileSync(join(root, "electron/preload-pet.cjs"), "utf8");
  const mainSrc = readFileSync(join(root, "electron/main.mjs"), "utf8");
  const hostCoreSrc = readFileSync(join(root, "electron/host-core.mjs"), "utf8");
  const overlayAdapter = readFileSync(join(root, "src/host/overlay-host-adapter.js"), "utf8");

  check("pet preload isolation", detectIsolationViolation(petPreload, "pet").ok);
  check("main isolation", detectIsolationViolation(mainSrc, "main").ok);
  check("overlay adapter isolation", detectIsolationViolation(overlayAdapter, "overlay").ok);
  check("host-core uses shared src/host", hostCoreSrc.includes("../src/host/index.js"));
  check("main gates capture with hostCore", mainSrc.includes("assertCaptureAllowed") && mainSrc.includes("SCREEN_CAPTURE_NO_GRANT"));
  check("main syncs grant from sensing", mainSrc.includes("syncGrantFromSensing"));
  check("main wires open-phone + project-task", mainSrc.includes("desktop:open-phone") && mainSrc.includes("desktop:project-task"));
  check("preload-app exposes projectTask", readFileSync(join(root, "electron/preload-app.cjs"), "utf8").includes("projectTask"));
}

// --- Docs ---
{
  const review = readFileSync(join(root, "docs/qa/paios/P3/REVIEW.md"), "utf8");
  const pending = readFileSync(join(root, "docs/qa/paios/P3/DEVICE_PENDING.md"), "utf8");
  const desktopDoc = readFileSync(join(root, "docs/DESKTOP_ELECTRON.md"), "utf8");
  check("REVIEW mentions device_pending", /device_pending/i.test(review));
  check("REVIEW mentions ScreenCaptureGate", /ScreenCaptureGate/.test(review));
  check("DEVICE_PENDING has OEM matrix", /小米|华为|OPPO|vivo/.test(pending));
  check("DESKTOP_ELECTRON isolation notes", /隔离|isolation/i.test(desktopDoc));
}

const failed = checks.filter((c) => !c.pass);
const passed = checks.length - failed.length;
const score = checks.length ? passed / checks.length : 0;
console.log(`\n${passed}/${checks.length} checks passed`);
console.log(`verify score: ${(score * 100).toFixed(1)}%`);
if (failed.length) {
  console.log("Failed:");
  for (const f of failed) console.log(` - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
