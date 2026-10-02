/**
 * P1 — Skill import verify (manifest, safety, hash, version, delete, restore).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/skill-platform/P1");
const fixtureDir = join(root, "docs/qa/skill-platform/fixtures/relationship-intelligence");

/** @type {{ id: string, name: string, pass: boolean, detail: string }[]} */
const cases = [];

function record(id, name, pass, detail = "") {
  cases.push({ id, name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id} — ${name}${detail ? ` — ${detail}` : ""}`);
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

// --- Reset isolated storage ---
const storage = memoryStorage();

const store = await import("../src/skill-platform/store.js");
const audit = await import("../src/skill-platform/audit.js");
const profiles = await import("../src/agents/profile-store.js");
const importer = await import("../src/skill-platform/importer.js");
const hostSandbox = await import("../src/skill-platform/host-sandbox.js");
const integrity = await import("../src/skill-platform/integrity.js");

store.__setSkillPlatformStorageForTests(storage);
audit.__setSkillAuditStorageForTests(storage);
profiles.__setAgentProfileStorageForTests(storage);
store.clearAllSkillPlatformData();
audit.clearSkillAuditLog();
profiles.clearAllAgentProfiles();
profiles.ensureBuiltinProfiles();

const fixtureFiles = readFixtureFiles(fixtureDir);

// Case 1: relationship-intelligence import
{
  const preview = importer.importSkillBundle({
    files: fixtureFiles,
    sourceLabel: "fixture:relationship-intelligence",
  });
  record(
    "case1_preview",
    "Preview discovers SKILL.md without user JSON paths",
    preview.ok && preview.skillCount === 1 && preview.skills[0].manifest.id === "relationship-intelligence",
    preview.ok ? `skills=${preview.skillCount}` : preview.reason,
  );

  const installed = importer.importSkillBundle({
    files: fixtureFiles,
    sourceLabel: "fixture:relationship-intelligence",
    confirm: true,
    grantedCapabilities: ["structured-notes", "calendar-draft"],
  });
  const catalog = store.getCatalogEntry("relationship-intelligence");
  const files = store.listSkillFiles("relationship-intelligence", "1.1.0");
  const install = store.getInstallation("relationship-intelligence");
  const agent = profiles.findProfileBySkillId("relationship-intelligence");

  record(
    "case1_import",
    "Relationship-intelligence bundle imports successfully",
    installed.ok &&
      catalog?.name === "关系探索" &&
      files.length >= 6 &&
      install?.enabled === true,
    installed.ok ? `files=${files.length}` : installed.reason,
  );

  record(
    "case1_agent",
    "Skill attaches as plugin to default Yueqi Agent (not a new specialist)",
    agent?.id === "yueqi-agent" && agent.kind === "general" && agent.skillIds.includes("relationship-intelligence"),
    agent ? `agent=${agent.id}` : "no agent",
  );

  // Case 2: delete + re-import consistency
  const snapshotBefore = store.exportSkillPlatformSnapshot();
  store.deleteSkillCompletely("relationship-intelligence");
  const afterDelete = store.getCatalogEntry("relationship-intelligence");
  const afterInstall = store.getInstallation("relationship-intelligence");
  record(
    "case2_delete_clean",
    "Delete skill removes that catalog entry (host core plugin may remain)",
    !afterDelete && !afterInstall,
    afterDelete ? "catalog still present" : "skill removed",
  );

  const reimport = importer.importSkillBundle({
    files: fixtureFiles,
    sourceLabel: "fixture:reimport",
    confirm: true,
    grantedCapabilities: ["structured-notes", "calendar-draft"],
  });
  const restored = store.getCatalogEntry("relationship-intelligence");
  const restoredFiles = store.listSkillFiles("relationship-intelligence", restored?.version || "1.1.0");
  const agentAgain = profiles.findProfileBySkillId("relationship-intelligence");
  record(
    "case2_reimport",
    "Re-import restores skill and re-attaches to Yueqi Agent",
    reimport.ok &&
      restored?.id === "relationship-intelligence" &&
      restoredFiles.length >= 4 &&
      agentAgain?.id === "yueqi-agent",
    reimport.ok ? `files=${restoredFiles.length}` : reimport.reason,
  );

  // Case 3: same id new version → upgrade candidate
  const v2Files = {
    ...fixtureFiles,
    "SKILL.md": fixtureFiles["SKILL.md"].replace("version: 1.1.0", "version: 1.2.0"),
  };
  const upgradeAttempt = importer.importSkillBundle({
    files: v2Files,
    sourceLabel: "fixture:upgrade",
    confirm: true,
  });
  const catalogStill = store.getCatalogEntry("relationship-intelligence");
  const candidates = store.listUpgradeCandidates();
  const candidate = candidates["relationship-intelligence"];
  record(
    "case3_upgrade_candidate",
    "Same id new version creates upgrade candidate without silent overwrite",
    upgradeAttempt.ok &&
      catalogStill?.version === "1.1.0" &&
      candidate?.candidateVersion === "1.2.0" &&
      upgradeAttempt.results?.some((r) => r.action === "upgrade_candidate"),
    catalogStill ? `running=${catalogStill.version} candidate=${candidate?.candidateVersion}` : "missing catalog",
  );
}

// Case 4: path traversal
{
  store.clearAllSkillPlatformData();
  const bad = importer.importSkillBundle({
    files: {
      "SKILL.md": fixtureFiles["SKILL.md"],
      "../../evil.md": "nope",
    },
    confirm: true,
  });
  const residue = store.countSkillPlatformResidue();
  record(
    "case4_path_traversal",
    "Reject path traversal with zero install residue",
    !bad.ok && bad.reason === "path_traversal" && residue.catalog === 0 && residue.installations === 0,
    bad.reason || "unexpected pass",
  );
}

// Case 5: executable .js
{
  store.clearAllSkillPlatformData();
  const bad = importer.importSkillBundle({
    files: {
      "SKILL.md": fixtureFiles["SKILL.md"],
      "prompts/run.js": "console.log('evil')",
    },
    confirm: true,
  });
  const residue = store.countSkillPlatformResidue();
  record(
    "case5_executable",
    "Reject executable .js with zero install residue",
    !bad.ok && bad.reason === "executable_rejected" && residue.catalog === 0,
    bad.reason || "unexpected pass",
  );
}

// Case 6: oversize / too many files
{
  store.clearAllSkillPlatformData();
  /** @type {Record<string, string>} */
  const many = { "SKILL.md": fixtureFiles["SKILL.md"] };
  for (let i = 0; i <= integrity.INTEGRITY_LIMITS.maxFileCount; i += 1) {
    many[`policies/extra-${i}.md`] = "# x";
  }
  const bad = importer.importSkillBundle({ files: many, confirm: true });
  const residue = store.countSkillPlatformResidue();
  record(
    "case6_oversize",
    "Reject too many files with zero install residue",
    !bad.ok && bad.reason === "too_many_files" && residue.catalog === 0,
    bad.reason || "unexpected pass",
  );
}

// Case 7: zip sandbox extract finds SKILL.md
{
  const entries = {};
  for (const [path, content] of Object.entries(fixtureFiles)) {
    entries[path] = strToU8(content);
  }
  const zipBytes = zipSync(entries);
  const extracted = hostSandbox.extractZipToSandbox(zipBytes);
  const hasSkill = extracted.ok && Object.keys(extracted.files).some((p) => p.endsWith("SKILL.md"));
  record(
    "case7_zip_sandbox",
    "Zip sandbox extract finds SKILL.md recursively",
    hasSkill,
    extracted.ok ? `files=${Object.keys(extracted.files).length}` : extracted.reason,
  );
  if (extracted.ok) hostSandbox.cleanupSandbox(extracted.tempId);
}

// Module presence checks
const requiredModules = [
  "src/skill-platform/schema.js",
  "src/skill-platform/manifest.js",
  "src/skill-platform/integrity.js",
  "src/skill-platform/store.js",
  "src/skill-platform/audit.js",
  "src/skill-platform/importer.js",
  "src/skill-platform/host-sandbox.js",
  "src/agents/profile-schema.js",
  "src/agents/profile-store.js",
];

for (const rel of requiredModules) {
  record(`module_${rel}`, `Module exists ${rel}`, existsSync(join(root, rel)));
}

const allPass = cases.every((c) => c.pass);
const result = {
  phase: "P1",
  status: allPass ? "implementation_green" : "red",
  verifiedAt: new Date().toISOString(),
  command: "npm run verify:skills:import",
  cases,
  summary: {
    total: cases.length,
    passed: cases.filter((c) => c.pass).length,
    failed: cases.filter((c) => !c.pass).length,
  },
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "VERIFY_IMPORT.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(`\n${allPass ? "ALL PASS" : "FAILURES"} — ${result.summary.passed}/${result.summary.total}`);
process.exit(allPass ? 0 : 1);
