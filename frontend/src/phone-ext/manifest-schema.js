/**
 * 栖机扩展 manifest / 权限协议（F7 H2）
 */

import { APP_VERSION } from "../constants.js";

export const EXT_MANIFEST_KIND = "yueqi-phone-ext";
export const EXT_SCHEMA_VERSION = 1;

/** @typedef {"calendar.read"|"calendar.write"|"chat.read"|"chat.send"|"chat.send_token"|"storage.read"|"storage.write"|"notification.show"|"timeline.write"|"profile.read"} PermissionId */

/** @type {ReadonlyArray<{ id: PermissionId, labelZh: string, description: string }>} */
export const PERMISSION_DEFS = Object.freeze([
  { id: "calendar.read", labelZh: "读取日历", description: "查看栖机日历中的日程" },
  { id: "calendar.write", labelZh: "写入日历", description: "添加或修改日程" },
  { id: "chat.read", labelZh: "读取聊天摘要", description: "读取最近聊天摘要（脱敏）" },
  { id: "chat.send", labelZh: "发送文本消息", description: "向 Pop 发送文本消息" },
  { id: "chat.send_token", labelZh: "发送信物消息", description: "向 Pop 发送信物卡片" },
  { id: "storage.read", labelZh: "读扩展存储", description: "读取本扩展私有数据" },
  { id: "storage.write", labelZh: "写扩展存储", description: "写入本扩展私有数据" },
  { id: "notification.show", labelZh: "显示通知", description: "显示本地通知（尊重免打扰）" },
  { id: "timeline.write", labelZh: "写入同栖时间线", description: "写入同栖时间线事件" },
  { id: "profile.read", labelZh: "读取角色摘要", description: "读取当前角色 id / 显示名 / 头像" },
]);

export const PERMISSION_IDS = Object.freeze(PERMISSION_DEFS.map((item) => item.id));

const PERMISSION_SET = new Set(PERMISSION_IDS);
const ID_RE = /^[a-z][a-z0-9-]{2,48}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export class PermissionDeniedError extends Error {
  /**
   * @param {PermissionId|string} permissionId
   * @param {string} [message]
   */
  constructor(permissionId, message) {
    const label = permissionLabelZh(permissionId);
    super(message || `需要「${label}」权限才能继续`);
    this.name = "PermissionDeniedError";
    this.permissionId = permissionId;
  }
}

/**
 * @param {string} permissionId
 */
export function permissionLabelZh(permissionId) {
  const hit = PERMISSION_DEFS.find((item) => item.id === permissionId);
  return hit?.labelZh || String(permissionId || "未知权限");
}

/**
 * @param {string} permissionId
 */
export function permissionDeniedMessage(permissionId) {
  return `需要「${permissionLabelZh(permissionId)}」权限`;
}

/**
 * @param {string[]} granted
 * @param {string} permissionId
 */
export function checkPermission(granted, permissionId) {
  const list = Array.isArray(granted) ? granted : [];
  return list.includes(permissionId);
}

/**
 * @param {string} id
 * @returns {{ extId: string } | null}
 */
export function parseExtDesktopId(id) {
  const raw = String(id || "").trim();
  const match = raw.match(/^ext:([a-z][a-z0-9-]{2,48})$/);
  if (!match) return null;
  return { extId: match[1] };
}

/**
 * @param {string} extId
 */
export function toExtDesktopId(extId) {
  return `ext:${String(extId || "").trim()}`;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} negative if a < b
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
 * @param {unknown} raw
 * @returns {{ ok: true, manifest: object } | { ok: false, code: string, message: string }}
 */
export function validateManifest(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "missing_manifest", message: "安装包无法识别，请检查是否为栖机扩展包" };
  }
  const m = /** @type {Record<string, unknown>} */ (raw);
  if (m.kind !== EXT_MANIFEST_KIND) {
    return { ok: false, code: "invalid_kind", message: "安装包无法识别，请检查是否为栖机扩展包" };
  }
  if (Number(m.schemaVersion) !== EXT_SCHEMA_VERSION) {
    return { ok: false, code: "missing_manifest", message: "扩展清单版本不受支持" };
  }
  const id = String(m.id || "").trim();
  if (!ID_RE.test(id)) {
    return { ok: false, code: "bad_id", message: "扩展标识不合法" };
  }
  const name = String(m.name || "").trim();
  if (!name || name.length > 32) {
    return { ok: false, code: "missing_manifest", message: "扩展名称无效" };
  }
  const version = String(m.version || "").trim();
  if (!SEMVER_RE.test(version)) {
    return { ok: false, code: "missing_manifest", message: "版本号须为 x.y.z" };
  }
  const permissions = Array.isArray(m.permissions) ? m.permissions.map(String) : [];
  if (!permissions.length || permissions.some((p) => !PERMISSION_SET.has(p))) {
    return { ok: false, code: "bad_permissions", message: "权限未声明或包含未知权限" };
  }
  const entry = String(m.entry || "index.html").trim() || "index.html";
  if (entry.includes("..") || entry.startsWith("/") || entry.includes("\\")) {
    return { ok: false, code: "entry_missing", message: "入口文件路径无效" };
  }
  const contentRating = m.contentRating === "mature" ? "mature" : "general";
  const minHostVersion = m.minHostVersion ? String(m.minHostVersion).trim() : "";
  if (minHostVersion && SEMVER_RE.test(minHostVersion) && compareSemver(APP_VERSION, minHostVersion) < 0) {
    return { ok: false, code: "missing_manifest", message: "版本过低，请升级栖机后再安装" };
  }
  const description = String(m.description || "").slice(0, 200);
  const author = String(m.author || "").slice(0, 64);
  const icon = m.icon ? String(m.icon).trim() : "";
  if (icon && (icon.includes("..") || icon.startsWith("/"))) {
    return { ok: false, code: "missing_manifest", message: "图标路径无效" };
  }

  return {
    ok: true,
    manifest: {
      schemaVersion: EXT_SCHEMA_VERSION,
      kind: EXT_MANIFEST_KIND,
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
    },
  };
}
