/**
 * Scene tags (场景标签) — filter / label prompt blocks by app surface.
 * F0: I5
 */

/** @typedef {"pop"|"diary"|"scenario"|"sidewrite"|"shop"|"listen"|"read"|"calendar"|"system"|"cohabit"|"story"|"cocreate"|"games"|"qijian"|"studio"} SceneAppId */

export const SCENE_APP_IDS = Object.freeze([
  "pop",
  "diary",
  "scenario",
  "sidewrite",
  "shop",
  "listen",
  "read",
  "calendar",
  "system",
  "cohabit",
  "story",
  "cocreate",
  "games",
  "qijian",
  "studio",
]);

/** Sections that may be suppressed per app (extensible). Empty = keep all. */
export const SCENE_SECTION_POLICY = Object.freeze({
  pop: null,
  diary: ["external"],
  scenario: ["external"],
  sidewrite: null,
  shop: ["memory"],
  listen: ["worldbook"],
  read: ["worldbook"],
  calendar: ["worldbook", "external"],
  system: null,
  cohabit: null,
  story: ["external"],
  cocreate: ["external"],
  games: ["memory", "worldbook", "external"],
  /** 栖笺：仅角色卡 + 可选世界书种子；抑制 memory / external / cohabit */
  qijian: ["memory", "external", "cohabit"],
  studio: ["memory", "external"],
});

const PHONE_EXT_APP_RE = /^phone-ext:[a-z][a-z0-9-]{2,48}$/;

/**
 * @param {string} [appId]
 * @returns {SceneAppId | string}
 */
export function normalizeSceneAppId(appId) {
  const id = String(appId || "pop").trim();
  // F7: 扩展 LLM / 时间线必须保留 phone-ext:<id>，禁止归一成 pop（E4）
  if (PHONE_EXT_APP_RE.test(id)) return id;
  return SCENE_APP_IDS.includes(id) ? /** @type {SceneAppId} */ (id) : "pop";
}

/**
 * @param {string[]} order
 * @param {string} [appId]
 */
export function filterInjectionOrder(order, appId) {
  const id = normalizeSceneAppId(appId);
  if (String(id).startsWith("phone-ext:")) {
    // 扩展场景：不注入 Pop 默认日常块，避免串戏
    const ban = new Set(["memory", "external", "cohabit"]);
    return (order || []).filter((section) => !ban.has(section));
  }
  const suppress = SCENE_SECTION_POLICY[id];
  if (!suppress?.length) return [...(order || [])];
  const ban = new Set(suppress);
  return (order || []).filter((section) => !ban.has(section));
}

/**
 * @param {string} [appId]
 */
export function sceneAppLabel(appId) {
  const raw = String(appId || "").trim();
  if (PHONE_EXT_APP_RE.test(raw)) {
    return `栖机扩展 · ${raw.slice("phone-ext:".length)}`;
  }
  const map = {
    pop: "Pop 聊天",
    diary: "日记",
    scenario: "情景剧",
    sidewrite: "侧写",
    shop: "栖店",
    listen: "一起听",
    read: "一起看",
    calendar: "日历",
    system: "系统",
    cohabit: "同栖时间线",
    story: "剧章",
    cocreate: "共创",
    games: "游戏",
    qijian: "栖笺",
    studio: "绘境",
  };
  return map[normalizeSceneAppId(appId)] || appId;
}

/**
 * Whether cohabit timeline block should be appended for this app.
 * @param {string} [appId]
 */
export function shouldInjectCohabit(appId) {
  const id = normalizeSceneAppId(appId);
  if (String(id).startsWith("phone-ext:")) return false;
  const suppress = SCENE_SECTION_POLICY[id];
  if (!suppress?.length) return true;
  return !suppress.includes("cohabit");
}
