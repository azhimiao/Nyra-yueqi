/**
 * Compile external SKILL.md frontmatter + resource map → yueqi-skill-manifest.v1.
 */

import {
  MANIFEST_SCHEMA_ID,
  OUTPUT_MODES,
  RESOURCE_DIRS,
  SKILL_PLATFORM_SCHEMA_VERSION,
} from "./schema.js";
import { computeBundleHash, normalizeRelativePath } from "./integrity.js";

/**
 * Strip surrounding quotes from YAML scalar.
 * @param {string} s
 */
function stripQuotes(s) {
  const t = String(s || "").trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Lightweight YAML frontmatter parser (no external deps).
 * Supports key: value, key: [a, b], and key: / - item lists.
 * @param {string} text
 */
export function parseYamlFrontmatter(text) {
  const match = String(text || "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  /** @type {Record<string, string | string[] | boolean>} */
  const result = {};
  /** @type {string|null} */
  let currentKey = null;
  let inArray = false;

  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const arrayItem = trimmed.match(/^-\s+(.+)$/);
    if (arrayItem && currentKey && inArray) {
      const arr = /** @type {string[]} */ (result[currentKey]);
      arr.push(stripQuotes(arrayItem[1]));
      continue;
    }

    const kv = trimmed.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;

    currentKey = kv[1];
    const rawVal = kv[2].trim();

    if (rawVal === "" || rawVal === "|" || rawVal === ">") {
      result[currentKey] = [];
      inArray = true;
      continue;
    }

    if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
      result[currentKey] = rawVal
        .slice(1, -1)
        .split(",")
        .map((s) => stripQuotes(s.trim()))
        .filter(Boolean);
      inArray = false;
      continue;
    }

    if (rawVal === "true" || rawVal === "false") {
      result[currentKey] = rawVal === "true";
      inArray = false;
      continue;
    }

    result[currentKey] = stripQuotes(rawVal);
    inArray = false;
  }

  return result;
}

/**
 * @param {string} text
 */
export function stripFrontmatter(text) {
  return String(text || "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/**
 * @param {Record<string, string>} files
 * @returns {string[]}
 */
export function findSkillMdPaths(files) {
  return Object.keys(files)
    .map((p) => normalizeRelativePath(p))
    .filter((p) => p.toLowerCase() === "skill.md" || p.toLowerCase().endsWith("/skill.md"))
    .sort();
}

/**
 * Directory prefix for a SKILL.md path.
 * @param {string} skillMdPath
 */
export function skillRootPrefix(skillMdPath) {
  const norm = normalizeRelativePath(skillMdPath);
  const idx = norm.toLowerCase().lastIndexOf("skill.md");
  return idx > 0 ? norm.slice(0, idx) : "";
}

/**
 * @param {Record<string, string>} files
 * @param {string} skillMdPath
 */
export function classifyResources(files, skillMdPath) {
  const root = skillRootPrefix(skillMdPath);
  /** @type {{ system: string[], policies: string[], schemas: string[], evals: string[] }} */
  const resources = { system: [], policies: [], schemas: [], evals: [] };

  for (const rawPath of Object.keys(files)) {
    const path = normalizeRelativePath(rawPath);
    if (path.toLowerCase().endsWith("skill.md")) continue;
    if (root && !path.startsWith(root)) continue;
    const rel = root ? path.slice(root.length) : path;

    for (const [kind, dir] of Object.entries(RESOURCE_DIRS)) {
      const prefix = `${dir}/`;
      if (rel.startsWith(prefix) && rel.length > prefix.length) {
        resources[/** @type {keyof typeof resources} */ (kind)].push(path);
      }
    }
  }

  for (const key of Object.keys(resources)) {
    resources[/** @type {keyof typeof resources} */ (key)].sort();
  }
  return resources;
}

/**
 * @param {Record<string, string>} files
 * @param {string} skillMdPath
 * @param {{ sourceLabel?: string }} [opts]
 */
export function compileManifestFromSkillMd(files, skillMdPath, opts = {}) {
  const normPath = normalizeRelativePath(skillMdPath);
  const content = files[skillMdPath] ?? files[normPath];
  if (!content) {
    return { ok: false, reason: "skill_md_not_found", path: skillMdPath };
  }

  const fm = parseYamlFrontmatter(content);
  const id = String(fm.id || fm.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const name = String(fm.name || fm.id || "").trim();
  const version = String(fm.version || "1.0.0").trim();

  if (!id) return { ok: false, reason: "missing_id" };
  if (!name) return { ok: false, reason: "missing_name" };

  const outputMode = String(fm["output-mode"] || fm.outputMode || "structured_dialogue");
  if (!OUTPUT_MODES.includes(outputMode)) {
    return { ok: false, reason: "invalid_output_mode", value: outputMode };
  }

  const resources = classifyResources(files, normPath);
  const scopedFiles = {};
  const root = skillRootPrefix(normPath);
  for (const [rawPath, body] of Object.entries(files)) {
    const path = normalizeRelativePath(rawPath);
    if (!root || path.startsWith(root) || path.toLowerCase().endsWith("skill.md")) {
      scopedFiles[path] = body;
    }
  }

  const disableModelInvocation =
    fm["disable-model-invocation"] === true ||
    String(fm["disable-model-invocation"] || "").toLowerCase() === "true";

  const requestedCapabilities = Array.isArray(fm["requested-capabilities"])
    ? fm["requested-capabilities"].map(String)
    : Array.isArray(fm.requestedCapabilities)
      ? fm.requestedCapabilities.map(String)
      : [];

  const triggers = Array.isArray(fm.triggers) ? fm.triggers.map(String) : [];

  const allowedActions = Array.isArray(fm.allowedActions)
    ? fm.allowedActions.map(String)
    : Array.isArray(fm["allowed-actions"])
      ? fm["allowed-actions"].map(String)
      : undefined;

  /** @type {object} */
  const manifest = {
    schemaVersion: SKILL_PLATFORM_SCHEMA_VERSION,
    schemaId: MANIFEST_SCHEMA_ID,
    id,
    name,
    version,
    description: String(fm.description || "").trim(),
    category: String(fm.category || "general").trim(),
    entry: normPath,
    resources,
    triggers,
    outputMode,
    requestedCapabilities,
    requestedDataScopes: Array.isArray(fm["requested-data-scopes"])
      ? fm["requested-data-scopes"].map(String)
      : [],
    execution: {
      kind: "prompt_policy",
      modelInvocation: disableModelInvocation ? "host_only" : "host_only",
    },
    integrity: {
      sha256: computeBundleHash(scopedFiles),
    },
    sourceLabel: opts.sourceLabel || "import",
    compiledAt: new Date().toISOString(),
  };
  if (allowedActions?.length) {
    manifest.allowedActions = allowedActions;
  }

  return { ok: true, value: manifest, files: scopedFiles };
}

/**
 * @param {Record<string, string>} files
 */
export function discoverSkillManifests(files) {
  const paths = findSkillMdPaths(files);
  /** @type {{ ok: true, value: object, skillMdPath: string, files: Record<string,string> }[]} */
  const discovered = [];
  /** @type {{ path: string, reason: string }[]} */
  const errors = [];

  for (const skillMdPath of paths) {
    const result = compileManifestFromSkillMd(files, skillMdPath);
    if (result.ok) {
      discovered.push({
        ok: true,
        value: result.value,
        skillMdPath,
        files: result.files,
      });
    } else {
      errors.push({ path: skillMdPath, reason: result.reason });
    }
  }

  return { discovered, errors };
}
