/**
 * Reproduce catalog-without-files hole and prove repair path.
 */
import assert from "node:assert/strict";
import {
  __setSkillPlatformStorageForTests,
  getCatalogEntry,
  getInstallation,
  skillFilesMissing,
  deleteSkillFiles,
  upsertCatalogEntry,
  upsertInstallation,
} from "../src/skill-platform/store.js";
import { __setSkillRunStorageForTests } from "../src/skill-platform/run-store.js";
import { seedExplorePlayPacks, ensurePlayPackFiles } from "../src/skill-platform/play-seed.js";
import { importSkillBundle } from "../src/skill-platform/importer.js";
import { PLAY_PACKS } from "../src/skill-platform/play-packs-data.js";

const mem = new Map();
const storage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.localStorage = storage;
__setSkillPlatformStorageForTests(storage);
__setSkillRunStorageForTests(storage);

seedExplorePlayPacks({ force: true });
assert.equal(skillFilesMissing("midnight-train"), false);

// Hole: catalog remains, files wiped (old behavior after refresh)
deleteSkillFiles("midnight-train", "1.0.0");
assert.equal(skillFilesMissing("midnight-train"), true);
assert.ok(getCatalogEntry("midnight-train"));
assert.ok(getInstallation("midnight-train"));

// Old import path would no-op as already_installed — must repair
const pack = PLAY_PACKS.find((p) => p.id === "midnight-train");
const imported = importSkillBundle({
  files: pack.files,
  sourceLabel: "test",
  confirm: true,
  repairFiles: true,
});
assert.equal(imported.ok, true);
assert.equal(skillFilesMissing("midnight-train"), false, "import must repair files");

deleteSkillFiles("midnight-train", "1.0.0");
assert.equal(skillFilesMissing("midnight-train"), true);
const ensured = ensurePlayPackFiles("midnight-train");
assert.equal(ensured.ok, true, JSON.stringify(ensured));
assert.equal(skillFilesMissing("midnight-train"), false);

console.log("verify-play-repair: ok");
