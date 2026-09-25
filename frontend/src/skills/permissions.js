/**
 * Permission checker for skill packages.
 * Default deny; only declared + granted permissions pass.
 */

import { SKILL_PERMISSIONS } from "./schema.js";

/**
 * @typedef {{
 *   skillId: string,
 *   declared: string[],
 *   granted: string[],
 * }} SkillPermissionContext
 */

/**
 * Normalize permission list (unique, known only).
 * @param {unknown} list
 */
export function normalizePermissions(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const p of list) {
    const s = String(p);
    if (SKILL_PERMISSIONS.includes(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Check whether an action's required permission is allowed.
 * @param {SkillPermissionContext} ctx
 * @param {string} permission
 */
export function checkPermission(ctx, permission) {
  const perm = String(permission || "");
  if (!SKILL_PERMISSIONS.includes(perm)) {
    return { ok: false, reason: "unknown_permission", permission: perm };
  }
  const declared = normalizePermissions(ctx?.declared);
  const granted = normalizePermissions(ctx?.granted);
  if (!declared.includes(perm)) {
    return {
      ok: false,
      reason: "undeclared_permission",
      permission: perm,
      skillId: ctx?.skillId,
    };
  }
  if (!granted.includes(perm)) {
    return {
      ok: false,
      reason: "permission_denied",
      permission: perm,
      skillId: ctx?.skillId,
    };
  }
  return { ok: true, permission: perm, skillId: ctx?.skillId };
}

/**
 * Assert multiple permissions; first failure wins.
 * @param {SkillPermissionContext} ctx
 * @param {string[]} permissions
 */
export function assertPermissions(ctx, permissions) {
  for (const p of permissions || []) {
    const r = checkPermission(ctx, p);
    if (!r.ok) return r;
  }
  return { ok: true };
}

/**
 * Grant subset of declared permissions (user / policy).
 * @param {string[]} declared
 * @param {string[]} requested
 */
export function grantDeclaredSubset(declared, requested) {
  const d = normalizePermissions(declared);
  const req = normalizePermissions(requested);
  return req.filter((p) => d.includes(p));
}
