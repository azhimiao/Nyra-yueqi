/**
 * World/Character packages have no direct system privileges.
 * Real capabilities only via declared Skill Package dependency.
 * Malicious packages cannot declare hidden permissions or run arbitrary scripts.
 */

import { WORLD_FORBIDDEN_PRIVILEGES } from "./schema.js";

const HIDDEN_PERM_KEYS = Object.freeze([
  "hiddenPermissions",
  "hidden_permissions",
  "_permissions",
  "secretPermissions",
  "systemPrivileges",
  "rawPermissions",
  "elevated",
  "allowEval",
  "allowShell",
  "arbitraryScripts",
]);

const CODE_SMELL =
  /\b(?:eval|Function|child_process|require\s*\(|import\s*\(|process\.binding|WebAssembly\.compile)\b/i;

/**
 * @param {object} worldManifest
 * @returns {{ ok: true } | { ok: false, reason: string, errors: string[] }}
 */
export function assertWorldHasNoSystemPrivileges(worldManifest) {
  const errors = [];
  const raw = worldManifest || {};

  for (const key of HIDDEN_PERM_KEYS) {
    if (raw[key] !== undefined) {
      errors.push(`hidden_permission_field:${key}`);
    }
  }

  if (raw.permissions !== undefined) {
    errors.push("direct_permissions_forbidden");
  }
  if (raw.privileges !== undefined) {
    errors.push("direct_privileges_forbidden");
  }

  for (const p of WORLD_FORBIDDEN_PRIVILEGES) {
    if (raw[p] === true || raw[p] === "allow") {
      errors.push(`forbidden_privilege_flag:${p}`);
    }
  }

  // Nested privilege smuggling
  const json = safeJson(raw);
  for (const p of WORLD_FORBIDDEN_PRIVILEGES) {
    if (new RegExp(`"(?:permissions|privileges)"\\s*:\\s*\\[[^\\]]*${p}`, "i").test(json)) {
      errors.push(`smuggled_privilege:${p}`);
    }
  }

  if (raw.entry || raw.entrySource) {
    errors.push("executable_entry_forbidden");
  }

  const scripts = Array.isArray(raw.scripts) ? raw.scripts : [];
  for (const s of scripts) {
    const blob = `${s?.body || ""}\n${(s?.beats || []).join("\n")}`;
    if (s?.executable === true) errors.push(`arbitrary_script:${s.id || "?"}`);
    if (CODE_SMELL.test(blob)) errors.push(`script_code_smell:${s.id || "?"}`);
  }

  if (errors.length) {
    return { ok: false, reason: "privilege_violation", errors };
  }
  return { ok: true };
}

/**
 * Character packages also cannot smuggle executable entry / hidden perms.
 * @param {object} characterManifest
 */
export function assertCharacterHasNoHiddenPrivileges(characterManifest) {
  const errors = [];
  const raw = characterManifest || {};
  for (const key of HIDDEN_PERM_KEYS) {
    if (raw[key] !== undefined) errors.push(`hidden_permission_field:${key}`);
  }
  if (raw.permissions !== undefined) errors.push("direct_permissions_forbidden");
  if (raw.entry || raw.entrySource) errors.push("executable_entry_forbidden");
  if (typeof raw.bootstrap === "string" && CODE_SMELL.test(raw.bootstrap)) {
    errors.push("bootstrap_code_forbidden");
  }
  if (errors.length) {
    return { ok: false, reason: "privilege_violation", errors };
  }
  return { ok: true };
}

/**
 * Capability request from a world scene must cite a declared skill dependency.
 * @param {{ skillDependencies?: string[] }} worldManifest
 * @param {string} capability
 * @param {string} [viaSkillId]
 */
export function authorizeWorldCapability(worldManifest, capability, viaSkillId) {
  const cap = String(capability || "").trim();
  if (!cap) return { ok: false, reason: "capability_required" };

  // Direct host surfaces are never granted to world packages
  if (WORLD_FORBIDDEN_PRIVILEGES.includes(cap) || cap.startsWith("system.")) {
    return { ok: false, reason: "direct_system_privilege_denied", capability: cap };
  }

  const skillId = String(viaSkillId || "").trim();
  if (!skillId) {
    return { ok: false, reason: "skill_dependency_required", capability: cap };
  }

  const deps = Array.isArray(worldManifest?.skillDependencies)
    ? worldManifest.skillDependencies
    : [];
  if (!deps.includes(skillId)) {
    return { ok: false, reason: "undeclared_skill_dependency", skillId };
  }

  return { ok: true, capability: cap, viaSkillId: skillId };
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
