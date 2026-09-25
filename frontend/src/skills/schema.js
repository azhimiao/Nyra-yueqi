/**
 * Skill package format (`skill.json`), version protocol, validators.
 */

import { RISK_LEVELS } from "../agent/schema.js";

/** Skill SDK contract version (host runtime). */
export const SKILL_SDK_VERSION = 1;

/** Minimum SDK version a package may declare and still load on this host. */
export const SKILL_SDK_MIN_SUPPORTED = 1;

/** Maximum SDK version this host understands. */
export const SKILL_SDK_MAX_SUPPORTED = 1;

/** skill.json schema id */
export const SKILL_JSON_SCHEMA_ID = "yueqi.skill.package.v1";

/** Default storage keys for installed skill bags */
export const SKILL_INSTALL_KEY = "yueqi.skills.installed.v1";
export const SKILL_ROLLBACK_KEY = "yueqi.skills.rollback.v1";

/** Permissions a skill may declare (all denied by default in sandbox). */
export const SKILL_PERMISSIONS = Object.freeze([
  "network",
  "file",
  "clipboard",
  "credentials",
  "character_memory_shared",
  "character_memory_private",
]);

export const UI_SLOTS = Object.freeze([
  "task_center_row",
  "approval_extra",
  "settings_panel",
  "none",
]);

export const SKILL_EVENT_TYPES = Object.freeze([
  "skill.installed",
  "skill.uninstalled",
  "skill.upgraded",
  "skill.rolled_back",
  "skill.invoke.start",
  "skill.invoke.end",
  "skill.invoke.error",
  "skill.permission.denied",
  "skill.conformance.failed",
]);

/**
 * @typedef {{
 *   schemaId: string,
 *   sdkVersion: number,
 *   id: string,
 *   name: string,
 *   version: string,
 *   description: string,
 *   risk: "R0"|"R1"|"R2"|"R3",
 *   permissions: string[],
 *   entry: string,
 *   uiSlots?: string[],
 *   capabilities?: string[],
 *   author?: string,
 *   homepage?: string,
 *   minHostSdk?: number,
 *   maxHostSdk?: number,
 *   characterMemoryAccess?: "none"|"shared"|"private",
 * }} SkillManifest
 */

/**
 * Semver-lite: MAJOR.MINOR.PATCH (numeric parts only).
 * @param {string} v
 */
export function parseSemver(v) {
  const m = String(v || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), raw: m[0] };
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} negative if a < b
 */
export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return NaN;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

/**
 * Validate skill.json / manifest object.
 * @param {unknown} raw
 * @returns {{ ok: true, value: SkillManifest } | { ok: false, reason: string, details?: string[] }}
 */
export function validateSkillManifest(raw) {
  /** @type {string[]} */
  const details = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "manifest_not_object" };
  }
  const m = /** @type {Record<string, unknown>} */ (raw);

  if (m.schemaId !== SKILL_JSON_SCHEMA_ID) {
    details.push(`schemaId must be ${SKILL_JSON_SCHEMA_ID}`);
  }

  const sdkVersion = Number(m.sdkVersion);
  if (!Number.isInteger(sdkVersion) || sdkVersion < 1) {
    details.push("sdkVersion must be positive integer");
  }

  const id = String(m.id || "").trim();
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) {
    details.push("id must match /^[a-z][a-z0-9-]{1,63}$/");
  }

  const name = String(m.name || "").trim();
  if (!name || name.length > 80) details.push("name required (≤80 chars)");

  const version = String(m.version || "").trim();
  if (!parseSemver(version)) details.push("version must be MAJOR.MINOR.PATCH");

  const description = String(m.description || "").trim();
  if (!description || description.length > 500) {
    details.push("description required (≤500 chars)");
  }

  const risk = String(m.risk || "");
  if (!RISK_LEVELS.includes(/** @type {any} */ (risk))) {
    details.push(`risk must be one of ${RISK_LEVELS.join(",")}`);
  }

  const permissions = Array.isArray(m.permissions)
    ? m.permissions.map((p) => String(p))
    : null;
  if (!permissions) {
    details.push("permissions must be an array");
  } else {
    for (const p of permissions) {
      if (!SKILL_PERMISSIONS.includes(p)) details.push(`unknown permission: ${p}`);
    }
  }

  const entry = String(m.entry || "").trim();
  if (!entry || entry.includes("..") || entry.startsWith("/") || /^[a-zA-Z]:/.test(entry)) {
    details.push("entry must be a relative package path without traversal");
  }

  const uiSlots = Array.isArray(m.uiSlots) ? m.uiSlots.map(String) : ["none"];
  for (const s of uiSlots) {
    if (!UI_SLOTS.includes(s)) details.push(`unknown uiSlot: ${s}`);
  }

  const capabilities = Array.isArray(m.capabilities)
    ? m.capabilities.map(String)
    : [id];
  for (const c of capabilities) {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(c)) details.push(`bad capability id: ${c}`);
  }

  const memoryAccess = String(m.characterMemoryAccess || "none");
  if (!["none", "shared", "private"].includes(memoryAccess)) {
    details.push("characterMemoryAccess must be none|shared|private");
  }

  // Compat protocol fields (optional; defaults to sdkVersion)
  const minHostSdk = m.minHostSdk == null ? sdkVersion : Number(m.minHostSdk);
  const maxHostSdk = m.maxHostSdk == null ? sdkVersion : Number(m.maxHostSdk);
  if (!Number.isInteger(minHostSdk) || !Number.isInteger(maxHostSdk) || minHostSdk > maxHostSdk) {
    details.push("minHostSdk/maxHostSdk invalid");
  }

  // High-risk permission consistency
  if (permissions) {
    if (permissions.includes("network") && risk === "R0") {
      details.push("network permission requires risk ≥ R1");
    }
    if (permissions.includes("credentials") && (risk === "R0" || risk === "R1")) {
      details.push("credentials permission requires risk ≥ R2");
    }
    if (memoryAccess === "private" && !permissions.includes("character_memory_private")) {
      details.push("private memory access requires character_memory_private permission");
    }
    if (memoryAccess === "shared" && !permissions.includes("character_memory_shared")
      && !permissions.includes("character_memory_private")) {
      details.push("shared memory access requires character_memory_shared permission");
    }
  }

  if (details.length) {
    return { ok: false, reason: "schema_drift", details };
  }

  /** @type {SkillManifest} */
  const value = {
    schemaId: SKILL_JSON_SCHEMA_ID,
    sdkVersion,
    id,
    name,
    version,
    description,
    risk: /** @type {any} */ (risk),
    permissions: /** @type {string[]} */ (permissions),
    entry,
    uiSlots,
    capabilities,
    minHostSdk,
    maxHostSdk,
    characterMemoryAccess: /** @type {any} */ (memoryAccess),
  };
  if (m.author != null) value.author = String(m.author);
  if (m.homepage != null) value.homepage = String(m.homepage);
  return { ok: true, value };
}

/**
 * Detect schema drift vs host expectation (extra/unknown critical fields already caught;
 * this flags missing required shape after parse).
 * @param {SkillManifest} manifest
 * @param {Partial<SkillManifest>} [expected]
 */
export function detectSchemaDrift(manifest, expected = {}) {
  /** @type {string[]} */
  const drifts = [];
  if (manifest.schemaId !== SKILL_JSON_SCHEMA_ID) drifts.push("schemaId");
  if (manifest.sdkVersion < SKILL_SDK_MIN_SUPPORTED
    || manifest.sdkVersion > SKILL_SDK_MAX_SUPPORTED) {
    drifts.push("sdkVersion_out_of_range");
  }
  if (expected.id && manifest.id !== expected.id) drifts.push("id_mismatch");
  if (expected.version && manifest.version !== expected.version) drifts.push("version_mismatch");
  return { ok: drifts.length === 0, drifts };
}
