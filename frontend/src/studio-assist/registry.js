/** Yueqi enterprise assistant capability catalog. */

import { getLocale } from "../i18n/index.js";
import { localizePackFields, localizeToolLabel } from "./i18n.js";

const PACKS = [
  {
    id: "system",
    label: "系统说明",
    icon: "badge-help",
    description: "解释月栖任意功能、能力边界和当前可用状态。",
    route: "assist",
    tools: [
      ["system.capabilities", "查看能力总览", "read"],
      ["system.explain", "解释功能或工具", "read"],
      ["system.context", "读取当前页面上下文", "read"],
    ],
  },
  {
    id: "navigation",
    label: "导航",
    icon: "route",
    description: "带用户前往 App、小手机应用或设置详情。",
    route: "interface",
    tools: [
      ["navigation.open_settings", "打开设置详情", "action"],
      ["navigation.open_app", "打开小手机应用", "action"],
      ["navigation.open_panel", "打开 App 主页面", "action"],
    ],
  },
  {
    id: "character",
    label: "角色与关系",
    icon: "contact-round",
    description: "查看、创建、切换和编辑角色的人设与关系参数。",
    route: "identity",
    tools: [
      ["character.list", "列出角色", "read"],
      ["character.read", "读取角色", "read"],
      ["character.create", "创建角色", "write"],
      ["character.update", "更新角色设定", "write"],
      ["character.activate", "切换当前角色", "write"],
    ],
  },
  {
    id: "worldbook",
    label: "世界书",
    icon: "book-open",
    description: "管理会按关键词或常驻规则注入的世界设定。",
    route: "worldbook",
    tools: [
      ["worldbook.list", "列出世界书条目", "read"],
      ["worldbook.read", "读取条目", "read"],
      ["worldbook.upsert", "新建或更新条目", "write"],
      ["worldbook.toggle", "启用或停用条目", "write"],
      ["worldbook.delete", "删除条目", "destructive"],
    ],
  },
  {
    id: "presets",
    label: "回复预设",
    icon: "sparkles",
    description: "管理语气、系统前缀和开发者约束。",
    route: "presets",
    tools: [
      ["presets.list", "列出预设", "read"],
      ["presets.activate", "切换预设", "write"],
      ["presets.duplicate", "复制预设", "write"],
      ["presets.update", "更新预设条目", "write"],
      ["presets.delete", "删除自建预设", "destructive"],
    ],
  },
  {
    id: "regex",
    label: "消息过滤",
    icon: "filter",
    description: "用自然语言建立、检查和维护收发消息规则。",
    route: "regex",
    tools: [
      ["regex.list", "列出过滤规则", "read"],
      ["regex.upsert", "新建或更新规则", "write"],
      ["regex.toggle", "启用或停用规则", "write"],
      ["regex.delete", "删除自建规则", "destructive"],
    ],
  },
  {
    id: "calendar",
    label: "日历与约定",
    icon: "calendar-heart",
    description: "查看约定、创建提醒和整理未来安排。",
    route: "external",
    app: "calendar",
    tools: [
      ["calendar.list", "查看近期约定", "read"],
      ["calendar.create", "创建约定", "write"],
      ["calendar.delete", "删除约定", "destructive"],
    ],
  },
  {
    id: "memory",
    label: "长期记忆",
    icon: "brain",
    description: "检索、修正和删除长期记忆，写操作均需确认。",
    route: "memory",
    app: "memory",
    tools: [
      ["memory.search", "搜索记忆", "read"],
      ["memory.update", "修正记忆", "write"],
      ["memory.delete", "删除记忆", "destructive"],
    ],
  },
  {
    id: "library",
    label: "一起听与一起看",
    icon: "library",
    description: "查看书籍、音乐与共读进度，并更新阅读锚点。",
    app: "read",
    tools: [
      ["library.status", "查看资料库状态", "read"],
      ["library.update_book", "更新阅读进度", "write"],
    ],
  },
  {
    id: "gallery",
    label: "相册",
    icon: "images",
    description: "查看和整理相册分组；不会擅自读取或上传媒体。",
    app: "gallery",
    tools: [
      ["gallery.list_groups", "列出相册分组", "read"],
      ["gallery.create_group", "创建分组", "write"],
      ["gallery.rename_group", "重命名分组", "write"],
      ["gallery.delete_group", "删除分组", "destructive"],
    ],
  },
  {
    id: "proactive",
    label: "主动陪伴",
    icon: "heart-pulse",
    description: "查看和调整主动联系概率、静默窗口与检查频率。",
    route: "behavior",
    tools: [
      ["proactive.read", "查看主动陪伴配置", "read"],
      ["proactive.update", "更新主动陪伴配置", "write"],
    ],
  },
  {
    id: "appearance",
    label: "界面与外观",
    icon: "palette",
    description: "切换经产品验证的主题；不允许模型注入任意 CSS。",
    route: "theme",
    app: "beautify",
    tools: [
      ["appearance.themes", "列出主题", "read"],
      ["appearance.apply_theme", "应用主题", "write"],
      ["appearance.interface", "查看界面模式", "read"],
      ["appearance.switch_mode", "切换 App/小手机模式", "write"],
    ],
  },
  {
    id: "voice",
    label: "语音",
    icon: "audio-lines",
    description: "检查语音能力并调整非敏感选项；密钥始终留在安全存储。",
    route: "external",
    tools: [
      ["voice.status", "检查语音状态", "read"],
      ["voice.update", "更新语音偏好", "write"],
    ],
  },
  {
    id: "scenario",
    label: "栖境",
    icon: "book-open-text",
    description: "查看可用情景与未完旅程，并带用户进入连续故事。",
    app: "scenario",
    tools: [
      ["scenario.list", "列出情景与进度", "read"],
      ["scenario.open", "打开栖境", "action"],
    ],
  },
  {
    id: "moments",
    label: "朋友圈",
    icon: "camera",
    description: "查看动态概况并带用户进入朋友圈；发帖仍由用户最终确认。",
    app: "moments",
    tools: [
      ["moments.list", "查看最近动态", "read"],
      ["moments.open", "打开朋友圈", "action"],
    ],
  },
  {
    id: "tasks",
    label: "任务中心",
    icon: "list-checks",
    description: "查看 Agent 任务状态、审批等待和最近产物。",
    tools: [
      ["tasks.list", "列出任务", "read"],
    ],
  },
  {
    id: "privacy",
    label: "隐私与审计",
    icon: "shield-check",
    description: "检查模型连接、查看助手操作记录和撤销最近一次可逆写入。",
    route: "cloud",
    tools: [
      ["privacy.provider_status", "查看模型配置状态", "read"],
      ["privacy.audit", "查看操作审计", "read"],
      ["privacy.undo", "撤销最近写入", "write"],
    ],
  },
];

function normalizeTool(pack, row) {
  const [id, label, risk] = row;
  return Object.freeze({
    id,
    label,
    risk,
    packId: pack.id,
    packLabel: pack.label,
    requiresConfirmation: risk === "write" || risk === "destructive",
  });
}

export const ASSIST_CAPABILITY_PACKS = Object.freeze(PACKS.map((pack) => Object.freeze({
  ...pack,
  tools: Object.freeze(pack.tools.map((row) => normalizeTool(pack, row))),
})));

export const ASSIST_TOOL_MAP = Object.freeze(Object.fromEntries(
  ASSIST_CAPABILITY_PACKS.flatMap((pack) => pack.tools.map((tool) => [tool.id, tool])),
));

function localizePack(pack, locale = getLocale()) {
  const localized = localizePackFields(pack, locale);
  return {
    ...pack,
    ...localized,
    tools: pack.tools.map((tool) => ({
      ...tool,
      label: localizeToolLabel(tool.id, tool.label, locale),
      packLabel: localized.label,
    })),
  };
}

export function listCapabilityPacks(locale = getLocale()) {
  return ASSIST_CAPABILITY_PACKS.map((pack) => ({
    ...localizePack(pack, locale),
  }));
}

export function getCapabilityPack(idOrLabel, locale = getLocale()) {
  const key = String(idOrLabel || "").trim().toLowerCase();
  const pack = ASSIST_CAPABILITY_PACKS.find((item) => {
    const localized = localizePackFields(item, locale);
    return item.id.toLowerCase() === key
      || item.label.toLowerCase() === key
      || localized.label.toLowerCase() === key;
  });
  return pack ? localizePack(pack, locale) : null;
}

export function getAssistTool(id, locale = getLocale()) {
  const tool = ASSIST_TOOL_MAP[String(id || "").trim()] || null;
  if (!tool) return null;
  const pack = ASSIST_CAPABILITY_PACKS.find((item) => item.id === tool.packId);
  const packFields = pack ? localizePackFields(pack, locale) : { label: tool.packLabel };
  return {
    ...tool,
    label: localizeToolLabel(tool.id, tool.label, locale),
    packLabel: packFields.label,
  };
}

export function capabilitySummary() {
  const tools = ASSIST_CAPABILITY_PACKS.flatMap((pack) => pack.tools);
  return {
    packs: ASSIST_CAPABILITY_PACKS.length,
    tools: tools.length,
    reads: tools.filter((tool) => tool.risk === "read").length,
    writes: tools.filter((tool) => tool.risk === "write").length,
    destructive: tools.filter((tool) => tool.risk === "destructive").length,
    actions: tools.filter((tool) => tool.risk === "action").length,
  };
}

export function buildCompactCapabilityCatalog(locale = getLocale()) {
  return listCapabilityPacks(locale).map((pack) => (
    `${pack.label}(${pack.id}): ${pack.tools.map((tool) => `${tool.id}[${tool.risk}]`).join(", ")}`
  )).join("\n");
}
