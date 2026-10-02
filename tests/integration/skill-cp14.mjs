/**
 * CP-14 — Declarative Skill install + permission grant loop.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkRuntimeCapability,
  installSkillWithGrants,
  setSkillEnabled,
  uninstallSkillFromPlatform,
  missingInstallGrants,
} from "../../src/skill-platform/install-flow.js";
import { getCatalogEntry, getInstallation } from "../../src/skill-platform/store.js";
import { isCapabilityGranted } from "../../src/skill-platform/runtime.js";
import { createSandbox, isSurfaceBlocked } from "../../src/skills/sandbox.js";
import { checkPermission } from "../../src/skills/permissions.js";
import { __setSkillStorageForTests } from "../../src/skills/lifecycle.js";

const failures = [];
function assert(c, m) {
  if (!c) failures.push(m);
}

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, v);
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

function readFixtureFiles(dir, prefix = "") {
  /** @type {Record<string, string>} */
  const files = {};
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    const rel = prefix ? `${prefix}/${name.name}` : name.name;
    if (name.isDirectory()) {
      Object.assign(files, readFixtureFiles(full, rel));
    } else {
      files[rel.replace(/\\/g, "/")] = readFileSync(full, "utf8");
    }
  }
  return files;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const storage = makeMemoryStorage();
globalThis.window = { localStorage: storage };

const store = await import("../../src/skill-platform/store.js");
const audit = await import("../../src/skill-platform/audit.js");
const profiles = await import("../../src/agents/profile-store.js");
const runStore = await import("../../src/skill-platform/run-store.js");
const conversationStore = await import("../../src/conversation/store.js");
const { __setAgentStorageForTests, clearAllAgentTasks } = await import(
  "../../src/agent/task-store.js"
);
const { registerBuiltinCapabilities } = await import("../../src/agent/capabilities/index.js");
const { __resetIdSeqForTests } = await import("../../src/agent/schema.js");

store.__setSkillPlatformStorageForTests(storage);
audit.__setSkillAuditStorageForTests(storage);
profiles.__setAgentProfileStorageForTests(storage);
runStore.__setSkillRunStorageForTests(storage);
conversationStore.__setConversationStorageForTests(storage);
__setAgentStorageForTests(storage);
__setSkillStorageForTests(storage);

runStore.__resetSkillRunIdSeqForTests?.();
__resetIdSeqForTests();
registerBuiltinCapabilities();
store.clearAllSkillPlatformData();
audit.clearSkillAuditLog();
profiles.clearAllAgentProfiles();
runStore.clearAllSkillRuns();
clearAllAgentTasks();
profiles.ensureBuiltinProfiles();

const fixtureDir = join(root, "docs/qa/skill-platform/fixtures/relationship-intelligence");
const fixtureFiles = readFixtureFiles(fixtureDir);
const REQUIRED_CAPS = ["structured-notes", "calendar-draft"];

console.log("=== CP-14 Install without grant fails ===");
{
  const denied = installSkillWithGrants({
    files: fixtureFiles,
    sourceLabel: "cp14-test",
    confirm: true,
    grantedCapabilities: [],
  });
  assert(denied.ok === false, "install without grants rejected");
  assert(denied.reason === "grants_required", `reason grants_required (${denied.reason})`);
  assert(!getInstallation("relationship-intelligence"), "no installation residue");
}

console.log("=== CP-14 Grant then install ok ===");
{
  const ok = installSkillWithGrants({
    files: fixtureFiles,
    sourceLabel: "cp14-test",
    confirm: true,
    grantedCapabilities: REQUIRED_CAPS,
  });
  assert(ok.ok, `install with grants ok (${ok.reason || ""})`);
  const inst = getInstallation("relationship-intelligence");
  assert(inst?.enabled === true, "installation enabled");
  assert(
    REQUIRED_CAPS.every((c) => inst?.grants?.capabilities?.includes(c)),
    "grants persisted",
  );
  assert(missingInstallGrants(getCatalogEntry("relationship-intelligence"), inst).length === 0, "no pending auth");
}

console.log("=== CP-14 Runtime denies undeclared / ungranted ===");
{
  const manifest = getCatalogEntry("relationship-intelligence");
  const installation = getInstallation("relationship-intelligence");

  const runDenied = {
    grantedCapabilities: [],
  };
  const runPartial = {
    grantedCapabilities: ["structured-notes"],
  };

  assert(
    !isCapabilityGranted(manifest, installation, runDenied, "structured-notes"),
    "install grant present but run grant missing → denied",
  );
  assert(
    isCapabilityGranted(manifest, installation, runPartial, "structured-notes"),
    "manifest + install + run grant → allowed",
  );
  assert(
    !isCapabilityGranted(manifest, installation, runPartial, "calendar-draft"),
    "missing run grant for second capability → denied",
  );
  assert(
    !isCapabilityGranted(manifest, installation, runPartial, "local-files"),
    "capability not in manifest → denied",
  );
  assert(
    checkRuntimeCapability(manifest, installation, runPartial, "structured-notes"),
    "checkRuntimeCapability wrapper ok",
  );
}

console.log("=== CP-14 PAIOS sandbox permission gate ===");
{
  const sandboxDenied = createSandbox({
    skillId: "demo",
    manifestRisk: "low",
    declaredPermissions: ["network"],
    grantedPermissions: [],
  });
  assert(isSurfaceBlocked(sandboxDenied, "network"), "sandbox denies undeclared grant");

  const perm = checkPermission(
    { skillId: "demo", declared: ["file"], granted: [] },
    "file",
  );
  assert(perm.ok === false && perm.reason === "permission_denied", "checkPermission default deny");
}

console.log("=== CP-14 Disable / uninstall ===");
{
  setSkillEnabled("relationship-intelligence", false);
  assert(getInstallation("relationship-intelligence")?.enabled === false, "disabled");

  uninstallSkillFromPlatform("relationship-intelligence");
  assert(!getInstallation("relationship-intelligence"), "uninstalled from store");
  assert(!getCatalogEntry("relationship-intelligence"), "catalog removed");
}

console.log("=== CP-14 Source wiring ===");
{
  const exploreSrc = readFileSync(join(root, "src/skill-platform/ui/explore-ui.js"), "utf8");
  const qishiSrc = readFileSync(join(root, "src/qishi/qishi-app.js"), "utf8");
  const flowSrc = readFileSync(join(root, "src/skill-platform/install-flow.js"), "utf8");
  const qishiBridge = readFileSync(join(root, "src/qishi/skill-install.js"), "utf8");

  assert(flowSrc.includes("validateInstallGrants"), "install-flow validates grants");
  assert(exploreSrc.includes("installSkillWithGrants"), "explore uses install-flow");
  assert(exploreSrc.includes("data-explore-grant-cap"), "explore grant sheet");
  assert(exploreSrc.includes("uninstallSkillFromPlatform"), "explore uninstall wired");
  assert(qishiSrc.includes("listInstalledMarketSkills"), "qishi lists skills");
  assert(qishiBridge.includes("installSkillWithGrants"), "qishi bridge re-exports install-flow");
}

if (failures.length) {
  console.error("FAILED", failures);
  process.exit(1);
}
console.log("CP-14 skill verify PASSED");
