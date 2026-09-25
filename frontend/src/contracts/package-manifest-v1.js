/**
 * Package Manifest V1 — shared intake envelope for Skill / Experience / Character packages.
 */

export const PACKAGE_TYPES = Object.freeze([
  "skill",
  "experience",
  "character",
  "yeos",
  "play",
]);

export const PACKAGE_MANIFEST_SCHEMA_VERSION = 1;

/**
 * @param {object} raw
 */
export function validatePackageManifestV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== PACKAGE_MANIFEST_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of ["packageId", "packageType", "name", "version", "contentHash"]) {
    if (!String(raw[key] || "").trim()) errors.push(key);
  }
  if (!PACKAGE_TYPES.includes(raw.packageType)) errors.push("packageType");
  if (!Array.isArray(raw.requestedCapabilities)) errors.push("requestedCapabilities");
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} input
 */
export function createPackageManifestV1(input = {}) {
  return {
    schemaVersion: PACKAGE_MANIFEST_SCHEMA_VERSION,
    packageId: String(input.packageId || ""),
    packageType: PACKAGE_TYPES.includes(input.packageType) ? input.packageType : "skill",
    name: String(input.name || "").trim(),
    version: String(input.version || "").trim(),
    contentHash: String(input.contentHash || "").trim(),
    sourceLabel: String(input.sourceLabel || ""),
    requestedCapabilities: Array.isArray(input.requestedCapabilities)
      ? input.requestedCapabilities
      : [],
    entry: String(input.entry || "SKILL.md"),
    locale: String(input.locale || ""),
    description: String(input.description || ""),
    createdAt: String(input.createdAt || new Date().toISOString()),
  };
}
