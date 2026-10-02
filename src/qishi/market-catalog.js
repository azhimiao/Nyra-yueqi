/**
 * 栖市应用市场目录 — 内置应用货架元数据（非 zip 包）。
 */

import { getLocale, t } from "../i18n/index.js";

/** Keep in sync with ARCHIVED_EXPERIENCE_APPS in src/phone-shell/app-registry.js */
const ARCHIVED_MARKET_IDS = new Set(["scroll", "adventure", "cocreate"]);

function isArchivedMarketId(id) {
  return ARCHIVED_MARKET_IDS.has(String(id || "").trim());
}

/** @typedef {{
 *   id: string,
 *   name: string,
 *   developer: string,
 *   summary: string,
 *   description: string,
 *   categoryId: "experience"|"creation"|"games"|"tools",
 *   icon: string,
 *   tone: string,
 *   rating: number,
 *   ratingCount: number,
 *   downloads: string,
 *   downloadsKind?: "count"|"sideload"|"builtin"|"archived",
 *   sizeLabel: string,
 *   sizeKind?: "builtin"|"zip"|"raw",
 *   version: string,
 *   featured?: boolean,
 *   featuredTag?: string,
 *   action: "open-app"|"open-games"|"sideload-hint",
 *   ageKind: "all"|"mature",
 *   showSocialProof?: boolean,
 * }} MarketApp */

/** @type {MarketApp[]} */
export const MARKET_APPS = Object.freeze([
  {
    id: "scroll",
    name: "漫卷",
    developer: "月栖工作室",
    summary: "选角色演 Gal，点屏推进故事",
    description: "该体验已冻结，暂不可用。原先是竖屏 Gal：选角色、点屏读台词、选项分支。内容会另行归档，不会删除。",
    categoryId: "experience",
    icon: "book-image",
    tone: "sea",
    rating: 0,
    ratingCount: 0,
    downloads: "已下架",
    downloadsKind: "archived",
    sizeLabel: "内置",
    sizeKind: "builtin",
    version: "1.2",
    action: "open-app",
    ageKind: "all",
  },
  {
    id: "adventure",
    name: "冒险",
    developer: "月栖工作室",
    summary: "地图探索，AI 当地主",
    description: "该体验已冻结，暂不可用。原先是开放地图冒险，AI 担任 DM。内容会另行归档，不会删除。",
    categoryId: "experience",
    icon: "map",
    tone: "sea",
    rating: 0,
    ratingCount: 0,
    downloads: "已下架",
    downloadsKind: "archived",
    sizeLabel: "内置",
    sizeKind: "builtin",
    version: "1.1",
    action: "open-app",
    ageKind: "all",
  },
  {
    id: "scenario",
    name: "情景剧",
    developer: "月栖工作室",
    summary: "合写长文故事",
    description: "该体验已冻结，暂不可用。原先是情景驱动的长文共写。内容会另行归档，不会删除。",
    categoryId: "experience",
    icon: "clapperboard",
    tone: "amber",
    rating: 0,
    ratingCount: 0,
    downloads: "已下架",
    downloadsKind: "archived",
    sizeLabel: "内置",
    sizeKind: "builtin",
    version: "2.0",
    action: "open-app",
    ageKind: "all",
  },
  {
    id: "cocreate",
    name: "共创",
    developer: "月栖工作室",
    summary: "合写长篇",
    description: "该体验已冻结，暂不可用。原先是协作写作工作台。内容会另行归档，不会删除。",
    categoryId: "creation",
    icon: "pen-line",
    tone: "moss",
    rating: 0,
    ratingCount: 0,
    downloads: "已下架",
    downloadsKind: "archived",
    sizeLabel: "内置",
    sizeKind: "builtin",
    version: "1.4",
    action: "open-app",
    ageKind: "all",
  },
  {
    id: "theater",
    name: "舞台",
    developer: "月栖工作室",
    summary: "情景剧舞台与剧本库",
    description: "该体验已冻结，暂不可用。原先是剧本库与舞台演出入口。内容会另行归档，不会删除。",
    categoryId: "creation",
    icon: "sparkles",
    tone: "amber",
    rating: 0,
    ratingCount: 0,
    downloads: "已下架",
    downloadsKind: "archived",
    sizeLabel: "内置",
    sizeKind: "builtin",
    version: "1.0",
    action: "open-app",
    ageKind: "all",
  },
  {
    id: "games",
    name: "游戏大厅",
    developer: "月栖工作室",
    summary: "已装游戏与小品合集",
    description: "打开游戏大厅，查看已安装的小品与侧载游戏。也可从这里继续逛栖市游戏分区。",
    categoryId: "games",
    icon: "gamepad-2",
    tone: "ember",
    rating: 0,
    ratingCount: 0,
    downloads: "内置",
    downloadsKind: "builtin",
    sizeLabel: "内置",
    sizeKind: "builtin",
    version: "1.0",
    featured: true,
    featuredTag: "内置",
    action: "open-games",
    ageKind: "all",
  },
  {
    id: "sample-sideload",
    name: "侧载扩展样例",
    developer: "社区",
    summary: "用本机 zip 安装同款扩展",
    description: "示范条目：点击后提示侧载流程。真实扩展请用右上角「侧载」选择 .zip / .yueqi-ext.zip。",
    categoryId: "tools",
    icon: "puzzle",
    tone: "mint",
    rating: 0,
    ratingCount: 0,
    downloads: "侧载",
    downloadsKind: "sideload",
    sizeLabel: "zip",
    sizeKind: "zip",
    version: "—",
    action: "sideload-hint",
    ageKind: "all",
  },
]);

export const MARKET_CATEGORY_IDS = Object.freeze(["all", "experience", "creation", "games", "tools"]);

/** @deprecated use MARKET_CATEGORY_IDS */
export const MARKET_CATEGORIES = MARKET_CATEGORY_IDS;

function packLocale(locale) {
  const raw = String(locale || getLocale() || "zh-CN");
  if (raw === "en" || raw.startsWith("en")) return "en";
  return "zh-CN";
}

function qishiT(key, locale, fallback = "") {
  const full = `phone.qishi.${key}`;
  const v = t(full, packLocale(locale));
  return v === full ? fallback : v;
}

function shelfRank(app) {
  if (isArchivedMarketId(app.id)) return 2;
  if (app.action === "sideload-hint") return 1;
  return 0;
}

/**
 * Localize built-in catalog chrome; third-party / dynamic entries pass through.
 * @param {MarketApp} app
 * @param {string} [locale]
 */
export function localizeMarketApp(app, locale) {
  if (!app) return app;
  const loc = packLocale(locale);
  const catId = app.categoryId || "experience";
  const catalogName = app.id ? qishiT(`catalog.${app.id}.name`, loc, "") : "";
  const appName = app.id ? t(`phone.apps.${app.id}`, loc) : "";
  const resolvedAppName = appName && appName !== `phone.apps.${app.id}` ? appName : "";
  const name = catalogName || resolvedAppName || app.name;
  const archived = isArchivedMarketId(app.id);
  let downloads = app.downloads;
  if (archived || app.downloadsKind === "archived") {
    downloads = qishiT("downloadsArchived", loc, app.downloads || "已下架");
  } else if (app.downloadsKind === "sideload") {
    downloads = qishiT("downloadsSideload", loc, app.downloads);
  } else if (app.downloadsKind === "builtin") {
    downloads = qishiT("sizeBuiltin", loc, app.downloads);
  }
  let sizeLabel = app.sizeLabel;
  if (app.sizeKind === "builtin") sizeLabel = qishiT("sizeBuiltin", loc, app.sizeLabel);
  else if (app.sizeKind === "zip") sizeLabel = qishiT("sizeZip", loc, app.sizeLabel);
  let developer = app.developer;
  if (app.developer === "月栖工作室") developer = qishiT("developerStudio", loc, app.developer);
  else if (app.developer === "社区") developer = qishiT("developerCommunity", loc, app.developer);
  return {
    ...app,
    archived,
    showSocialProof: Boolean(app.showSocialProof) && !archived,
    featured: Boolean(app.featured) && !archived,
    name,
    summary: qishiT(`catalog.${app.id}.summary`, loc, app.summary),
    description: qishiT(`catalog.${app.id}.description`, loc, app.description),
    featuredTag: app.featuredTag
      ? qishiT(`catalog.${app.id}.featuredTag`, loc, app.featuredTag)
      : app.featuredTag,
    developer,
    category: qishiT(`categories.${catId}`, loc, catId),
    age: app.ageKind === "mature" ? qishiT("agesConfirm", loc, "需确认") : qishiT("agesAll", loc, "全龄"),
    downloads,
    sizeLabel,
  };
}

/**
 * @param {{ category?: string, query?: string, locale?: string }} [opts]
 * @returns {ReturnType<typeof localizeMarketApp>[]}
 */
export function listMarketApps({ category = "", query = "", locale } = {}) {
  const cat = String(category || "").trim();
  const q = String(query || "").trim().toLowerCase();
  let rows = MARKET_APPS.slice();
  if (cat && cat !== "all") {
    rows = rows.filter((app) => app.categoryId === cat);
  }
  if (q) {
    rows = rows.filter((app) => {
      const localized = localizeMarketApp(app, locale);
      const hay = `${localized.name} ${localized.summary} ${localized.description} ${localized.developer} ${localized.category} ${app.name} ${app.summary}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return rows
    .slice()
    .sort((a, b) => shelfRank(a) - shelfRank(b))
    .map((app) => localizeMarketApp(app, locale));
}

/** @returns {ReturnType<typeof localizeMarketApp>[]} */
export function listFeaturedApps(locale) {
  return MARKET_APPS
    .filter((app) => app.featured && !isArchivedMarketId(app.id))
    .map((app) => localizeMarketApp(app, locale));
}

/** @returns {ReturnType<typeof localizeMarketApp>[]} */
export function listChartApps(locale) {
  return MARKET_APPS.slice()
    .filter((app) => !isArchivedMarketId(app.id) && (app.action === "open-app" || app.action === "open-games"))
    .sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount)
    .map((app) => localizeMarketApp(app, locale));
}

/** @param {string} id */
export function getMarketApp(id, locale) {
  const app = MARKET_APPS.find((item) => item.id === String(id || "").trim()) || null;
  return app ? localizeMarketApp(app, locale) : null;
}

export function ratingLabel(rating) {
  return Number(rating || 0).toFixed(1);
}
