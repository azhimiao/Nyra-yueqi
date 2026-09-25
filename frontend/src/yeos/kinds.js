/**
 * YEOS package kinds + permission ids (YUEQI_EXPERIENCE_OS.md)
 * Display labels via yeos.* / permission label keys — IDs stay English.
 */

import { t } from "../i18n/index.js";

export const YEOS_SCHEMA_VERSION = 1;

export const KIND_PHONE_EXT = "yueqi-phone-ext";
export const KIND_GAME = "yueqi-game";
export const KIND_POP_PLUGIN = "yueqi-pop-plugin";
export const KIND_EXPERIENCE = "yueqi-experience";

/** @type {ReadonlyArray<string>} */
export const YEOS_KINDS = Object.freeze([
  KIND_PHONE_EXT,
  KIND_GAME,
  KIND_POP_PLUGIN,
  KIND_EXPERIENCE,
]);

/** @typedef {typeof PERMISSION_DEFS[number]["id"]} PermissionId */

/** @type {ReadonlyArray<{ id: string, labelKey: string, descriptionKey: string, labelZh: string, description: string }>} */
export const PERMISSION_DEFS = Object.freeze([
  { id: "calendar.read", labelKey: "yeos.perm.calendarRead", descriptionKey: "yeos.perm.calendarReadDesc", labelZh: "读取日历", description: "查看栖机日历中的日程" },
  { id: "calendar.write", labelKey: "yeos.perm.calendarWrite", descriptionKey: "yeos.perm.calendarWriteDesc", labelZh: "写入日历", description: "添加或修改日程" },
  { id: "chat.read", labelKey: "yeos.perm.chatRead", descriptionKey: "yeos.perm.chatReadDesc", labelZh: "读取聊天摘要", description: "读取最近聊天摘要（脱敏）" },
  { id: "chat.send", labelKey: "yeos.perm.chatSend", descriptionKey: "yeos.perm.chatSendDesc", labelZh: "发送文本消息", description: "向 Pop 发送文本消息" },
  { id: "chat.send_token", labelKey: "yeos.perm.chatSendToken", descriptionKey: "yeos.perm.chatSendTokenDesc", labelZh: "发送信物消息", description: "向 Pop 发送信物卡片" },
  { id: "storage.read", labelKey: "yeos.perm.storageRead", descriptionKey: "yeos.perm.storageReadDesc", labelZh: "读扩展存储", description: "读取本扩展私有数据" },
  { id: "storage.write", labelKey: "yeos.perm.storageWrite", descriptionKey: "yeos.perm.storageWriteDesc", labelZh: "写扩展存储", description: "写入本扩展私有数据" },
  { id: "notification.show", labelKey: "yeos.perm.notificationShow", descriptionKey: "yeos.perm.notificationShowDesc", labelZh: "显示通知", description: "显示本地通知（尊重免打扰）" },
  { id: "timeline.write", labelKey: "yeos.perm.timelineWrite", descriptionKey: "yeos.perm.timelineWriteDesc", labelZh: "写入同栖时间线", description: "写入同栖时间线事件" },
  { id: "profile.read", labelKey: "yeos.perm.profileRead", descriptionKey: "yeos.perm.profileReadDesc", labelZh: "读取角色摘要", description: "读取当前角色 id / 显示名 / 头像" },
  { id: "character.list", labelKey: "yeos.perm.characterList", descriptionKey: "yeos.perm.characterListDesc", labelZh: "列出可选角色", description: "仅 id / 名 / 头像 / 一句副标题" },
  { id: "character.package.light", labelKey: "yeos.perm.characterLight", descriptionKey: "yeos.perm.characterLightDesc", labelZh: "角色轻量包", description: "卡 + 世界书 + 核心记忆摘要，无 API Key" },
  { id: "character.package.full", labelKey: "yeos.perm.characterFull", descriptionKey: "yeos.perm.characterFullDesc", labelZh: "角色全量包", description: "含更多近期上下文" },
  { id: "llm.character", labelKey: "yeos.perm.llmCharacter", descriptionKey: "yeos.perm.llmCharacterDesc", labelZh: "代调角色模型", description: "宿主代调；开发者无密钥" },
  { id: "llm.global", labelKey: "yeos.perm.llmGlobal", descriptionKey: "yeos.perm.llmGlobalDesc", labelZh: "代调全局模型", description: "裁判 / 旁白 / NPC；不绑角色卡" },
  { id: "game.save", labelKey: "yeos.perm.gameSave", descriptionKey: "yeos.perm.gameSaveDesc", labelZh: "读写本游戏存档", description: "按 pkgId + user 隔离" },
  { id: "game.event", labelKey: "yeos.perm.gameEvent", descriptionKey: "yeos.perm.gameEventDesc", labelZh: "写入游戏结束事件", description: "局终写入同栖时间线" },
  { id: "pop.plugin", labelKey: "yeos.perm.popPlugin", descriptionKey: "yeos.perm.popPluginDesc", labelZh: "Pop 插件 UI", description: "在 Pop 挂载插件工具条 / 半屏" },
  { id: "pop.session", labelKey: "yeos.perm.popSession", descriptionKey: "yeos.perm.popSessionDesc", labelZh: "读当前会话元数据", description: "单聊 / 群聊类型与会话 id" },
  { id: "pop.inject", labelKey: "yeos.perm.popInject", descriptionKey: "yeos.perm.popInjectDesc", labelZh: "向会话注入局内消息", description: "系统旁白或局内身份" },
  { id: "xp.mode", labelKey: "yeos.perm.xpMode", descriptionKey: "yeos.perm.xpModeDesc", labelZh: "注册体验模式", description: "漫卷 / 冒险 / 共创写入口" },
]);

export const PERMISSION_IDS = Object.freeze(PERMISSION_DEFS.map((item) => item.id));
export const PERMISSION_SET = new Set(PERMISSION_IDS);

export const EXPERIENCE_CATEGORIES = Object.freeze(["theater", "scroll", "adventure", "cocreate"]);

const ID_RE = /^[a-z][a-z0-9-]{2,48}$/;

/**
 * @param {string} permissionId
 */
export function permissionLabel(permissionId) {
  const hit = PERMISSION_DEFS.find((item) => item.id === permissionId);
  if (!hit) return t("yeos.unknownPermission");
  const localized = t(hit.labelKey);
  if (localized && localized !== hit.labelKey) return localized;
  return hit.labelZh || String(permissionId || "");
}

/** @deprecated use permissionLabel */
export function permissionLabelZh(permissionId) {
  return permissionLabel(permissionId);
}

/**
 * @param {string} permissionId
 */
export function permissionDeniedMessage(permissionId) {
  return t("yeos.permissionDenied", { name: permissionLabel(permissionId) });
}

/**
 * @param {string[]} granted
 * @param {string} permissionId
 */
export function checkPermission(granted, permissionId) {
  const list = Array.isArray(granted) ? granted : [];
  return list.includes(permissionId);
}

export class PermissionDeniedError extends Error {
  /**
   * @param {string} permissionId
   * @param {string} [message]
   */
  constructor(permissionId, message) {
    super(message || permissionDeniedMessage(permissionId));
    this.name = "PermissionDeniedError";
    this.permissionId = permissionId;
    this.code = "PERMISSION_DENIED";
  }
}

export function isValidPackageId(id) {
  return ID_RE.test(String(id || "").trim());
}

/**
 * @param {string} id
 * @returns {{ gameId: string } | null}
 */
export function parseGameDesktopId(id) {
  const raw = String(id || "").trim();
  const match = raw.match(/^game:([a-z][a-z0-9-]{2,48})$/);
  if (!match) return null;
  return { gameId: match[1] };
}

/**
 * @param {string} gameId
 */
export function toGameDesktopId(gameId) {
  return `game:${String(gameId || "").trim()}`;
}

export function isGameDesktopId(id) {
  return Boolean(parseGameDesktopId(id));
}

/**
 * @param {string} kind
 */
export function kindLabel(kind) {
  if (kind === KIND_GAME) return t("yeos.games");
  if (kind === KIND_PHONE_EXT) return t("yeos.phoneExt");
  if (kind === KIND_POP_PLUGIN) return t("yeos.popPlugin");
  if (kind === KIND_EXPERIENCE) return t("yeos.experience");
  return t("yeos.package");
}

/** @deprecated use kindLabel */
export function kindLabelZh(kind) {
  return kindLabel(kind);
}

/**
 * @param {string} kind
 */
export function defaultEntryForKind(kind) {
  if (kind === KIND_GAME) return "game.html";
  if (kind === KIND_POP_PLUGIN) return "plugin.js";
  if (kind === KIND_PHONE_EXT) return "index.html";
  return "index.html";
}
