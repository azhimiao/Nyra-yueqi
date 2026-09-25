/**
 * Backup / export module contract — single source of truth for F0 I4.
 */

import { COHABIT_TIMELINE_KEY } from "./cohabit-timeline.js";
import { SCENARIO_STORE_KEY } from "../scenario/store.js";
import { STORY_STORE_KEY } from "../story/store.js";
import { STORY_STORE_KEY as STORY_SESSIONS_STORE_KEY } from "../story/story-app.js";
import { COCREATE_STORE_KEY } from "../cocreate/store.js";
import { SESSION_STORE_KEY } from "../cocreate/session-store.js";
import { ARTIFACT_STORE_KEY } from "../cocreate/artifact-store.js";
import { GAMES_STORE_KEY } from "../games/store.js";
import { MULTIPLAYER_STORE_KEY } from "../multiplayer/prefs.js";
import { WALLET_KEY } from "../wallet/ledger.js";
import { IDB_STORE as SIDEWRITE_STORE } from "../sidewrite/constants.js";
import { SHOP_ORDERS_KEY } from "../shop/orders.js";
import { SHOP_INVENTORY_KEY } from "../shop/inventory.js";
import { IMAGEGEN_SETTINGS_KEY } from "../imagegen/constants.js";
import { EXTENSIONS_STORE_KEY } from "../phone-ext/registry.js";
import { GATE_PREFS_KEY } from "../gate/gate-prefs.js";
import { REPORTS_STORE_KEY } from "../gate/report-store.js";
import { LIFE_STORE_KEY } from "../life/schema.js";
import { CONVERSATION_STORE_KEY } from "../conversation/schema.js";
import { CONTEXT_GRAPH_KEY } from "../context/schema.js";
import { SESSION_MAP_KEY } from "../context/session-map.js";
import { BRANCH_SUMMARY_KEY } from "../context/branch-summary.js";
import { MOMENTS_STORAGE_KEY } from "../moments/store.js";
import { AGENT_PROFILES_KEY, STORAGE_KEYS } from "../skill-platform/schema.js";
import { MEMORY_CANDIDATES_STORAGE_KEY, CONFIRMED_MEMORY_STORAGE_KEY } from "../skill-platform/memory-candidates.js";
import { AGENT_SELECTION_KEY } from "../agents/selection.js";
import { LIFE_STATE_KEY } from "../companion/life-state.js";
import { APP_EVENTS_STORAGE_KEY } from "../world/app-events.js";
import { YEOS_GAMES_STORE_KEY } from "../yeos/registry-games.js";
import { YEOS_SAVES_STORE_KEY } from "../yeos/saves.js";
import { VISUAL_MEMORY_KEY } from "../visual-memory/schema.js";

/** @typedef {{ id: string, label: string, storage: "idb"|"localStorage"|"prefs", key?: string, required: boolean }} DataModule */

/** Modules that must appear in export / verify. */
export const DATA_MODULES = Object.freeze([
  { id: "profile", label: "人物资料", storage: "prefs", required: true },
  { id: "messages", label: "聊天消息", storage: "idb", key: "messages", required: true },
  { id: "conversations", label: "会话", storage: "idb", key: "conversations", required: true },
  { id: "conversationV2", label: "统一会话图", storage: "localStorage", key: CONVERSATION_STORE_KEY, required: true },
  { id: "contextGraph", label: "上下文图谱", storage: "localStorage", key: CONTEXT_GRAPH_KEY, required: true },
  { id: "contextSessionMap", label: "会话映射", storage: "localStorage", key: SESSION_MAP_KEY, required: true },
  { id: "contextBranchSummaries", label: "分支摘要", storage: "localStorage", key: BRANCH_SUMMARY_KEY, required: true },
  { id: "moments", label: "朋友圈与授权", storage: "localStorage", key: MOMENTS_STORAGE_KEY, required: true },
  { id: "visualMemory", label: "角色视觉记忆", storage: "localStorage", key: VISUAL_MEMORY_KEY, required: true },
  { id: "memories", label: "记忆", storage: "idb", key: "memories", required: true },
  { id: "worldbook", label: "世界书", storage: "idb", key: "worldbook", required: false },
  { id: "media", label: "媒体清单", storage: "idb", key: "media", required: false },
  { id: "characters", label: "角色库", storage: "idb", key: "characters", required: true },
  { id: "scenario", label: "情景剧", storage: "localStorage", key: SCENARIO_STORE_KEY, required: true },
  { id: "story", label: "剧章", storage: "localStorage", key: STORY_STORE_KEY, required: false },
  { id: "storySessions", label: "剧章会话", storage: "localStorage", key: STORY_SESSIONS_STORE_KEY, required: false },
  { id: "cocreate", label: "共创草稿", storage: "localStorage", key: COCREATE_STORE_KEY, required: false },
  { id: "cocreateSession", label: "共创会话", storage: "localStorage", key: SESSION_STORE_KEY, required: false },
  { id: "cocreateArtifact", label: "共创作品", storage: "localStorage", key: ARTIFACT_STORE_KEY, required: false },
  { id: "games", label: "游戏", storage: "localStorage", key: GAMES_STORE_KEY, required: false },
  { id: "multiplayer", label: "联机偏好", storage: "localStorage", key: MULTIPLAYER_STORE_KEY, required: false },
  { id: "cohabitTimeline", label: "同栖时间线", storage: "localStorage", key: COHABIT_TIMELINE_KEY, required: true },
  { id: "life", label: "生命事件账本", storage: "localStorage", key: LIFE_STORE_KEY, required: true },
  { id: "wallet", label: "栖币钱包", storage: "localStorage", key: WALLET_KEY, required: true },
  { id: "shopOrders", label: "栖店订单", storage: "localStorage", key: SHOP_ORDERS_KEY, required: false },
  { id: "shopInventory", label: "虚拟收藏柜", storage: "localStorage", key: SHOP_INVENTORY_KEY, required: false },
  { id: "sidewrite", label: "侧写痕迹", storage: "idb", key: SIDEWRITE_STORE, required: false },
  { id: "presets", label: "回复预设", storage: "localStorage", key: "yueqi.presets.v1", required: false },
  { id: "regex", label: "正则变换", storage: "localStorage", key: "yueqi.regex.v1", required: false },
  { id: "imagegen", label: "绘境配置与任务", storage: "localStorage", key: IMAGEGEN_SETTINGS_KEY, required: false },
  { id: "extensions", label: "栖机扩展", storage: "localStorage", key: EXTENSIONS_STORE_KEY, required: false },
  { id: "gatePrefs", label: "账号与门禁", storage: "localStorage", key: GATE_PREFS_KEY, required: false },
  { id: "reports", label: "举报队列", storage: "localStorage", key: REPORTS_STORE_KEY, required: false },
  { id: "skillPlatform", label: "Skill 平台与 Agent", storage: "localStorage", key: "yueqi.skills.catalog.v1", required: false },
  { id: "companionLife", label: "陪伴生活状态", storage: "localStorage", key: LIFE_STATE_KEY, required: false },
  { id: "appEvents", label: "应用事件缓冲", storage: "localStorage", key: APP_EVENTS_STORAGE_KEY, required: false },
  { id: "yeosGames", label: "YEOS 已装游戏", storage: "localStorage", key: YEOS_GAMES_STORE_KEY, required: false },
  { id: "yeosSaves", label: "YEOS 游戏存档", storage: "localStorage", key: YEOS_SAVES_STORE_KEY, required: false },
  { id: "settings", label: "设置", storage: "prefs", required: true },
]);

export function listDataModuleIds() {
  return DATA_MODULES.map((item) => item.id);
}

export function requiredDataModuleIds() {
  return DATA_MODULES.filter((item) => item.required).map((item) => item.id);
}
