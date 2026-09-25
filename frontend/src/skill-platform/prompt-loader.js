/**
 * Load minimal skill resources from file store — never dump full SKILL.md + all evals each turn.
 */

import { stripFrontmatter } from "./manifest.js";
import { listSkillFiles } from "./store.js";

/** Rough token estimate (~4 chars per token). */
export function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

/**
 * @param {string} skillId
 * @param {string} version
 * @param {string} path
 */
function readSkillFile(skillId, version, path) {
  const rows = listSkillFiles(skillId, version, path);
  return rows[0]?.content ? String(rows[0].content) : "";
}

/**
 * Select policies/schemas by nextAction — minimal per turn.
 * @param {object} manifest
 * @param {string} [nextAction]
 */
export function selectResourcePaths(manifest, nextAction = "") {
  const action = String(nextAction || "").trim().toUpperCase();
  const resources = manifest?.resources || {};

  const systemPaths = (resources.system || []).slice(0, 1);
  /** @type {string[]} */
  const policyPaths = [];
  /** @type {string[]} */
  const schemaPaths = [];

  const policies = resources.policies || [];
  if (action === "SAFETY_OVERRIDE") {
    const safety = policies.find((p) => /safety/i.test(p));
    if (safety) policyPaths.push(safety);
    else if (policies[0]) policyPaths.push(policies[0]);
  } else if (policies.length > 0) {
    const conversation = policies.find((p) => /conversation/i.test(p));
    policyPaths.push(conversation || policies[0]);
  }

  const schemas = resources.schemas || [];
  if (action === "FORMULATE" || action === "DISCRIMINATE") {
    const wf = schemas.find((p) => /working-formulation/i.test(p));
    if (wf) schemaPaths.push(wf);
  } else if (action === "CONTAIN" || action === "REFLECT" || action === "DEBRIEF") {
    const session = schemas.find((p) => /session-state/i.test(p));
    if (session) schemaPaths.push(session);
  } else if (schemas.length > 0 && action) {
    schemaPaths.push(schemas[0]);
  }

  return {
    systemPaths,
    policyPaths: policyPaths.slice(0, 2),
    schemaPaths: schemaPaths.slice(0, 1),
    skippedEvals: (resources.evals || []).length,
  };
}

/**
 * @param {{
 *   skillId: string,
 *   version: string,
 *   manifest: object,
 *   nextAction?: string,
 *   entry?: string,
 *   hostState?: object,
 * }} input
 */
export function loadSkillPromptResources(input) {
  const skillId = String(input.skillId || "").trim();
  const version = String(input.version || "1.0.0").trim();
  const manifest = input.manifest || {};
  const nextAction = String(input.nextAction || "").trim();

  const selection = selectResourcePaths(manifest, nextAction);
  /** @type {string[]} */
  const loadedPaths = [];

  let system = "";
  for (const path of selection.systemPaths) {
    const body = readSkillFile(skillId, version, path);
    if (body) {
      system = stripFrontmatter(body).trim();
      loadedPaths.push(path);
      break;
    }
  }

  /** @type {string[]} */
  const policies = [];
  for (const path of selection.policyPaths) {
    const body = readSkillFile(skillId, version, path);
    if (body) {
      policies.push(stripFrontmatter(body).trim());
      loadedPaths.push(path);
    }
  }

  /** @type {string[]} */
  const schemas = [];
  for (const path of selection.schemaPaths) {
    const body = readSkillFile(skillId, version, path);
    if (body) {
      schemas.push(stripFrontmatter(body).trim());
      loadedPaths.push(path);
    }
  }

  const hostStateBlock =
    input.hostState && Object.keys(input.hostState).length > 0
      ? JSON.stringify(input.hostState)
      : "";

  const tokenEstimate =
    estimateTokens(system) +
    policies.reduce((n, p) => n + estimateTokens(p), 0) +
    schemas.reduce((n, s) => n + estimateTokens(s), 0) +
    estimateTokens(hostStateBlock);

  return {
    system,
    policies,
    schemas,
    tokenEstimate,
    trace: {
      skillId,
      version,
      nextAction: nextAction || null,
      loadedPaths,
      skippedEvalCount: selection.skippedEvals,
      includedSkillMd: false,
      hostStateKeys: Object.keys(input.hostState || {}),
    },
  };
}
