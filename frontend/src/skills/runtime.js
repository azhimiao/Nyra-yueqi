/**
 * Production skill runtime loader.
 * Conformance failure ⇒ refuse load.
 */

import { CAPABILITY_IDS } from "../agent/schema.js";
import { canBindCapability } from "./compatibility.js";
import { defineSkillCapability, bindCapabilityToRegistry } from "./capability-api.js";
import { runConformance, assertConformanceForProduction } from "./conformance.js";
import { getInstalledSkill, listInstalledSkills } from "./lifecycle.js";
import { hashSkillPackage } from "./signature.js";
import { createSandbox } from "./sandbox.js";
import { filterMemoryForSkill } from "./memory-gate.js";

/** @type {Map<string, object>} */
const productionRegistry = new Map();

/** @type {Set<string>} */
const loadedIds = new Set();

/**
 * Load an installed skill into the production registry (conformance-gated).
 * @param {string} skillId
 * @param {{
 *   execute: (input: object, ctx: object) => Promise<object>|object,
 *   validateInput?: Function,
 *   plan?: Function,
 *   previewEffect?: Function,
 *   publisherSecret?: string|null,
 * }} handlers
 */
export function loadSkillIntoProduction(skillId, handlers) {
  const installed = getInstalledSkill(skillId);
  if (!installed) return { ok: false, reason: "not_installed" };
  if (!installed.conformancePassed) {
    return { ok: false, reason: "cannot_load_production", detail: "flag_false" };
  }

  const hash = hashSkillPackage({
    manifest: installed.manifest,
    entrySource: installed.entrySource,
    assets: installed.assets,
  });
  if (hash !== installed.hash) {
    return { ok: false, reason: "hash_mismatch_on_load" };
  }

  const conf = runConformance({
    manifest: installed.manifest,
    entrySource: installed.entrySource,
    assets: installed.assets,
    hash: installed.hash,
    signature: installed.signature,
    publisherSecret: handlers.publisherSecret ?? null,
  });
  const gate = assertConformanceForProduction(conf);
  if (!gate.ok) return gate;

  const bindCheck = canBindCapability(installed.manifest.id, CAPABILITY_IDS);
  if (!bindCheck.ok) return bindCheck;

  const defined = defineSkillCapability({
    manifest: installed.manifest,
    grantedPermissions: installed.grantedPermissions,
    handlers: {
      execute: handlers.execute,
      validateInput: handlers.validateInput,
      plan: handlers.plan,
      previewEffect: handlers.previewEffect,
    },
  });
  if (!defined.ok) return defined;

  const bound = bindCapabilityToRegistry(productionRegistry, defined.value);
  if (!bound.ok) return bound;

  loadedIds.add(installed.manifest.id);
  return { ok: true, capabilityId: installed.manifest.id, conformance: conf };
}

/**
 * Unload from production registry (does not uninstall storage).
 * @param {string} skillId
 */
export function unloadSkillFromProduction(skillId) {
  const id = String(skillId);
  productionRegistry.delete(id);
  loadedIds.delete(id);
  return { ok: true };
}

export function listProductionSkills() {
  return [...loadedIds];
}

export function getProductionCapability(skillId) {
  return productionRegistry.get(String(skillId)) || null;
}

/**
 * Invoke a production-loaded skill with sandbox + memory gate.
 * @param {string} skillId
 * @param {object} input
 * @param {object} [ctx]
 */
export async function invokeProductionSkill(skillId, input, ctx = {}) {
  const cap = getProductionCapability(skillId);
  if (!cap) return { ok: false, reason: "not_loaded_in_production" };
  const installed = getInstalledSkill(skillId);
  if (!installed) return { ok: false, reason: "not_installed" };

  const sandbox = createSandbox({
    skillId,
    manifestRisk: installed.manifest.risk,
    declaredPermissions: installed.manifest.permissions,
    grantedPermissions: installed.grantedPermissions,
    offline: Boolean(ctx.offline),
  });

  if (Array.isArray(ctx.memoryItems)) {
    const filtered = filterMemoryForSkill(
      {
        skillId,
        declared: installed.manifest.permissions,
        granted: installed.grantedPermissions,
        characterMemoryAccess: installed.manifest.characterMemoryAccess || "none",
        skillCharacterId: ctx.characterId,
      },
      ctx.memoryItems,
    );
    if (filtered.denied.some((d) => d.reason === "unauthorized_private_memory"
      || d.reason === "private_memory_denied"
      || d.reason === "memory_access_none")) {
      // Strip private; never pass through
      ctx = { ...ctx, memoryItems: filtered.allowed, memoryDenied: filtered.denied };
    } else {
      ctx = { ...ctx, memoryItems: filtered.allowed, memoryDenied: filtered.denied };
    }
  }

  const result = await cap.execute(input, { ...ctx, sandbox });
  return { ok: true, result, sandboxViolations: sandbox.violations };
}

export function __resetProductionRuntimeForTests() {
  productionRegistry.clear();
  loadedIds.clear();
}

/**
 * Ensure only installed+conforming skills are considered production-ready.
 */
export function productionReadinessReport() {
  const installed = listInstalledSkills();
  const rows = Object.values(installed).map((s) => ({
    id: s.manifest.id,
    version: s.manifest.version,
    conformancePassed: Boolean(s.conformancePassed),
    loaded: loadedIds.has(s.manifest.id),
    canLoad: Boolean(s.conformancePassed) && !CAPABILITY_IDS.includes(s.manifest.id),
  }));
  return { skills: rows, productionCount: loadedIds.size };
}
