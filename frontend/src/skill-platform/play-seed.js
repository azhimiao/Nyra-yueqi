/**
 * Seed fun/play Skill packs into Explore (attach to work agent).
 * Only packs with surface === "explore-solo" are seeded.
 */

import { PLAY_PACKS } from "./play-packs-data.js";
import { importSkillBundle } from "./importer.js";
import {
  getCatalogEntry,
  getInstallation,
  putSkillFile,
  removeCatalogEntry,
  removeInstallation,
  deleteSkillFiles,
  skillFilesMissing,
} from "./store.js";
import { detachSkillFromProfile } from "../agents/profile-store.js";
import { BUILTIN_WORK_AGENT_ID } from "../agents/profile-schema.js";
import { ensureWorkAgentReady } from "../agents/work-agent.js";
import { surfaceForPlayPack, EXPLORE_SOCIAL_GAMES } from "./play-surfaces.js";
import { normalizeRelativePath } from "./integrity.js";

const SEED_FLAG = "yueqi.explore.play-packs.seeded.v2";

/**
 * Write pack files straight into the skill file store (repairs "already_installed" holes).
 * @param {{ id: string, files?: Record<string, string> }} pack
 */
function repairPackFiles(pack) {
  const id = String(pack.id || "").trim();
  const version = String(getCatalogEntry(id)?.version || getInstallation(id)?.version || "1.0.0");
  const files = pack.files || {};
  let written = 0;
  for (const [rawPath, content] of Object.entries(files)) {
    const path = normalizeRelativePath(rawPath);
    if (!path) continue;
    putSkillFile(id, version, path, String(content ?? ""));
    written += 1;
  }
  return { ok: written > 0, written, version };
}

/**
 * Drop formerly-seeded social packs from Explore catalog (e.g. werewolf).
 */
function purgePopSocialFromExplore() {
  for (const pack of PLAY_PACKS) {
    const id = String(pack.id || "").trim();
    if (!id || surfaceForPlayPack(id) !== "pop-social") continue;
    if (!getCatalogEntry(id) && !getInstallation(id)) continue;
    const ver = getCatalogEntry(id)?.version;
    try {
      detachSkillFromProfile(BUILTIN_WORK_AGENT_ID, id);
    } catch {
      /* ignore */
    }
    if (ver) deleteSkillFiles(id, ver);
    removeInstallation(id);
    removeCatalogEntry(id);
  }
}

/**
 * @returns {{ installed: string[], skipped: string[], failed: Array<{ id: string, reason: string }>, purged: string[] }}
 */
export function seedExplorePlayPacks(opts = {}) {
  ensureWorkAgentReady();
  const force = Boolean(opts.force);
  /** @type {string[]} */
  const installed = [];
  /** @type {string[]} */
  const skipped = [];
  /** @type {Array<{ id: string, reason: string }>} */
  const failed = [];

  purgePopSocialFromExplore();
  /** @type {string[]} */
  const purged = PLAY_PACKS
    .filter((p) => surfaceForPlayPack(p.id) === "pop-social")
    .map((p) => p.id);

  for (const pack of PLAY_PACKS) {
    const guessId = String(pack.id || "").trim();
    const surface = pack.surface || surfaceForPlayPack(guessId);
    if (surface !== "explore-solo") {
      skipped.push(guessId);
      continue;
    }

    const files = pack.files || {};
    if (!force && guessId && getCatalogEntry(guessId) && getInstallation(guessId)) {
      const ver = getCatalogEntry(guessId)?.version || "1.0.0";
      if (!skillFilesMissing(guessId, ver)) {
        skipped.push(guessId);
        continue;
      }
      // Catalog survived refresh but prompt files were lost — repair in place.
      const repaired = repairPackFiles(pack);
      if (repaired.ok) {
        installed.push(guessId);
        continue;
      }
    }

    const result = importSkillBundle({
      files,
      sourceLabel: "skills-play",
      confirm: true,
      attachToAgentId: BUILTIN_WORK_AGENT_ID,
      repairFiles: true,
    });

    if (!result.ok) {
      // Last resort: if catalog exists, force-write bundled files
      if (getCatalogEntry(guessId) || getInstallation(guessId)) {
        const repaired = repairPackFiles(pack);
        if (repaired.ok) {
          installed.push(guessId);
          continue;
        }
      }
      failed.push({
        id: guessId || "unknown",
        reason: String(result.reason || result.action || "import_failed"),
      });
      continue;
    }

    // Import may report already_installed without writing — ensure files exist
    if (skillFilesMissing(guessId)) {
      const repaired = repairPackFiles(pack);
      if (repaired.ok) {
        installed.push(guessId);
        continue;
      }
    }

    for (const row of result.results || []) {
      if (row?.ok && row.skillId) installed.push(String(row.skillId));
    }
  }

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SEED_FLAG, new Date().toISOString());
    }
  } catch {
    /* ignore */
  }

  return { installed, skipped, failed, purged };
}

/**
 * Install any missing solo play packs (safe to call on Explore mount).
 */
export function ensureExplorePlayPacksSeeded() {
  return seedExplorePlayPacks({ force: false });
}

export function listSoloPlayPackIds() {
  return PLAY_PACKS
    .filter((p) => (p.surface || surfaceForPlayPack(p.id)) === "explore-solo")
    .map((p) => p.id);
}

export function listPlayPackIds() {
  return listSoloPlayPackIds();
}

export function listExploreSocialGames() {
  return EXPLORE_SOCIAL_GAMES.map((g) => ({ ...g }));
}

/**
 * Ensure one solo pack has prompt files on disk/storage (call before 开始玩).
 * @param {string} skillId
 */
export function ensurePlayPackFiles(skillId) {
  const id = String(skillId || "").trim();
  if (!id) return { ok: false, reason: "missing_id" };
  ensureExplorePlayPacksSeeded();
  if (!skillFilesMissing(id)) return { ok: true, repaired: false };
  const pack = PLAY_PACKS.find((p) => p.id === id);
  if (!pack) return { ok: false, reason: "pack_not_bundled" };
  if (!getCatalogEntry(id) && !getInstallation(id)) {
    const result = importSkillBundle({
      files: pack.files,
      sourceLabel: "skills-play",
      confirm: true,
      attachToAgentId: BUILTIN_WORK_AGENT_ID,
      repairFiles: true,
    });
    if (!result.ok && skillFilesMissing(id)) {
      const repaired = repairPackFiles(pack);
      return repaired.ok ? { ok: true, repaired: true } : { ok: false, reason: "repair_failed" };
    }
  } else {
    const repaired = repairPackFiles(pack);
    if (!repaired.ok) return { ok: false, reason: "repair_failed" };
  }
  return skillFilesMissing(id)
    ? { ok: false, reason: "still_missing" }
    : { ok: true, repaired: true };
}
