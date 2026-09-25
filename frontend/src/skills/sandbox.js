/**
 * Sandbox defaults: no file/network/clipboard/credentials unless declared+granted.
 */

import { checkPermission, normalizePermissions } from "./permissions.js";
import { checkSkillRisk } from "./risk.js";

/** Sensitive host surfaces denied unless explicitly allowed. */
export const SANDBOX_DEFAULT_DENY = Object.freeze([
  "network",
  "file",
  "clipboard",
  "credentials",
  "character_memory_private",
]);

/**
 * Create a sandbox context for a skill invocation.
 * @param {{
 *   skillId: string,
 *   manifestRisk: string,
 *   declaredPermissions?: string[],
 *   grantedPermissions?: string[],
 *   offline?: boolean,
 * }} opts
 */
export function createSandbox(opts) {
  const skillId = String(opts.skillId || "");
  const declared = normalizePermissions(opts.declaredPermissions || []);
  const granted = normalizePermissions(opts.grantedPermissions || []);
  const offline = Boolean(opts.offline);
  /** @type {{ at: string, kind: string, detail: string }[]} */
  const violations = [];

  const permCtx = { skillId, declared, granted };

  function deny(kind, detail) {
    violations.push({ at: new Date().toISOString(), kind, detail });
    return { ok: false, reason: kind, detail };
  }

  return {
    skillId,
    declared,
    granted,
    offline,
    violations,

    /**
     * @param {string} permission
     */
    require(permission) {
      if (offline && permission === "network") {
        return deny("offline", "network blocked while offline");
      }
      const r = checkPermission(permCtx, permission);
      if (!r.ok) {
        return deny(r.reason || "permission_denied", String(permission));
      }
      return { ok: true, permission };
    },

    /**
     * Attempt network — blocked unless declared+granted and not offline.
     * @param {{ url?: string }} [req]
     */
    requestNetwork(req = {}) {
      const gate = this.require("network");
      if (!gate.ok) return gate;
      return { ok: true, url: String(req.url || ""), mode: "allowed_stub" };
    },

    /**
     * Attempt file IO.
     * @param {{ path?: string, op?: string }} [req]
     */
    requestFile(req = {}) {
      const gate = this.require("file");
      if (!gate.ok) return gate;
      const path = String(req.path || "");
      if (path.includes("..") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
        return deny("path_escape", path);
      }
      return { ok: true, path, op: String(req.op || "read") };
    },

    requestClipboard() {
      return this.require("clipboard");
    },

    requestCredentials() {
      return this.require("credentials");
    },

    /**
     * Risk check for this invoke.
     * @param {string} [requestedRisk]
     */
    checkRisk(requestedRisk) {
      return checkSkillRisk({
        manifestRisk: opts.manifestRisk,
        requestedRisk: requestedRisk || opts.manifestRisk,
        permissions: declared,
      });
    },

    /** Snapshot of sandbox defaults. */
    defaults() {
      return {
        deny: [...SANDBOX_DEFAULT_DENY],
        declared,
        granted,
        offline,
      };
    },
  };
}

/**
 * True when sandbox would deny undeclared network/file.
 * @param {ReturnType<typeof createSandbox>} sandbox
 * @param {"network"|"file"} surface
 */
export function isSurfaceBlocked(sandbox, surface) {
  const r = surface === "network"
    ? sandbox.requestNetwork({ url: "https://example.invalid" })
    : sandbox.requestFile({ path: "secret.txt", op: "read" });
  return !r.ok;
}
