#!/usr/bin/env node
/**
 * Games Launch v1 gate — schemas, catalogs, smoke, sims, visibility, memory isolation.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateGamePackage } from "../src/games/platform/package.js";
import { listDuoGames } from "../src/games/duo/games/index.js";
import { listGames as listGroupGames } from "../src/games/group/games/index.js";
import { simulateDuoGame } from "../src/games/simulate/duo-sim.js";
import { simulateGroupGame } from "../src/games/simulate/group-sim.js";
import { runVisibilityTests } from "../src/games/simulate/visibility-tests.js";
import { runMemoryIsolationTests } from "../src/games/simulate/memory-isolation-tests.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const DUO_SIMS_PER_GAME = Number(process.env.GAMES_DUO_SIMS || 20);
const GROUP_SIMS_PER_GAME = Number(process.env.GAMES_GROUP_SIMS || 100);
const DUO_MAX_STEPS = Number(process.env.GAMES_DUO_MAX_STEPS || 200);
const GROUP_MAX_STEPS = Number(process.env.GAMES_GROUP_MAX_STEPS || 200);

let failed = 0;

function pass(msg) {
  console.log(`PASS ${msg}`);
}

function fail(msg) {
  failed += 1;
  console.log(`FAIL ${msg}`);
}

function validateCatalog(defs, kindLabel) {
  let ok = 0;
  for (const def of defs) {
    const v = validateGamePackage(def);
    if (!v.ok) {
      fail(`schema ${kindLabel} ${def.id}: ${v.error}`);
    } else {
      ok += 1;
    }
  }
  if (ok === defs.length) {
    pass(`schema ${kindLabel} ${ok}/${defs.length}`);
  }
}

async function main() {
  const duo = listDuoGames();
  const group = listGroupGames();

  if (duo.length !== 10) fail(`duo catalog count ${duo.length} (want 10)`);
  else pass(`duo catalog ${duo.length}/10: ${duo.map((d) => d.id).join(", ")}`);

  if (group.length !== 4) fail(`group catalog count ${group.length} (want 4)`);
  else pass(`group catalog ${group.length}/4: ${group.map((d) => d.id).join(", ")}`);

  validateCatalog(duo, "duo");
  validateCatalog(group, "group");

  // Group smoke if present
  const smokePath = join(root, "src/games/group/smoke.mjs");
  if (existsSync(smokePath)) {
    const smoke = spawnSync(process.execPath, [smokePath], {
      cwd: root,
      encoding: "utf8",
      timeout: 120_000,
    });
    if (smoke.status === 0) {
      pass("group smoke");
    } else {
      fail(`group smoke exit=${smoke.status}\n${smoke.stderr || smoke.stdout || ""}`);
    }
  } else {
    pass("group smoke skipped (missing)");
  }

  // Duo sims
  let duoTotal = 0;
  let duoOk = 0;
  for (const def of duo) {
    let gameOk = 0;
    for (let i = 0; i < DUO_SIMS_PER_GAME; i += 1) {
      const pickMode = i % 2 === 0 ? "first" : "random";
      const out = simulateDuoGame({
        gameId: def.id,
        seed: `verify-duo-${def.id}-${i}`,
        maxSteps: DUO_MAX_STEPS,
        pickMode,
      });
      duoTotal += 1;
      if (out.ok && out.finished) {
        duoOk += 1;
        gameOk += 1;
      } else if (i === 0 || gameOk === 0) {
        // Log first failure per game for debugging
        if (gameOk === 0 && i === DUO_SIMS_PER_GAME - 1) {
          fail(`duo sim ${def.id}: ${out.error || "not_finished"} (steps=${out.steps})`);
        }
      }
    }
    if (gameOk === DUO_SIMS_PER_GAME) {
      pass(`duo sims ${def.id} ${gameOk}/${DUO_SIMS_PER_GAME}`);
    } else if (gameOk > 0) {
      fail(`duo sims ${def.id} ${gameOk}/${DUO_SIMS_PER_GAME}`);
    }
  }
  if (duoTotal >= 200 && duoOk === duoTotal) {
    pass(`duo sims total ${duoOk}/${duoTotal}`);
  } else if (duoOk === duoTotal && duoTotal >= 200) {
    pass(`duo sims total ${duoOk}/${duoTotal}`);
  } else {
    fail(`duo sims total ${duoOk}/${duoTotal} (need ≥200 all ok)`);
  }

  // Group sims
  let groupTotal = 0;
  let groupOk = 0;
  for (const def of group) {
    let gameOk = 0;
    for (let i = 0; i < GROUP_SIMS_PER_GAME; i += 1) {
      const pickMode = i % 2 === 0 ? "first" : "random";
      const out = await simulateGroupGame({
        gameId: def.id,
        seed: `verify-group-${def.id}-${i}`,
        maxSteps: GROUP_MAX_STEPS,
        pickMode,
      });
      groupTotal += 1;
      if (out.ok && out.finished) {
        groupOk += 1;
        gameOk += 1;
      } else if (gameOk === 0 && i === GROUP_SIMS_PER_GAME - 1) {
        fail(`group sim ${def.id}: ${out.error || "not_finished"} (steps=${out.steps})`);
      }
    }
    if (gameOk === GROUP_SIMS_PER_GAME) {
      pass(`group sims ${def.id} ${gameOk}/${GROUP_SIMS_PER_GAME}`);
    } else {
      fail(`group sims ${def.id} ${gameOk}/${GROUP_SIMS_PER_GAME}`);
    }
  }
  if (groupTotal >= 400 && groupOk === groupTotal) {
    pass(`group sims total ${groupOk}/${groupTotal}`);
  } else {
    fail(`group sims total ${groupOk}/${groupTotal} (need ≥400 all ok)`);
  }

  const vis = await runVisibilityTests();
  if (vis.ok) pass(`visibility tests ${vis.results.length}`);
  else {
    for (const r of vis.results.filter((x) => !x.ok)) {
      fail(`visibility ${r.name}: ${r.error}`);
    }
  }

  const mem = await runMemoryIsolationTests();
  if (mem.ok) pass(`memory isolation tests ${mem.results.length}`);
  else {
    for (const r of mem.results.filter((x) => !x.ok)) {
      fail(`memory ${r.name}: ${r.error}`);
    }
  }

  const e2e = spawnSync(process.execPath, [join(root, "scripts/verify-games-e2e-lifecycle.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
  });
  if ((e2e.status ?? 1) === 0) {
    pass("e2e lifecycle 14/14");
  } else {
    fail("e2e lifecycle");
    if (e2e.stdout) console.log(e2e.stdout);
    if (e2e.stderr) console.error(e2e.stderr);
  }

  if (failed > 0) {
    console.log(`\nGAMES LAUNCH VERIFY FAIL (${failed})`);
    process.exit(1);
  }
  console.log("\nGAMES LAUNCH VERIFY PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
