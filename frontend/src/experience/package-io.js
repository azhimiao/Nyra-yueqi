/**
 * Experience package IO — import / export / migrate / security (§12 / §13.2 / W6).
 * No arbitrary JS execution. Custom CSS and external URLs are restricted.
 * Signature helpers live in package-signature.js (Node); pass via opts.sign / opts.verifyIntegrity.
 */

import {
  FORBIDDEN_PACKAGE_GRAPH_KEYS,
  createExperiencePackage,
  EXPERIENCE_SCHEMA_VERSION,
} from "./schema.js";

export const EXPERIENCE_BUNDLE_FORMAT = "yueqi.experience.bundle.v1";

/** Keys that imply executable / script payloads — forbidden in V1 packages. */
export const FORBIDDEN_PACKAGE_JS_KEYS = Object.freeze([
  "script",
  "scripts",
  "javascript",
  "eval",
  "module",
  "entrySource",
  "onLoad",
  "onEnter",
  "hooks",
  "customJs",
  "customJS",
  "wasm",
]);

/** Privacy / secret keys stripped from export. */
export const EXPORT_SCRUB_KEYS = Object.freeze([
  "apiKey",
  "api_key",
  "publisherSecret",
  "secret",
  "token",
  "accessToken",
  "refreshToken",
  "password",
  "privateKey",
  "chatHistory",
  "messages",
  "userChats",
  "longTermMemory",
  "memoryCandidates",
  "acceptedMemories",
  "personaPrivate",
  "privatePersona",
  "userPersonaPrivate",
  "diaryEntries",
  "sessionTranscript",
]);

const DANGEROUS_URL_RE =
  /^(javascript|data|vbscript|file|blob):/i;
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["https:", "http:"]);
const MAX_CUSTOM_CSS_CHARS = 4000;
const CSS_FORBIDDEN_RE =
  /@import|expression\s*\(|behavior\s*:|javascript\s*:|url\s*\(\s*['"]?\s*(javascript|data):/i;

/**
 * Deep-scan object for forbidden graph keys.
 * @param {unknown} node
 * @param {string[]} [found]
 * @returns {string[]}
 */
export function findForbiddenGraphKeys(node, found = []) {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const item of node) findForbiddenGraphKeys(item, found);
    return found;
  }
  for (const key of Object.keys(node)) {
    if (FORBIDDEN_PACKAGE_GRAPH_KEYS.includes(key)) {
      found.push(key);
    }
    findForbiddenGraphKeys(/** @type {any} */ (node)[key], found);
  }
  return found;
}

/**
 * Deep-scan for arbitrary JS / executable keys.
 * @param {unknown} node
 * @param {string[]} [found]
 */
export function findForbiddenJsKeys(node, found = []) {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const item of node) findForbiddenJsKeys(item, found);
    return found;
  }
  for (const key of Object.keys(node)) {
    const lower = key.toLowerCase();
    if (
      FORBIDDEN_PACKAGE_JS_KEYS.some((k) => k.toLowerCase() === lower)
      || lower.endsWith("javascript")
      || lower === "js"
    ) {
      found.push(key);
    }
    const val = /** @type {any} */ (node)[key];
    if (typeof val === "function") {
      found.push(`${key}:function`);
    }
    findForbiddenJsKeys(val, found);
  }
  return found;
}

/**
 * @param {string} url
 */
export function isAllowedResourceUrl(url) {
  const s = String(url || "").trim();
  if (!s) return { ok: true, reason: "" };
  if (DANGEROUS_URL_RE.test(s)) {
    return { ok: false, reason: "dangerous_url_scheme" };
  }
  if (s.startsWith("/") || s.startsWith("./") || s.startsWith("../") || s.startsWith("#")) {
    return { ok: true, reason: "" };
  }
  if (s.startsWith("assets/") || s.startsWith("media/")) {
    return { ok: true, reason: "" };
  }
  try {
    const u = new URL(s);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(u.protocol)) {
      return { ok: false, reason: `protocol_not_allowed:${u.protocol}` };
    }
    return { ok: true, reason: "" };
  } catch {
    if (/^[a-z0-9_./-]+$/i.test(s)) return { ok: true, reason: "" };
    return { ok: false, reason: "malformed_url" };
  }
}

/**
 * Validate resource license declarations (§12.3).
 * @param {unknown} resources
 * @returns {string[]}
 */
export function validateResourceLicenses(resources) {
  const errors = [];
  if (resources == null) return errors;
  if (!Array.isArray(resources)) {
    errors.push("resources_not_array");
    return errors;
  }
  for (let i = 0; i < resources.length; i += 1) {
    const r = resources[i];
    if (!r || typeof r !== "object") {
      errors.push(`resource_${i}_not_object`);
      continue;
    }
    if (!String(r.id || "").trim()) errors.push(`resource_${i}_missing_id`);
    if (!String(r.license || "").trim()) errors.push(`resource_${i}_missing_license`);
    if (!String(r.source || r.origin || "").trim()) {
      errors.push(`resource_${i}_missing_source`);
    }
    const url = String(r.url || r.href || "");
    if (url) {
      const urlCheck = isAllowedResourceUrl(url);
      if (!urlCheck.ok) errors.push(`resource_${i}_${urlCheck.reason}`);
    }
    if (r.hash != null && typeof r.hash !== "string") {
      errors.push(`resource_${i}_hash_not_string`);
    }
  }
  return errors;
}

/**
 * Restrict custom CSS (§12.3) — default off; when present must be small + cleaned.
 * @param {unknown} css
 */
export function validateCustomCss(css) {
  if (css == null || css === "") return { ok: true, errors: [] };
  if (typeof css !== "string") {
    return { ok: false, errors: ["custom_css_not_string"] };
  }
  if (css.length > MAX_CUSTOM_CSS_CHARS) {
    return { ok: false, errors: ["custom_css_too_large"] };
  }
  if (CSS_FORBIDDEN_RE.test(css)) {
    return { ok: false, errors: ["custom_css_forbidden_construct"] };
  }
  return { ok: true, errors: [] };
}

/**
 * Scan package for dangerous external URLs in common string fields.
 * @param {unknown} node
 * @param {string[]} [errors]
 * @param {string} [path]
 */
export function findDangerousUrls(node, errors = [], path = "") {
  if (node == null) return errors;
  if (typeof node === "string") {
    if (/^(https?:|javascript:|data:|vbscript:|file:|blob:)/i.test(node) || node.includes("://")) {
      const check = isAllowedResourceUrl(node);
      if (!check.ok) errors.push(`${path || "value"}:${check.reason}`);
    }
    return errors;
  }
  if (typeof node !== "object") return errors;
  if (Array.isArray(node)) {
    node.forEach((item, i) => findDangerousUrls(item, errors, `${path}[${i}]`));
    return errors;
  }
  for (const [key, val] of Object.entries(node)) {
    const next = path ? `${path}.${key}` : key;
    if (
      /url|href|src|cover|icon|background|asset|image|audio|sound/i.test(key)
      && typeof val === "string"
    ) {
      const check = isAllowedResourceUrl(val);
      if (!check.ok) errors.push(`${next}:${check.reason}`);
    } else {
      findDangerousUrls(val, errors, next);
    }
  }
  return errors;
}

/**
 * Migrate older package schema versions → current.
 * @param {object} raw
 */
export function migrateExperiencePackage(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["package_not_object"], value: null, migrated: false };
  }
  /** @type {any} */
  let next = { ...raw };
  const from = Number(next.schemaVersion) || 0;
  let migrated = false;

  if (from < 1) {
    if (!Array.isArray(next.openings) || next.openings.length < 1) {
      if (Array.isArray(next.scenes) && next.scenes.length) {
        next.openings = next.scenes;
        delete next.scenes;
        migrated = true;
      } else if (next.opening && typeof next.opening === "object") {
        next.openings = [next.opening];
        delete next.opening;
        migrated = true;
      }
    }
    if (!next.memoryPolicy) {
      next.memoryPolicy = { requireUserAccept: true };
      migrated = true;
    }
    if (!next.rendererProfile) {
      next.rendererProfile = "immersive-stage-v1";
      migrated = true;
    }
    next.schemaVersion = 1;
    migrated = true;
  }

  if (Number(next.schemaVersion) > EXPERIENCE_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`schema_too_new:${next.schemaVersion}`],
      value: null,
      migrated,
    };
  }

  // Already on current schema: do not rewrite migration stamps (keeps package hash stable).
  if (!migrated && from === EXPERIENCE_SCHEMA_VERSION) {
    return { ok: true, errors: [], value: next, migrated: false };
  }

  next.schemaVersion = EXPERIENCE_SCHEMA_VERSION;
  next.migration = {
    ...(next.migration && typeof next.migration === "object" ? next.migration : {}),
    fromSchemaVersion: from,
    toSchemaVersion: EXPERIENCE_SCHEMA_VERSION,
    migratedAt: new Date().toISOString(),
  };

  return { ok: true, errors: [], value: next, migrated: true };
}

/**
 * Deep scrub privacy / keys from a clone.
 * @param {unknown} node
 */
export function scrubPrivacyFromExport(node) {
  if (node == null) return node;
  if (Array.isArray(node)) {
    return node.map((item) => scrubPrivacyFromExport(item));
  }
  if (typeof node !== "object") return node;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, val] of Object.entries(node)) {
    if (EXPORT_SCRUB_KEYS.includes(key)) continue;
    if (/apikey|secret|password|privatekey|accesstoken/i.test(key)) continue;
    out[key] = scrubPrivacyFromExport(val);
  }
  return out;
}

/**
 * @param {object} pkg
 */
function normalizeResources(pkg) {
  const resources = Array.isArray(pkg.resources)
    ? pkg.resources.map((r) => ({
        id: String(r?.id || "").trim(),
        license: String(r?.license || "").trim(),
        source: String(r?.source || r?.origin || "").trim(),
        url: String(r?.url || r?.href || "").trim(),
        hash: r?.hash != null ? String(r.hash) : "",
        note: String(r?.note || "").trim(),
      }))
    : [];
  return { ...pkg, resources };
}

/**
 * Full security + schema validate.
 * @param {unknown} raw
 * @param {{
 *   requireSignature?: boolean,
 *   publisherSecret?: string,
 *   expectedHash?: string,
 *   signature?: string,
 *   verifyIntegrity?: (pkg: object, opts: object) => { ok: boolean, reason?: string },
 * }} [opts]
 */
export function validateExperiencePackage(raw, opts = {}) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["package_not_object"], value: null };
  }

  const migrated = migrateExperiencePackage(raw);
  if (!migrated.ok || !migrated.value) {
    return { ok: false, errors: migrated.errors, value: null };
  }

  /** @type {any} */
  const o = migrated.value;
  if (!String(o.id || "").trim()) errors.push("missing_id");
  if (!Array.isArray(o.openings) || o.openings.length < 1) {
    errors.push("openings_required");
  }

  const forbidden = [...new Set(findForbiddenGraphKeys(o))];
  for (const key of forbidden) {
    errors.push(`forbidden_graph_field:${key}`);
  }

  const jsKeys = [...new Set(findForbiddenJsKeys(o))];
  for (const key of jsKeys) {
    errors.push(`forbidden_js_field:${key}`);
  }

  errors.push(...validateResourceLicenses(o.resources));

  const cssCheck = validateCustomCss(o.customCss || o.customCSS || o.ui?.customCss);
  if (!cssCheck.ok) errors.push(...cssCheck.errors);

  if ((o.customCss || o.customCSS || o.ui?.customCss) && o.permissions?.allowCustomCss !== true) {
    errors.push("custom_css_not_permitted");
  }

  errors.push(...findDangerousUrls(o));

  if (typeof o.entrySource === "string" && o.entrySource.trim()) {
    errors.push("forbidden_js_field:entrySource");
  }

  const wantsSig =
    opts.requireSignature
    || opts.signature
    || opts.expectedHash
    || (o.signature && (opts.publisherSecret || opts.verifyIntegrity));

  if (wantsSig) {
    if (typeof opts.verifyIntegrity !== "function") {
      errors.push("signature:verify_fn_required");
    } else {
      const integrity = opts.verifyIntegrity(o, {
        expectedHash: opts.expectedHash || o.packageHash,
        signature: opts.signature || o.signature,
        publisherSecret: opts.publisherSecret,
      });
      if (!integrity?.ok) {
        errors.push(`signature:${integrity?.reason || "failed"}`);
      }
    }
  }

  if (errors.length) {
    return { ok: false, errors, value: null };
  }

  try {
    const normalized = normalizeResources(createExperiencePackage(o));
    if (Array.isArray(o.resources)) normalized.resources = o.resources;
    if (o.permissions) normalized.permissions = { ...normalized.permissions, ...o.permissions };
    if (o.customCss && o.permissions?.allowCustomCss) {
      normalized.customCss = String(o.customCss);
    }
    if (normalized.openings.length < 1) {
      return { ok: false, errors: ["openings_empty_after_normalize"], value: null };
    }
    return {
      ok: true,
      errors: [],
      value: normalized,
      migrated: migrated.migrated,
    };
  } catch (error) {
    return {
      ok: false,
      errors: [`normalize_failed:${error?.message || error}`],
      value: null,
    };
  }
}

/**
 * Load package from object or JSON string.
 * @param {unknown} source
 * @param {Parameters<typeof validateExperiencePackage>[1]} [opts]
 */
export function loadExperiencePackage(source, opts = {}) {
  let raw = source;
  if (typeof source === "string") {
    try {
      raw = JSON.parse(source);
    } catch {
      return { ok: false, errors: ["invalid_json"], value: null };
    }
  }
  if (raw && typeof raw === "object" && raw.format === EXPERIENCE_BUNDLE_FORMAT) {
    return importExperienceBundle(raw, opts);
  }
  return validateExperiencePackage(raw, opts);
}

/**
 * Serialize package for export (scrubbed, no functions / privacy).
 * @param {ReturnType<typeof createExperiencePackage>|object} pkg
 * @param {{
 *   sign?: (body: object) => { hash: string, signature?: string|null },
 * }} [opts]
 */
export function exportExperiencePackage(pkg, opts = {}) {
  const scrubbed = scrubPrivacyFromExport(pkg);
  const validated = validateExperiencePackage(scrubbed);
  if (!validated.ok || !validated.value) {
    return { ok: false, errors: validated.errors, json: "", value: null };
  }

  /** @type {any} */
  const body = { ...validated.value };
  delete body.apiKey;
  delete body.publisherSecret;

  let hash;
  let signature = null;
  if (typeof opts.sign === "function") {
    const signed = opts.sign(body) || {};
    hash = signed.hash;
    signature = signed.signature || null;
    if (hash) body.packageHash = hash;
    if (signature) body.signature = signature;
  }

  const bundle = {
    format: EXPERIENCE_BUNDLE_FORMAT,
    schemaVersion: EXPERIENCE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    package: body,
    hash: hash || undefined,
    signature: signature || undefined,
    marketplace: null,
    payment: null,
  };

  return {
    ok: true,
    errors: [],
    json: JSON.stringify(bundle, null, 2),
    value: body,
    bundle,
  };
}

/**
 * Import a bundle or raw package; validates security + optional signature.
 * @param {unknown} bundleOrPkg
 * @param {Parameters<typeof validateExperiencePackage>[1]} [opts]
 */
export function importExperienceBundle(bundleOrPkg, opts = {}) {
  if (!bundleOrPkg || typeof bundleOrPkg !== "object") {
    return { ok: false, errors: ["bundle_not_object"], value: null };
  }
  /** @type {any} */
  const b = bundleOrPkg;
  if (b.marketplace || b.payment || b.publicListingId) {
    return { ok: false, errors: ["marketplace_or_payment_forbidden"], value: null };
  }

  const rawPkg = b.format === EXPERIENCE_BUNDLE_FORMAT ? b.package : b;
  if (!rawPkg) {
    return { ok: false, errors: ["missing_package"], value: null };
  }

  return validateExperiencePackage(rawPkg, {
    ...opts,
    expectedHash: opts.expectedHash || b.hash || rawPkg.packageHash,
    signature: opts.signature || b.signature || rawPkg.signature,
  });
}

/**
 * @param {ReturnType<typeof createExperiencePackage>} pkg
 * @param {string} openingId
 */
export function getPackageOpening(pkg, openingId) {
  if (!pkg?.openings?.length) return null;
  const id = String(openingId || "").trim();
  if (!id) return pkg.openings[0];
  return pkg.openings.find((o) => o.id === id) || null;
}

/**
 * Round-trip helper: export → parse → validate (behavior-critical fields).
 * @param {object} pkg
 */
export function roundTripExperiencePackage(pkg) {
  const exported = exportExperiencePackage(pkg);
  if (!exported.ok) {
    return { ok: false, errors: exported.errors, original: null, imported: null };
  }
  const imported = importExperienceBundle(JSON.parse(exported.json));
  if (!imported.ok || !imported.value) {
    return { ok: false, errors: imported.errors, original: exported.value, imported: null };
  }
  const a = exported.value;
  const b = imported.value;
  const mismatches = [];
  for (const key of [
    "id",
    "title",
    "synopsis",
    "version",
    "contentRating",
    "playerRole",
    "rendererProfile",
  ]) {
    if (String(a[key] || "") !== String(b[key] || "")) mismatches.push(`field:${key}`);
  }
  if ((a.openings || []).length !== (b.openings || []).length) {
    mismatches.push("openings_count");
  } else {
    for (let i = 0; i < a.openings.length; i += 1) {
      if (a.openings[i].id !== b.openings[i].id) mismatches.push(`opening_id:${i}`);
      if (a.openings[i].title !== b.openings[i].title) mismatches.push(`opening_title:${i}`);
    }
  }
  if ((a.embeddedLorebook || []).length !== (b.embeddedLorebook || []).length) {
    mismatches.push("lore_count");
  }
  if (JSON.stringify(a.initialAssets || {}) !== JSON.stringify(b.initialAssets || {})) {
    mismatches.push("initialAssets");
  }
  if (JSON.stringify(a.permissions || {}) !== JSON.stringify(b.permissions || {})) {
    mismatches.push("permissions");
  }
  if (JSON.stringify(a.memoryPolicy || {}) !== JSON.stringify(b.memoryPolicy || {})) {
    mismatches.push("memoryPolicy");
  }

  return {
    ok: mismatches.length === 0,
    errors: mismatches,
    original: a,
    imported: b,
    json: exported.json,
  };
}

export { EXPERIENCE_SCHEMA_VERSION, FORBIDDEN_PACKAGE_GRAPH_KEYS };
