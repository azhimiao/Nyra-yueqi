/**
 * PAIOS P5 contract checks — Developer Skill SDK.
 * Conformance / sandbox / lifecycle / memory isolation.
 * Marks implementation_green readiness; not L3 / user_accepted.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

const requiredFiles = [
  "src/skills/schema.js",
  "src/skills/compatibility.js",
  "src/skills/permissions.js",
  "src/skills/risk.js",
  "src/skills/sandbox.js",
  "src/skills/signature.js",
  "src/skills/capability-api.js",
  "src/skills/ui-slot-api.js",
  "src/skills/event-api.js",
  "src/skills/conformance.js",
  "src/skills/simulator.js",
  "src/skills/memory-gate.js",
  "src/skills/lifecycle.js",
  "src/skills/runtime.js",
  "src/skills/index.js",
  "sdk/skill-package/template/skill.json",
  "sdk/skill-package/template/index.js",
  "sdk/skill-package/template/README.md",
  "docs/sdk/SKILL_SDK.md",
  "docs/qa/paios/P5/REVIEW.md",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const sdk = await import("../src/skills/index.js");
const templateManifest = JSON.parse(
  readFileSync(join(root, "sdk/skill-package/template/skill.json"), "utf8"),
);
const templateEntry = readFileSync(
  join(root, "sdk/skill-package/template/index.js"),
  "utf8",
);
const { execute, validateInput, previewEffect } = await import(
  "../sdk/skill-package/template/index.js"
);

check("SKILL_SDK_VERSION === 1", sdk.SKILL_SDK_VERSION === 1);
check("schema id", sdk.SKILL_JSON_SCHEMA_ID === "yueqi.skill.package.v1");
check("install key", sdk.SKILL_INSTALL_KEY === "yueqi.skills.installed.v1");
check("sandbox default deny has network", sdk.SANDBOX_DEFAULT_DENY.includes("network"));
check("sandbox default deny has file", sdk.SANDBOX_DEFAULT_DENY.includes("file"));
check("sandbox default deny has clipboard", sdk.SANDBOX_DEFAULT_DENY.includes("clipboard"));
check("sandbox default deny has credentials", sdk.SANDBOX_DEFAULT_DENY.includes("credentials"));

// --- Manifest / schema ---
{
  const ok = sdk.validateSkillManifest(templateManifest);
  check("template manifest valid", ok.ok === true, ok.ok ? ok.value.id : ok.reason);

  const drift = sdk.detectSchemaDrift(ok.value);
  check("template no schema drift", drift.ok === true);

  const badSchema = sdk.validateSkillManifest({
    ...templateManifest,
    schemaId: "wrong",
  });
  check("schema drift blocked", badSchema.ok === false && badSchema.reason === "schema_drift");

  const badPerm = sdk.validateSkillManifest({
    ...templateManifest,
    permissions: ["laser-beams"],
  });
  check("unknown permission blocked", badPerm.ok === false);

  const netOnR0 = sdk.validateSkillManifest({
    ...templateManifest,
    permissions: ["network"],
  });
  check("R0+network blocked at schema", netOnR0.ok === false);
}

// --- Compatibility ---
{
  const compat = sdk.checkSdkCompatibility(templateManifest);
  check("template sdk compatible", compat.ok === true);

  const badWin = sdk.checkSdkCompatibility({
    ...templateManifest,
    minHostSdk: 99,
    maxHostSdk: 99,
  });
  check("incompatible sdk window blocked", badWin.ok === false);

  const up = sdk.checkUpgradeCompatibility("1.0.0", "1.1.0");
  check("patch/minor upgrade ok", up.ok === true && up.requiresRollbackSlot === true);

  const major = sdk.checkUpgradeCompatibility("1.0.0", "2.0.0");
  check("major upgrade needs rollback", major.ok === true && major.kind === "major");

  const down = sdk.checkUpgradeCompatibility("1.1.0", "1.0.0");
  check("downgrade via upgrade blocked", down.ok === false);

  const reserved = sdk.canBindCapability("calendar-crud", ["calendar-crud"]);
  check("reserved capability blocked", reserved.ok === false);
}

// --- Permissions + risk ---
{
  const denied = sdk.checkPermission(
    { skillId: "x", declared: [], granted: [] },
    "network",
  );
  check("undeclared network denied", denied.reason === "undeclared_permission");

  const declaredOnly = sdk.checkPermission(
    { skillId: "x", declared: ["network"], granted: [] },
    "network",
  );
  check("declared but ungranted denied", declaredOnly.reason === "permission_denied");

  const granted = sdk.checkPermission(
    { skillId: "x", declared: ["network"], granted: ["network"] },
    "network",
  );
  check("declared+granted network ok", granted.ok === true);

  const elev = sdk.checkSkillRisk({
    manifestRisk: "R0",
    requestedRisk: "R2",
    permissions: [],
  });
  check("risk elevation blocked", elev.ok === false);

  const r0 = sdk.checkSkillRisk({
    manifestRisk: "R0",
    requestedRisk: "R0",
    permissions: [],
  });
  check("R0 risk ok", r0.ok === true && r0.requiresApproval === false);
}

// --- Sandbox ---
{
  const sb = sdk.createSandbox({
    skillId: "local-echo-status",
    manifestRisk: "R0",
    declaredPermissions: [],
    grantedPermissions: [],
  });
  check("sandbox blocks undeclared network", sdk.isSurfaceBlocked(sb, "network"));
  check("sandbox blocks undeclared file", sdk.isSurfaceBlocked(sb, "file"));
  check("sandbox clipboard denied", sb.requestClipboard().ok === false);
  check("sandbox credentials denied", sb.requestCredentials().ok === false);

  const withFile = sdk.createSandbox({
    skillId: "f",
    manifestRisk: "R1",
    declaredPermissions: ["file"],
    grantedPermissions: ["file"],
  });
  check("path escape blocked", withFile.requestFile({ path: "../etc/passwd" }).ok === false);
  check("relative file allowed when granted", withFile.requestFile({ path: "notes.txt" }).ok === true);
}

// --- Signature / provenance ---
{
  const hash = sdk.hashSkillPackage({
    manifest: templateManifest,
    entrySource: templateEntry,
  });
  check("package hash length 64", typeof hash === "string" && hash.length === 64);

  const secret = "test-publisher-secret";
  const sig = sdk.signPackageHash(hash, secret);
  const ver = sdk.verifyPackageSignature(hash, sig, secret);
  check("signature verifies", ver.ok === true);

  const badSig = sdk.verifyPackageSignature(hash, "0".repeat(64), secret);
  check("bad signature rejected", badSig.ok === false);

  const integrity = sdk.verifyPackageIntegrity({
    pkg: { manifest: templateManifest, entrySource: templateEntry },
    expectedHash: hash,
    signature: sig,
    publisherSecret: secret,
  });
  check("integrity ok", integrity.ok === true);

  const mismatch = sdk.verifyPackageIntegrity({
    pkg: { manifest: templateManifest, entrySource: templateEntry + " " },
    expectedHash: hash,
  });
  check("hash mismatch detected", mismatch.ok === false);

  const prov = sdk.buildProvenance({
    manifest: templateManifest,
    hash,
    signature: sig,
    source: "local-template",
  });
  check("provenance skillId", prov.skillId === "local-echo-status");
}

// --- Conformance gate ---
{
  const validatedManifest = sdk.validateSkillManifest(templateManifest).value;
  const hash = sdk.hashSkillPackage({
    manifest: validatedManifest,
    entrySource: templateEntry,
  });
  const conf = sdk.runConformance({
    manifest: templateManifest,
    entrySource: templateEntry,
    hash,
  });
  check(
    "template conformance passes",
    conf.ok === true,
    conf.ok ? "" : (conf.failed || []).map((f) => f.name).join(","),
  );

  const evil = sdk.runConformance({
    manifest: {
      ...templateManifest,
      id: "evil-net",
      risk: "R1",
      permissions: [],
    },
    entrySource: "export function execute(){ eval('1') }",
    hash: "deadbeef",
  });
  check("evil entry fails conformance", evil.ok === false);
  check(
    "conformance fail ⇒ cannot load production",
    sdk.assertConformanceForProduction(evil).ok === false,
  );
}

// --- Simulator fault matrix ---
{
  sdk.__resetSimulatorForTests();
  const skill = {
    manifest: templateManifest,
    execute,
    input: { statusText: "整理书桌", label: "今日" },
  };

  const normal = await sdk.runSkillSimulator(skill, { mode: "normal" });
  check("simulator normal ok", normal.ok === true && normal.result?.ok === true);

  const deny = await sdk.runSkillSimulator(skill, {
    mode: "permission_deny",
    denyPermission: "network",
  });
  check("simulator permission_deny", deny.ok === false && deny.reason === "permission_denied");

  const offline = await sdk.runSkillSimulator(
    {
      manifest: {
        ...templateManifest,
        id: "net-demo",
        risk: "R1",
        permissions: ["network"],
      },
      execute: async (_i, ctx) => ctx.sandbox.requestNetwork({ url: "https://x.test" }),
      grantedPermissions: ["network"],
      input: {},
    },
    { mode: "offline" },
  );
  check("simulator offline", offline.ok === false && offline.reason === "offline");

  const timeout = await sdk.runSkillSimulator(skill, { mode: "timeout", timeoutMs: 10 });
  check("simulator timeout", timeout.ok === false && timeout.reason === "timeout");

  const cancel = await sdk.runSkillSimulator(skill, { mode: "cancel" });
  check("simulator cancel", cancel.ok === false && cancel.reason === "cancelled");

  sdk.__resetSimulatorForTests();
  const key = `${templateManifest.id}:${JSON.stringify(skill.input)}`;
  sdk.runSkillSimulator._inflight = new Map([[key, { started: Date.now() }]]);
  const dup = await sdk.runSkillSimulator(skill, { mode: "duplicate" });
  check("simulator duplicate", dup.ok === false && dup.reason === "duplicate_call");
  sdk.__resetSimulatorForTests();

  const matrix = await sdk.runSimulatorFaultMatrix(skill);
  check("fault matrix has 6 modes", Object.keys(matrix).length === 6);
}

// --- Lifecycle: install / upgrade / rollback / uninstall ---
{
  const storage = memoryStorage();
  sdk.__setSkillStorageForTests(storage);
  sdk.__resetSkillLifecycleForTests();
  sdk.__resetProductionRuntimeForTests();

  const secret = "p5-verify-secret";
  const install = sdk.installSkillPackage({
    manifest: templateManifest,
    entrySource: templateEntry,
    publisherSecret: secret,
    grantedPermissions: [],
    source: "local-template",
  });
  check("install template", install.ok === true, install.reason || "");
  check("installed listed", Boolean(sdk.getInstalledSkill("local-echo-status")));

  sdk.setSkillData("local-echo-status", "note", "keep-me");
  sdk.trackSkillTask("local-echo-status", "task-demo-1");
  check("skill data set", sdk.getSkillData("local-echo-status", "note").value === "keep-me");

  const v2 = {
    ...templateManifest,
    version: "1.0.1",
    description: templateManifest.description + " (patch)",
  };
  const entry2 = templateEntry + "\n// patch\n";
  const upgraded = sdk.upgradeSkillPackage({
    manifest: v2,
    entrySource: entry2,
    publisherSecret: secret,
    grantedPermissions: [],
  });
  check("upgrade patch", upgraded.ok === true, upgraded.reason || "");
  check("version after upgrade", sdk.getInstalledSkill("local-echo-status")?.manifest.version === "1.0.1");
  check("rollback slot exists", Boolean(sdk.getRollbackSlot("local-echo-status")));

  const rolled = sdk.rollbackSkill("local-echo-status");
  check("rollback ok", rolled.ok === true);
  check(
    "version after rollback",
    sdk.getInstalledSkill("local-echo-status")?.manifest.version === "1.0.0",
  );

  // Re-upgrade then production load
  sdk.upgradeSkillPackage({
    manifest: v2,
    entrySource: entry2,
    publisherSecret: secret,
  });

  const loaded = sdk.loadSkillIntoProduction("local-echo-status", {
    execute,
    validateInput,
    previewEffect,
    publisherSecret: secret,
  });
  check("load production after conformance", loaded.ok === true, loaded.reason || "");

  const invoked = await sdk.invokeProductionSkill("local-echo-status", {
    statusText: "ok",
  });
  check("invoke production", invoked.ok === true && invoked.result?.ok === true);

  // Conformance fail cannot load: break entry with eval after reinstall trick
  sdk.uninstallSkill("local-echo-status");
  const badInstall = sdk.installSkillPackage({
    manifest: { ...templateManifest, id: "bad-eval-skill" },
    entrySource: "export function execute(){ return eval('1'); }",
    publisherSecret: secret,
    skipConformance: true,
  });
  // Force flag true but runtime re-runs conformance
  if (badInstall.ok) {
    const skillsRaw = JSON.parse(storage.getItem(sdk.SKILL_INSTALL_KEY));
    skillsRaw.skills["bad-eval-skill"].conformancePassed = true;
    storage.setItem(sdk.SKILL_INSTALL_KEY, JSON.stringify(skillsRaw));
  }
  const refuse = sdk.loadSkillIntoProduction("bad-eval-skill", {
    execute: () => ({ ok: true }),
    publisherSecret: secret,
  });
  check("failed conformance cannot load production", refuse.ok === false);

  // Clean uninstall — no orphan tasks/data
  sdk.__resetSkillLifecycleForTests();
  sdk.installSkillPackage({
    manifest: templateManifest,
    entrySource: templateEntry,
    publisherSecret: secret,
    source: "local-template",
  });
  sdk.setSkillData("local-echo-status", "x", 1);
  sdk.trackSkillTask("local-echo-status", "t1");
  /** @type {string[]} */
  const cancelled = [];
  const un = sdk.uninstallSkill("local-echo-status", {
    cancelTasks: (ids) => cancelled.push(...ids),
  });
  check("uninstall ok", un.ok === true);
  check("uninstall cancelled tasks", cancelled.includes("t1"));
  check("no installed after uninstall", sdk.getInstalledSkill("local-echo-status") === null);
  check("no skill data after uninstall", sdk.getSkillData("local-echo-status", "x").ok === false);
  check("no rollback after uninstall", sdk.getRollbackSlot("local-echo-status") === null);
  check("orphan tasks count 0", un.purged?.orphanTasks === 0);
  check("orphan data count 0", un.purged?.orphanData === 0);
}

// --- Memory gate: third-party cannot read private character memory ---
{
  const privateItem = {
    id: "mem-private",
    characterId: "char-a",
    privacyLevel: "private",
    content: "只给 TA 的秘密",
  };
  const sharedItem = {
    id: "mem-shared",
    characterId: "char-a",
    privacyLevel: "shared",
    content: "公开偏好",
  };

  const third = sdk.thirdPartyMemoryContext("third-party-skill");
  const blocked = sdk.canReadCharacterMemory(third, privateItem);
  check("third-party private memory denied", blocked.ok === false);

  const filtered = sdk.filterMemoryForSkill(third, [privateItem, sharedItem]);
  check("third-party filter allows none", filtered.allowed.length === 0);

  const sharedOnly = {
    skillId: "s",
    declared: ["character_memory_shared"],
    granted: ["character_memory_shared"],
    characterMemoryAccess: "shared",
    skillCharacterId: "char-a",
  };
  check(
    "shared grant cannot read private",
    sdk.canReadCharacterMemory(sharedOnly, privateItem).ok === false,
  );
  check(
    "shared grant can read shared",
    sdk.canReadCharacterMemory(sharedOnly, sharedItem).ok === true,
  );

  const privCtx = {
    skillId: "s",
    declared: ["character_memory_private"],
    granted: ["character_memory_private"],
    characterMemoryAccess: "private",
    skillCharacterId: "char-a",
  };
  check("private grant can read private", sdk.canReadCharacterMemory(privCtx, privateItem).ok === true);

  const cross = {
    ...privCtx,
    skillCharacterId: "char-b",
  };
  check(
    "cross-character isolation",
    sdk.canReadCharacterMemory(cross, privateItem).reason === "character_isolation",
  );
}

// --- UI slot + events + capability API ---
{
  const uiReg = new Map();
  const uiOk = sdk.contributeUiSlot(
    {
      skillId: "local-echo-status",
      declaredSlots: ["task_center_row"],
      payload: {
        slot: "task_center_row",
        skillId: "local-echo-status",
        title: "状态回声",
        body: "低风险本地摘要",
      },
    },
    uiReg,
  );
  check("ui slot contribute", uiOk.ok === true);

  const uiBad = sdk.contributeUiSlot(
    {
      skillId: "local-echo-status",
      declaredSlots: ["task_center_row"],
      payload: {
        slot: "settings_panel",
        skillId: "local-echo-status",
        title: "debug hash",
        body: "x",
      },
    },
    uiReg,
  );
  check("undeclared ui slot blocked", uiBad.ok === false);

  const bus = sdk.createEventBus();
  let saw = false;
  bus.on("skill.installed", () => {
    saw = true;
  });
  bus.emit("skill.installed", { skillId: "x" });
  check("event bus emit", saw === true);
  check("unknown event rejected", bus.emit("nope").ok === false);

  const defined = sdk.defineSkillCapability({
    manifest: templateManifest,
    grantedPermissions: [],
    handlers: { execute, validateInput, previewEffect },
  });
  check("defineSkillCapability", defined.ok === true);

  const shadow = sdk.defineSkillCapability({
    manifest: {
      ...templateManifest,
      id: "daily-briefing",
      capabilities: ["daily-briefing"],
    },
    handlers: { execute: () => ({ ok: true }) },
  });
  check("cannot shadow first-party capability", shadow.ok === false);
}

// --- Docs mention required topics ---
{
  const doc = readFileSync(join(root, "docs/sdk/SKILL_SDK.md"), "utf8");
  for (const topic of ["生命周期", "数据最小化", "UI 规范", "错误规范", "兼容"]) {
    check(`docs cover ${topic}`, doc.includes(topic));
  }
}

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;
const total = checks.length;
const score = `${passed}/${total}`;

const outDir = join(root, "docs/qa/paios/P5");
mkdirSync(outDir, { recursive: true });
const result = {
  wave: "P5",
  script: "verify:core-p5",
  score,
  passed,
  failed,
  total,
  at: new Date().toISOString(),
  status: failed === 0 ? "implementation_green" : "red",
  checks,
};
writeFileSync(join(outDir, "LAST_VERIFY.json"), JSON.stringify(result, null, 2), "utf8");

console.log(`\nP5 verify: ${score} ${result.status}`);
if (failed) process.exitCode = 1;
