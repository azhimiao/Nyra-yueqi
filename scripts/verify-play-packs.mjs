/**
 * Verify solo play packs import; social packs stay off Explore seed.
 */
import assert from "node:assert/strict";
import { seedExplorePlayPacks, listSoloPlayPackIds, listExploreSocialGames } from "../src/skill-platform/play-seed.js";
import { getCatalogEntry, getInstallation, listCatalogEntries } from "../src/skill-platform/store.js";
import { listWorkAgentPlugins } from "../src/agents/work-agent.js";
import { previewSkillBundle } from "../src/skill-platform/importer.js";
import { PLAY_PACKS } from "../src/skill-platform/play-packs-data.js";
import { surfaceForPlayPack } from "../src/skill-platform/play-surfaces.js";
import { getPopGame } from "../src/games/pop-games.js";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const solo = PLAY_PACKS.filter((p) => (p.surface || surfaceForPlayPack(p.id)) === "explore-solo");
const social = PLAY_PACKS.filter((p) => (p.surface || surfaceForPlayPack(p.id)) === "pop-social");
assert.ok(solo.length >= 4, "expected solo packs");
assert.ok(social.some((p) => p.id === "office-werewolf"), "werewolf should be pop-social");

for (const pack of solo) {
  const preview = previewSkillBundle(pack.files, { sourceLabel: "test" });
  assert.equal(preview.ok, true, `${pack.id} preview: ${preview.reason || ""}`);
  console.log(`preview ok: ${pack.id}`);
}

const seeded = seedExplorePlayPacks({ force: true });
assert.equal(seeded.failed.length, 0, JSON.stringify(seeded.failed));
assert.ok(!seeded.installed.includes("office-werewolf"), "werewolf must not seed into explore");
assert.ok(!getCatalogEntry("office-werewolf"), "werewolf catalog purged/absent");

for (const id of listSoloPlayPackIds()) {
  assert.ok(getCatalogEntry(id), `missing catalog ${id}`);
  assert.ok(getInstallation(id), `missing install ${id}`);
}

const plugins = listWorkAgentPlugins({ includeHost: true });
assert.ok(!plugins.includes("office-werewolf"), "werewolf not on work agent");

assert.ok(getPopGame("office-werewolf"), "werewolf registered in POP_GAMES");
assert.ok(listExploreSocialGames().some((g) => g.id === "office-werewolf"));

const catalog = listCatalogEntries();
const ids = Object.keys(catalog || {});
console.log("catalog:", ids.join(", "));
console.log("verify-play-packs: ok", {
  installed: seeded.installed,
  skipped: seeded.skipped,
  solo: listSoloPlayPackIds(),
});
