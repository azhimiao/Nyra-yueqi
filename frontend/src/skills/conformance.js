/**
 * Conformance suite. Failure ⇒ cannot load into production runtime.
 */

import { validateSkillManifest, detectSchemaDrift, SKILL_SDK_VERSION } from "./schema.js";
import { checkSdkCompatibility } from "./compatibility.js";
import { checkSkillRisk } from "./risk.js";
import { createSandbox, isSurfaceBlocked } from "./sandbox.js";
import { verifyPackageIntegrity } from "./signature.js";
import { thirdPartyMemoryContext, filterMemoryForSkill } from "./memory-gate.js";

/**
 * @param {{
 *   manifest: object,
 *   entrySource: string,
 *   assets?: Record<string, string>,
 *   hash: string,
 *   signature?: string|null,
 *   publisherSecret?: string|null,
 * }} pkg
 */
export function runConformance(pkg) {
  /** @type {{ name: string, pass: boolean, detail?: string }[]} */
  const checks = [];
  const add = (name, pass, detail = "") => {
    checks.push({ name, pass: Boolean(pass), detail });
  };

  const validated = validateSkillManifest(pkg.manifest);
  add("manifest_schema", validated.ok, validated.ok ? "" : validated.reason);
  if (!validated.ok) {
    return { ok: false, reason: "conformance_failed", checks, failed: checks.filter((c) => !c.pass) };
  }
  const manifest = validated.value;

  const drift = detectSchemaDrift(manifest);
  add("schema_drift", drift.ok, drift.drifts?.join(",") || "");

  const compat = checkSdkCompatibility(manifest, { hostSdkVersion: SKILL_SDK_VERSION });
  add("sdk_compatibility", compat.ok, compat.ok ? "" : compat.reason);

  const risk = checkSkillRisk({
    manifestRisk: manifest.risk,
    requestedRisk: manifest.risk,
    permissions: manifest.permissions,
  });
  add("risk_consistent", risk.ok, risk.ok ? "" : risk.reason);

  const integrity = verifyPackageIntegrity({
    pkg: {
      manifest,
      entrySource: pkg.entrySource,
      assets: pkg.assets,
    },
    expectedHash: pkg.hash,
    signature: pkg.signature || null,
    publisherSecret: pkg.publisherSecret || null,
  });
  add("package_integrity", integrity.ok, integrity.ok ? "" : integrity.reason);

  // Sandbox defaults: undeclared network/file blocked
  const sandbox = createSandbox({
    skillId: manifest.id,
    manifestRisk: manifest.risk,
    declaredPermissions: manifest.permissions,
    grantedPermissions: manifest.permissions,
    offline: false,
  });
  if (!manifest.permissions.includes("network")) {
    add("undeclared_network_blocked", isSurfaceBlocked(sandbox, "network"));
  } else {
    add("undeclared_network_blocked", true, "declared");
  }
  if (!manifest.permissions.includes("file")) {
    add("undeclared_file_blocked", isSurfaceBlocked(sandbox, "file"));
  } else {
    add("undeclared_file_blocked", true, "declared");
  }

  // Entry source must be non-empty and not obviously dangerous
  const entry = String(pkg.entrySource || "");
  add("entry_present", entry.length > 0);
  add(
    "entry_no_eval",
    !/\beval\s*\(/.test(entry) && !/\bFunction\s*\(/.test(entry),
  );
  add(
    "entry_no_dynamic_import_url",
    !(/import\s*\(\s*['"]https?:/).test(entry),
  );

  // Low-risk example skills cannot declare credentials/network
  if (manifest.risk === "R0") {
    add(
      "r0_no_dangerous_perms",
      !manifest.permissions.includes("network")
        && !manifest.permissions.includes("credentials")
        && !manifest.permissions.includes("file"),
    );
  } else {
    add("r0_no_dangerous_perms", true, "n/a");
  }

  // Third-party cannot read private character memory without grant
  const mem = filterMemoryForSkill(thirdPartyMemoryContext(manifest.id), [
    {
      id: "m1",
      characterId: "char-a",
      privacyLevel: "private",
      content: "secret",
    },
  ]);
  add("private_memory_default_denied", mem.allowed.length === 0);

  const failed = checks.filter((c) => !c.pass);
  return {
    ok: failed.length === 0,
    reason: failed.length ? "conformance_failed" : "ok",
    checks,
    failed,
    skillId: manifest.id,
    version: manifest.version,
  };
}

/**
 * Production runtime must refuse packages that fail conformance.
 * @param {ReturnType<typeof runConformance>} conf
 */
export function assertConformanceForProduction(conf) {
  if (!conf?.ok) {
    return { ok: false, reason: "cannot_load_production", conformance: conf };
  }
  return { ok: true };
}
