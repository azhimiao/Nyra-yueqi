/**
 * YEOS manifest validators — all package kinds
 */

import { APP_VERSION } from "../constants.js";
import {
  YEOS_SCHEMA_VERSION,
  KIND_PHONE_EXT,
  KIND_GAME,
  KIND_POP_PLUGIN,
  KIND_EXPERIENCE,
  YEOS_KINDS,
  PERMISSION_SET,
  EXPERIENCE_CATEGORIES,
  defaultEntryForKind,
  isValidPackageId,
} from "./kinds.js";

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareSemver(a, b) {
  const pa = String(a || "0.0.0").split(".").map((n) => Number(n) || 0);
  const pb = String(b || "0.0.0").split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * @param {Record<string, unknown>} m
 * @param {string} expectedKind
 */
function validateCommon(m, expectedKind) {
  if (Number(m.schemaVersion) !== YEOS_SCHEMA_VERSION) {
    return { ok: false, code: "bad_schema", message: "清单版本不受支持" };
  }
  if (m.kind !== expectedKind) {
    return { ok: false, code: "invalid_kind", message: "包类型与校验器不匹配" };
  }
  const id = String(m.id || "").trim();
  if (!isValidPackageId(id)) {
    return { ok: false, code: "bad_id", message: "包标识不合法" };
  }
  const name = String(m.name || "").trim();
  if (!name || name.length > 32) {
    return { ok: false, code: "bad_name", message: "名称无效" };
  }
  const version = String(m.version || "").trim();
  if (!SEMVER_RE.test(version)) {
    return { ok: false, code: "bad_version", message: "版本号须为 x.y.z" };
  }
  const permissions = Array.isArray(m.permissions) ? m.permissions.map(String) : [];
  if (!permissions.length || permissions.some((p) => !PERMISSION_SET.has(p))) {
    return { ok: false, code: "bad_permissions", message: "权限未声明或包含未知权限" };
  }
  const entry = String(m.entry || defaultEntryForKind(expectedKind)).trim() || defaultEntryForKind(expectedKind);
  if (entry.includes("..") || entry.startsWith("/") || entry.includes("\\")) {
    return { ok: false, code: "entry_missing", message: "入口文件路径无效" };
  }
  const contentRating = m.contentRating === "mature" ? "mature" : "general";
  const minHostVersion = m.minHostVersion ? String(m.minHostVersion).trim() : "";
  if (minHostVersion && SEMVER_RE.test(minHostVersion) && compareSemver(APP_VERSION, minHostVersion) < 0) {
    return { ok: false, code: "host_too_old", message: "版本过低，请升级栖机后再安装" };
  }
  const description = String(m.description || "").slice(0, 200);
  const author = String(m.author || "").slice(0, 64);
  const icon = m.icon ? String(m.icon).trim() : "";
  if (icon && (icon.includes("..") || icon.startsWith("/"))) {
    return { ok: false, code: "bad_icon", message: "图标路径无效" };
  }
  const tags = Array.isArray(m.tags) ? m.tags.map(String).slice(0, 8) : undefined;

  return {
    ok: true,
    manifest: {
      schemaVersion: YEOS_SCHEMA_VERSION,
      kind: expectedKind,
      id,
      name,
      version,
      author,
      description,
      contentRating,
      entry,
      icon: icon || undefined,
      permissions,
      minHostVersion: minHostVersion || undefined,
      tags,
    },
  };
}

/**
 * @param {unknown} raw
 */
export function validateGameManifest(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "missing_manifest", message: "缺少 manifest" };
  }
  const base = validateCommon(/** @type {Record<string, unknown>} */ (raw), KIND_GAME);
  if (!base.ok) return base;
  const m = /** @type {Record<string, unknown>} */ (raw);
  const category = String(m.category || "game").trim() || "game";
  const game = m.game && typeof m.game === "object" ? m.game : {};
  return {
    ok: true,
    manifest: {
      ...base.manifest,
      category,
      game: {
        viewport: String(/** @type {Record<string, unknown>} */ (game).viewport || "phone"),
        allowExternalControl: Boolean(/** @type {Record<string, unknown>} */ (game).allowExternalControl),
        singleFilePreferred: /** @type {Record<string, unknown>} */ (game).singleFilePreferred !== false,
      },
    },
  };
}

/**
 * @param {unknown} raw
 */
export function validatePluginManifest(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "missing_manifest", message: "缺少 manifest" };
  }
  const base = validateCommon(/** @type {Record<string, unknown>} */ (raw), KIND_POP_PLUGIN);
  if (!base.ok) return base;
  const m = /** @type {Record<string, unknown>} */ (raw);
  const pop = m.pop && typeof m.pop === "object" ? m.pop : null;
  const hosts = pop && Array.isArray(pop.hosts) ? pop.hosts.map(String) : [];
  if (!hosts.length) {
    return { ok: false, code: "bad_pop", message: "插件须声明 pop.hosts" };
  }
  return {
    ok: true,
    manifest: {
      ...base.manifest,
      pop: {
        hosts,
        toolbarLabel: String(pop.toolbarLabel || base.manifest.name).slice(0, 16),
        toolbarIcon: String(pop.toolbarIcon || "puzzle").slice(0, 32),
        panel: pop.panel === "full" ? "full" : "sheet",
        sessionModes: Array.isArray(pop.sessionModes) ? pop.sessionModes.map(String) : ["tool"],
      },
    },
  };
}

/**
 * @param {unknown} raw
 */
export function validateExperienceManifest(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "missing_manifest", message: "缺少 manifest" };
  }
  const base = validateCommon(/** @type {Record<string, unknown>} */ (raw), KIND_EXPERIENCE);
  if (!base.ok) return base;
  const m = /** @type {Record<string, unknown>} */ (raw);
  const category = String(m.category || "").trim();
  if (!EXPERIENCE_CATEGORIES.includes(category)) {
    return { ok: false, code: "bad_category", message: "体验包 category 无效" };
  }
  const experience = m.experience && typeof m.experience === "object" ? m.experience : {};
  return {
    ok: true,
    manifest: {
      ...base.manifest,
      category,
      experience: {
        runtime: String(/** @type {Record<string, unknown>} */ (experience).runtime || `${category}-v1`),
        saveKey: String(/** @type {Record<string, unknown>} */ (experience).saveKey || base.manifest.id),
        customShell: Boolean(/** @type {Record<string, unknown>} */ (experience).customShell),
      },
    },
  };
}

/**
 * Phone-ext validator — same rules as F7, routed through YEOS common fields.
 * @param {unknown} raw
 */
export function validatePhoneExtManifest(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "missing_manifest", message: "安装包无法识别，请检查是否为栖机扩展包" };
  }
  const base = validateCommon(/** @type {Record<string, unknown>} */ (raw), KIND_PHONE_EXT);
  if (!base.ok) {
    if (base.code === "invalid_kind") {
      return { ok: false, code: "invalid_kind", message: "安装包无法识别，请检查是否为栖机扩展包" };
    }
    return base;
  }
  return base;
}

/**
 * @param {unknown} raw
 * @param {string} [kindHint]
 */
export function validateAnyManifest(raw, kindHint) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "missing_manifest", message: "缺少 manifest" };
  }
  const kind = String(kindHint || /** @type {Record<string, unknown>} */ (raw).kind || "").trim();
  if (!YEOS_KINDS.includes(kind)) {
    return { ok: false, code: "invalid_kind", message: "未知包类型" };
  }
  if (kind === KIND_GAME) return validateGameManifest(raw);
  if (kind === KIND_POP_PLUGIN) return validatePluginManifest(raw);
  if (kind === KIND_EXPERIENCE) return validateExperienceManifest(raw);
  return validatePhoneExtManifest(raw);
}
