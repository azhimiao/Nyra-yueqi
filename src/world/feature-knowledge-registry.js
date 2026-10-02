/**
 * Runtime projection of the frozen feature audit. It teaches the character
 * only about features relevant to this turn; it is not a second executor list.
 */

import { FEATURE_AUDIT_ROWS } from "../audit/feature-audit-registry.js";

const QUERY_TERMS = Object.freeze({
  diary: ["日记", "journal", "diary"],
  moments: ["朋友圈", "动态", "moment", "feed"],
  "visual-memory": ["相册", "照片", "图片", "gallery", "album"],
  "co-listen": ["一起听", "共听", "音乐", "listen"],
  "co-read": ["阅读", "一起读", "书", "read"],
  "nyra-calendar": ["日历", "提醒", "日程", "calendar", "reminder"],
  selfie: ["自拍", "selfie"],
  "pet-actions": ["桌宠", "动作", "表情", "avatar"],
  scenario: ["情景剧", "情景", "scenario"],
  scroll: ["漫卷", "scroll"],
  cocreate: ["共创", "cocreate", "co-create"],
  adventure: ["冒险", "adventure"],
  games: ["游戏", "game"],
  assistant: ["助手", "助理", "assistant"],
  "skill-platform": ["探索", "技能", "skill"],
  "task-center": ["任务", "task"],
  "billing-credit": ["积分", "credit", "计费"],
  "nyra-coin": ["栖币", "nyracoin", "coin"],
  voice: ["语音", "朗读", "麦克风", "voice"],
  imagegen: ["生图", "画图", "生成图片", "image"],
  "device.camera": ["相机", "拍照", "camera"],
  "device.location": ["定位", "位置", "location"],
  "device.screen": ["看屏", "屏幕", "screen"],
  "device.notification": ["通知", "notification"],
  "backup-restore": ["备份", "恢复", "backup", "restore"],
  "web.weather": ["天气", "气温", "下雨", "weather", "forecast"],
  "web.search": ["搜索", "查资料", "查找", "搜索资料", "look up", "search"],
});

const APP_FEATURES = Object.freeze({
  diary: "diary",
  moments: "moments",
  listen: "co-listen",
  read: "co-read",
  calendar: "nyra-calendar",
  scenario: "scenario",
  story: "adventure",
  cocreate: "cocreate",
  games: "games",
  qijian: "assistant",
});

function matches(text, terms) {
  const normalized = String(text || "").toLowerCase();
  return terms.some((term) => {
    const needle = String(term || "").toLowerCase().trim();
    if (!needle) return false;
    if (/^[a-z0-9][a-z0-9\s-]*$/i.test(needle)) {
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(normalized);
    }
    return normalized.includes(needle);
  });
}

export function selectFeatureKnowledge({
  query = "",
  appId = "",
  limit = 4,
  userId = "local",
  characterId = "",
  relationshipId = "",
  sessionId = "",
} = {}) {
  const selected = new Set();
  const appFeature = APP_FEATURES[String(appId || "").toLowerCase()];
  if (appFeature) selected.add(appFeature);
  for (const [featureId, terms] of Object.entries(QUERY_TERMS)) {
    if (matches(query, terms)) selected.add(featureId);
    if (selected.size >= limit) break;
  }
  return FEATURE_AUDIT_ROWS
    .filter((row) => selected.has(row.featureId))
    .slice(0, Math.max(1, Number(limit) || 4))
    .map((row) => ({
      featureId: row.featureId,
      scope: {
        userId: String(userId || "local"),
        characterId: String(characterId || ""),
        relationshipId: String(relationshipId || ""),
        sessionId: String(sessionId || ""),
        visibility: "private",
      },
      owner: row.owner,
      status: row.status,
      known: row.known,
      requestable: row.requestable,
      executable: row.executable,
      operationIds: [...row.operationIds],
      permission: row.permission,
      successState: row.successState,
      writeAuthority: row.writeAuthority,
      memoryPolicy: row.memoryPolicy,
      realityNamespace: row.realityNamespace,
    }));
}

export function featureKnowledgeOperationIds(rows = []) {
  return [...new Set(rows.flatMap((row) => row.operationIds || []).map(String).filter(Boolean))];
}

export function formatFeatureKnowledge(rows = [], lang = "zh-CN") {
  if (!Array.isArray(rows) || !rows.length) return "";
  const english = String(lang || "").toLowerCase().startsWith("en");
  const lines = rows.map((row) => [
    `- ${row.featureId}`,
    `owner=${row.owner}`,
    `scope=${row.scope?.userId || "local"}/${row.scope?.characterId || ""}/${row.scope?.sessionId || ""}`,
    `status=${row.status}`,
    `known=${row.known}`,
    `requestable=${row.requestable}`,
    `executable=${row.executable}`,
    `write=${row.writeAuthority}`,
    `memory=${row.memoryPolicy}`,
    `namespace=${row.realityNamespace}`,
  ].join("; "));
  return [
    english ? "[Relevant Nyra feature knowledge]" : "【本轮相关月栖功能知识】",
    ...lines,
    english
      ? "A UI feature, a known feature, a requestable operation and a completed action are different states."
      : "界面存在、角色知道、可以请求、已经成功是不同状态，不得混写。",
  ].join("\n");
}
