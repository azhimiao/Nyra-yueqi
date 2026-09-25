/**
 * Character / World package schemas & version protocol.
 * Local import/export + private share only; no public marketplace.
 */

/** Studio host contract version */
export const STUDIO_SDK_VERSION = 1;
export const STUDIO_SDK_MIN_SUPPORTED = 1;
export const STUDIO_SDK_MAX_SUPPORTED = 1;

export const CHARACTER_JSON_SCHEMA_ID = "yueqi.character.package.v1";
export const WORLD_JSON_SCHEMA_ID = "yueqi.world.package.v1";

export const CHARACTER_INSTALL_KEY = "yueqi.studio.characters.installed.v1";
export const WORLD_INSTALL_KEY = "yueqi.studio.worlds.installed.v1";
export const RELATION_MEMORY_KEY = "yueqi.studio.relation-memory.v1";
export const STUDIO_ROLLBACK_KEY = "yueqi.studio.rollback.v1";

/** Surfaces that must share the same identity contract */
export const PREVIEW_TARGETS = Object.freeze([
  "desk_pet",
  "pop",
  "app",
  "scenario",
  "notification",
]);

/** Contexts that require action/voice mapping */
export const ACTION_CONTEXTS = Object.freeze([
  "chat",
  "task",
  "waiting",
  "success",
  "failure",
]);

export const RELATION_MODES = Object.freeze([
  "partner",
  "friend",
  "mentor",
  "colleague",
  "custom",
]);

/** World packages may ONLY declare Skill Package dependency ids — never raw system perms */
export const WORLD_FORBIDDEN_PRIVILEGES = Object.freeze([
  "network",
  "file",
  "clipboard",
  "credentials",
  "shell",
  "eval",
  "filesystem",
  "camera",
  "microphone",
  "location",
  "contacts",
  "calendar",
  "hidden",
  "system",
  "admin",
]);

/**
 * Semver-lite: MAJOR.MINOR.PATCH
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
 * @returns {number} negative if a<b, 0 if equal, positive if a>b
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
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: object } | { ok: false, reason: string, errors?: string[] }}
 */
export function validateCharacterManifest(raw) {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "manifest_not_object" };
  }
  const errors = [];

  if (raw.schemaId !== CHARACTER_JSON_SCHEMA_ID) {
    return { ok: false, reason: "schema_drift", errors: ["schemaId mismatch"] };
  }

  const sdkVersion = Number(raw.sdkVersion);
  if (!Number.isInteger(sdkVersion) || sdkVersion < 1) {
    errors.push("sdkVersion must be positive integer");
  }

  const id = String(raw.id || "").trim();
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(id)) {
    errors.push("id must be kebab-case 3–64 chars");
  }

  const version = String(raw.version || "").trim();
  if (!parseSemver(version)) {
    errors.push("version must be semver MAJOR.MINOR.PATCH");
  }

  const name = String(raw.name || "").trim();
  if (!name) errors.push("name required");

  if (!isPlainObject(raw.identity)) errors.push("identity object required");
  if (!isPlainObject(raw.appearance)) errors.push("appearance object required");
  if (!isPlainObject(raw.actionVoiceMap)) errors.push("actionVoiceMap object required");
  if (!isPlainObject(raw.memoryPolicy)) errors.push("memoryPolicy object required");
  if (!isPlainObject(raw.relationPolicy)) errors.push("relationPolicy object required");

  // Hidden / system privilege fields are never allowed on character packages
  for (const key of ["permissions", "privileges", "systemAccess", "scripts", "entry"]) {
    if (raw[key] !== undefined) {
      errors.push(`forbidden_field:${key}`);
    }
  }

  if (Array.isArray(raw.skillDependencies)) {
    for (const dep of raw.skillDependencies) {
      if (typeof dep !== "string" || !dep.trim()) {
        errors.push("skillDependencies must be non-empty strings");
        break;
      }
    }
  } else if (raw.skillDependencies !== undefined) {
    errors.push("skillDependencies must be an array of skill ids");
  }

  if (errors.length) {
    return { ok: false, reason: "invalid_character_manifest", errors };
  }

  return {
    ok: true,
    value: {
      schemaId: CHARACTER_JSON_SCHEMA_ID,
      sdkVersion,
      id,
      name,
      version,
      description: String(raw.description || "").trim(),
      author: String(raw.author || "").trim() || undefined,
      minHostSdk: Number(raw.minHostSdk) || STUDIO_SDK_MIN_SUPPORTED,
      maxHostSdk: Number(raw.maxHostSdk) || STUDIO_SDK_MAX_SUPPORTED,
      identity: raw.identity,
      appearance: raw.appearance,
      actionVoiceMap: raw.actionVoiceMap,
      memoryPolicy: raw.memoryPolicy,
      relationPolicy: raw.relationPolicy,
      skillDependencies: Array.isArray(raw.skillDependencies)
        ? raw.skillDependencies.map((d) => String(d).trim()).filter(Boolean)
        : [],
      previewAspects: isPlainObject(raw.previewAspects) ? raw.previewAspects : {},
    },
  };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: object } | { ok: false, reason: string, errors?: string[] }}
 */
export function validateWorldManifest(raw) {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "manifest_not_object" };
  }
  const errors = [];

  if (raw.schemaId !== WORLD_JSON_SCHEMA_ID) {
    return { ok: false, reason: "schema_drift", errors: ["schemaId mismatch"] };
  }

  const sdkVersion = Number(raw.sdkVersion);
  if (!Number.isInteger(sdkVersion) || sdkVersion < 1) {
    errors.push("sdkVersion must be positive integer");
  }

  const id = String(raw.id || "").trim();
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(id)) {
    errors.push("id must be kebab-case 3–64 chars");
  }

  const version = String(raw.version || "").trim();
  if (!parseSemver(version)) {
    errors.push("version must be semver MAJOR.MINOR.PATCH");
  }

  const name = String(raw.name || "").trim();
  if (!name) errors.push("name required");

  // No direct system privileges — only skillDependencies
  for (const key of WORLD_FORBIDDEN_PRIVILEGES) {
    if (raw[key] !== undefined || raw.permissions?.[key] !== undefined) {
      errors.push(`forbidden_privilege:${key}`);
    }
  }
  if (raw.permissions !== undefined) {
    errors.push("forbidden_field:permissions");
  }
  if (raw.privileges !== undefined) {
    errors.push("forbidden_field:privileges");
  }
  if (raw.scriptsExecutable === true || raw.allowArbitraryScripts === true) {
    errors.push("arbitrary_scripts_forbidden");
  }

  if (!Array.isArray(raw.skillDependencies)) {
    errors.push("skillDependencies array required (may be empty)");
  } else {
    for (const dep of raw.skillDependencies) {
      if (typeof dep !== "string" || !dep.trim()) {
        errors.push("skillDependencies must be non-empty strings");
        break;
      }
      const lower = String(dep).toLowerCase();
      if (WORLD_FORBIDDEN_PRIVILEGES.some((p) => lower.includes(p))) {
        errors.push(`skillDependency_looks_like_privilege:${dep}`);
      }
    }
  }

  if (raw.entrySource !== undefined || raw.entry !== undefined) {
    errors.push("world_packages_cannot_ship_executable_entry");
  }

  if (!isPlainObject(raw.worldbook) && raw.worldbook !== undefined) {
    errors.push("worldbook must be object");
  }

  if (errors.length) {
    return { ok: false, reason: "invalid_world_manifest", errors };
  }

  return {
    ok: true,
    value: {
      schemaId: WORLD_JSON_SCHEMA_ID,
      sdkVersion,
      id,
      name,
      version,
      description: String(raw.description || "").trim(),
      author: String(raw.author || "").trim() || undefined,
      minHostSdk: Number(raw.minHostSdk) || STUDIO_SDK_MIN_SUPPORTED,
      maxHostSdk: Number(raw.maxHostSdk) || STUDIO_SDK_MAX_SUPPORTED,
      skillDependencies: raw.skillDependencies.map((d) => String(d).trim()).filter(Boolean),
      worldbook: isPlainObject(raw.worldbook) ? raw.worldbook : { entries: [] },
      places: Array.isArray(raw.places) ? raw.places : [],
      events: Array.isArray(raw.events) ? raw.events : [],
      props: Array.isArray(raw.props) ? raw.props : [],
      backgrounds: Array.isArray(raw.backgrounds) ? raw.backgrounds : [],
      scripts: Array.isArray(raw.scripts) ? raw.scripts : [],
      sharedExperienceTemplates: Array.isArray(raw.sharedExperienceTemplates)
        ? raw.sharedExperienceTemplates
        : [],
    },
  };
}

/**
 * Detect schema drift vs host.
 * @param {object} manifest
 */
export function detectCharacterSchemaDrift(manifest) {
  if (!manifest || manifest.schemaId !== CHARACTER_JSON_SCHEMA_ID) {
    return { ok: false, reason: "schema_drift" };
  }
  return { ok: true };
}

/**
 * @param {object} manifest
 */
export function detectWorldSchemaDrift(manifest) {
  if (!manifest || manifest.schemaId !== WORLD_JSON_SCHEMA_ID) {
    return { ok: false, reason: "schema_drift" };
  }
  return { ok: true };
}

/**
 * Host SDK window check.
 * @param {{ minHostSdk?: number, maxHostSdk?: number }} manifest
 */
export function checkStudioSdkCompatibility(manifest) {
  const min = Number(manifest?.minHostSdk) || STUDIO_SDK_MIN_SUPPORTED;
  const max = Number(manifest?.maxHostSdk) || STUDIO_SDK_MAX_SUPPORTED;
  if (STUDIO_SDK_VERSION < min || STUDIO_SDK_VERSION > max) {
    return { ok: false, reason: "incompatible_studio_sdk", min, max, host: STUDIO_SDK_VERSION };
  }
  return { ok: true, host: STUDIO_SDK_VERSION };
}

/**
 * @param {string} fromVersion
 * @param {string} toVersion
 */
export function checkPackageUpgradeCompatibility(fromVersion, toVersion) {
  const from = parseSemver(fromVersion);
  const to = parseSemver(toVersion);
  if (!from || !to) return { ok: false, reason: "invalid_semver" };
  const cmp = compareSemver(fromVersion, toVersion);
  if (Number.isNaN(cmp)) return { ok: false, reason: "invalid_semver" };
  if (cmp > 0) return { ok: false, reason: "downgrade_blocked" };
  if (cmp === 0) return { ok: false, reason: "same_version" };
  const kind = to.major > from.major ? "major" : to.minor > from.minor ? "minor" : "patch";
  return { ok: true, kind, requiresRollbackSlot: true };
}
