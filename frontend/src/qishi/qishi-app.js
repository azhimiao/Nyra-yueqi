/**
 * 栖市 UI — 应用市场风格（精选 / 排行 / 已装）+ 侧载 / 详情 / 举报
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { pt, getLocale, applyPhoneI18n } from "../phone-shell/i18n.js";
import {
  listInstalledExtensions,
  getInstalledExtension,
  uninstallExtension,
  revokeExtensionPermission,
} from "../phone-ext/registry.js";
import {
  listInstalledGames,
  getInstalledGame,
  uninstallGame,
  revokeGamePermission,
} from "../yeos/registry-games.js";
import { previewPackage, installUnpacked } from "../yeos/installer.js";
import { KIND_GAME, KIND_PHONE_EXT, kindLabelZh, permissionLabelZh } from "../yeos/kinds.js";
import { loadGatePrefs, canInstallMatureContent, requiresGateLogin } from "../gate/gate-prefs.js";
import { submitReport } from "../gate/report-store.js";
import { fetchCloudCatalog } from "./cloud-catalog.js";
import {
  listMarketApps,
  listFeaturedApps,
  listChartApps,
  getMarketApp,
  MARKET_CATEGORY_IDS,
  ratingLabel,
} from "./market-catalog.js";

const REPORT_REASON_IDS = ["spam", "copyright", "harmful", "other"];

/** @param {string} key @param {Record<string, string|number>} [vars] */
function p(key, vars) {
  return pt(`qishi.${key}`, vars);
}
import {
  listInstalledMarketSkills,
  setSkillEnabled,
  uninstallSkillFromPlatform,
} from "./skill-install.js";

/**
 * @typedef {{ kind: string, id: string, record: object }} QishiEntry
 */

function listQishiEntries() {
  const exts = listInstalledExtensions().map((record) => ({
    kind: KIND_PHONE_EXT,
    id: record.id,
    record,
  }));
  const games = listInstalledGames().map((record) => ({
    kind: KIND_GAME,
    id: record.id,
    record,
  }));
  return [...exts, ...games].sort((a, b) => {
    const an = a.record.manifest?.name || a.id;
    const bn = b.record.manifest?.name || b.id;
    return String(an).localeCompare(String(bn), getLocale() === "en" ? "en" : "zh-CN");
  });
}

function getQishiEntry(id) {
  const ext = getInstalledExtension(id);
  if (ext) return { kind: KIND_PHONE_EXT, id, record: ext };
  const game = getInstalledGame(id);
  if (game) return { kind: KIND_GAME, id, record: game };
  return null;
}

function entryIconHtml(entry) {
  const icon = entry.record.iconDataUrl;
  if (icon) return `<img src="${escapeHtml(icon)}" alt="" />`;
  if (entry.kind === KIND_GAME) return `<i data-lucide="gamepad-2"></i>`;
  return `<i data-lucide="puzzle"></i>`;
}

function revokeAllPermissions(entry) {
  const perms = entry.record.manifest?.permissions || [];
  if (entry.kind === KIND_GAME) {
    for (const p of perms) revokeGamePermission(entry.id, p);
    return;
  }
  for (const p of perms) revokeExtensionPermission(entry.id, p);
}

function uninstallEntry(entry) {
  if (entry.kind === KIND_GAME) {
    uninstallGame(entry.id);
    depsRef.onRemoveGameFromDesktop?.(entry.id);
    return;
  }
  uninstallExtension(entry.id);
  depsRef.onRemoveFromDesktop?.(entry.id);
}

function marketIconHtml(app) {
  return `
    <div class="mini-market-icon" data-tone="${escapeHtml(app.tone || "mint")}" aria-hidden="true">
      <i data-lucide="${escapeHtml(app.icon || "sparkles")}"></i>
    </div>
  `;
}

function marketGetLabel(app, pinned) {
  if (app.archived) return p("actionUnavailable");
  if (app.action === "sideload-hint") return p("actionSideload");
  if (app.action === "open-games") return pinned ? p("actionOpen") : p("actionGet");
  if (app.action === "open-app") return pinned ? p("actionOpen") : p("actionGet");
  return p("actionOpen");
}

function marketAction(app, pinned) {
  if (app.archived) return "archived";
  if (pinned || app.action === "sideload-hint") return app.action;
  if (app.action === "open-app" || app.action === "open-games") return "install-app";
  return app.action;
}

function formatDownloads(app) {
  if (app.downloadsKind === "count") return p("downloadsCount", { n: app.downloads });
  return String(app.downloads || "");
}

function formatRowMeta(app) {
  if (app.archived) return p("downloadsArchived");
  if (app.downloadsKind === "builtin") return app.sizeLabel;
  if (app.downloadsKind === "sideload") return `${formatDownloads(app)} · ${app.sizeLabel}`;
  return `${formatDownloads(app)} · ${app.sizeLabel}`;
}

function marketAppRow(app, { rank = 0, pinned = false } = {}) {
  const action = marketAction(app, pinned);
  const archivedClass = app.archived ? " is-archived" : "";
  return `
    <article class="mini-market-row${rank ? " has-rank" : ""}${archivedClass}" data-qishi-market="${escapeHtml(app.id)}">
      ${rank ? `<span class="mini-market-rank">${rank}</span>` : ""}
      ${marketIconHtml(app)}
      <div class="mini-market-row__body">
        <strong>${escapeHtml(app.name)}</strong>
        <span class="mini-market-row__meta">${escapeHtml(app.developer)} · ${escapeHtml(app.category)}</span>
        <span class="mini-market-row__rating">
          ${app.showSocialProof ? `<em>${escapeHtml(ratingLabel(app.rating))}</em>` : ""}
          <span>${escapeHtml(formatRowMeta(app))}</span>
        </span>
      </div>
      <button type="button" class="mini-market-get${app.archived ? " is-archived" : ""}" data-qishi-curated="${escapeHtml(action)}" data-qishi-curated-id="${escapeHtml(app.id)}" data-stop="1">${escapeHtml(marketGetLabel(app, pinned))}</button>
    </article>
  `;
}

/** @type {object} */
let depsRef = {};

/**
 * @param {HTMLElement} root
 * @param {object} deps
 */
export function mountQishiApp(root, deps = {}) {
  if (!root) return { open() {}, destroy() {} };
  depsRef = deps;

  let tab = "discover";
  let category = "all";
  let query = "";
  let detailId = "";
  let marketDetailId = "";
  let pendingInstall = null;

  const locale = () => getLocale();

  function showPane(id) {
    root.querySelectorAll("[data-phone-pane-view]").forEach((pane) => {
      pane.hidden = pane.dataset.phonePaneView !== id;
    });
    const tabs = root.querySelector("[data-qishi-tabs]");
    if (tabs) tabs.hidden = id !== "qishi-list";
  }

  function setOverlay(text, show) {
    const overlay = root.querySelector("[data-qishi-overlay]");
    const label = root.querySelector("[data-qishi-overlay-text]");
    if (label && text) label.textContent = text;
    if (overlay) overlay.hidden = !show;
  }

  function syncTabs() {
    root.querySelectorAll("[data-qishi-tab]").forEach((btn) => {
      btn.hidden = false;
      btn.classList.toggle("is-active", btn.dataset.qishiTab === tab);
    });
  }

  function statusPill(entry) {
    const record = entry.record;
    if (!record.enabled) return `<em class="mini-qishi-pill is-off">${escapeHtml(p("pillOff"))}</em>`;
    const need = (record.manifest?.permissions || []).some(
      (pId) => !(record.grantedPermissions || []).includes(pId),
    );
    if (need) return `<em class="mini-qishi-pill is-auth">${escapeHtml(p("pillAuth"))}</em>`;
    return `<em class="mini-qishi-pill is-on">${escapeHtml(p("pillOn"))}</em>`;
  }

  function isPinned(appId) {
    if (typeof deps.isAppOnHome === "function") return Boolean(deps.isAppOnHome(appId));
    return false;
  }

  function pinTargetId(app) {
    if (!app) return "";
    if (app.action === "open-games") return "games";
    return app.id;
  }

  function runMarketAction(action, appId) {
    const app = getMarketApp(appId, locale());
    const pinId = pinTargetId(app) || appId;
    const archived = new Set(["scroll", "adventure", "cocreate"]);
    if (
      action === "archived"
      || archived.has(String(appId || "").trim())
      || archived.has(String(pinId || "").trim())
      || app?.archived
    ) {
      deps.onToast?.(p("toastArchived"));
      return;
    }

    if (action === "install-app" && pinId) {
      deps.onAddAppToDesktop?.(pinId);
      deps.onToast?.(p("toastGetOk"));
      renderList();
      if (marketDetailId === appId) renderMarketDetail(appId);
      return;
    }
    if (action === "open-app" && appId) {
      if (!isPinned(appId)) {
        deps.onAddAppToDesktop?.(appId);
        deps.onToast?.(p("toastGetOk"));
        renderList();
        if (marketDetailId === appId) renderMarketDetail(appId);
        return;
      }
      deps.onOpenApp?.(appId);
      return;
    }
    if (action === "open-games") {
      if (!isPinned("games")) {
        deps.onAddAppToDesktop?.("games");
        deps.onToast?.(p("toastGetOk"));
        renderList();
        if (marketDetailId === appId) renderMarketDetail(appId);
        return;
      }
      deps.onOpenGames?.() || deps.onToast?.(p("toastOpenGames"));
      return;
    }
    if (action === "sideload-hint") {
      deps.onToast?.(p("toastSideloadHint"));
      root.querySelector("[data-qishi-file]")?.click();
    }
  }

  function renderCategories() {
    return `
      <div class="mini-market-cats" data-qishi-cats>
        ${MARKET_CATEGORY_IDS.map((cat) => `
          <button type="button" class="mini-market-cat${cat === category ? " is-active" : ""}" data-qishi-cat="${escapeHtml(cat)}">${escapeHtml(p(`categories.${cat}`))}</button>
        `).join("")}
      </div>
    `;
  }

  function renderFeatured() {
    if (category !== "all" || query) return "";
    const featured = listFeaturedApps(locale()).slice(0, 3);
    if (!featured.length) return "";
    return `
      <div class="mini-market-featured" data-qishi-featured>
        ${featured.map((app) => `
          <button type="button" class="mini-market-banner" data-qishi-market="${escapeHtml(app.id)}" data-tone="${escapeHtml(app.tone || "mint")}">
            <div class="mini-market-banner__copy">
              <em>${escapeHtml(app.featuredTag || p("featuredDefault"))}</em>
              <strong>${escapeHtml(app.name)}</strong>
              <span>${escapeHtml(app.summary)}</span>
            </div>
            <div class="mini-market-banner__icon" aria-hidden="true"><i data-lucide="${escapeHtml(app.icon)}"></i></div>
          </button>
        `).join("")}
      </div>
    `;
  }

  async function renderDiscover(host) {
    const prefs = loadGatePrefs();
    const apps = listMarketApps({ category, query, locale: locale() });
    const featuredIds = category === "all" && !query
      ? new Set(listFeaturedApps(locale()).map((app) => app.id))
      : new Set();
    const live = apps.filter((app) => {
      if (app.archived || featuredIds.has(app.id)) return false;
      if (category === "all" && !query && app.action === "sideload-hint") return false;
      return true;
    });
    const frozen = apps.filter((app) => app.archived);
    const liveHeading = category === "all" ? p("sectionRecommended") : p(`categories.${category}`);
    let cloudBlock = "";
    if (prefs.cloudCatalogEnabled && !requiresGateLogin(prefs)) {
      const result = await fetchCloudCatalog();
      if (result.items.length) {
        cloudBlock = `
          <h3 class="mini-market-section">${escapeHtml(p("sectionCloud"))}</h3>
          <div class="mini-market-list">
            ${result.items.map((item) => `
              <article class="mini-market-row">
                <div class="mini-market-icon" data-tone="mint"><i data-lucide="cloud"></i></div>
                <div class="mini-market-row__body">
                  <strong>${escapeHtml(item.manifest.name)}</strong>
                  <span class="mini-market-row__meta">${escapeHtml(item.summary || p("cloudApp"))}</span>
                  <span class="mini-market-row__rating"><span>${item.manifest.contentRating === "mature" ? p("agesConfirm") : p("agesAll")}</span></span>
                </div>
                <em class="mini-market-get is-ghost">${escapeHtml(p("cloudBadge"))}</em>
              </article>
            `).join("")}
          </div>
        `;
      }
    }

    host.innerHTML = `
      <div class="mini-market">
        <label class="mini-market-search">
          <i data-lucide="search"></i>
          <input type="search" data-qishi-search placeholder="${escapeHtml(p("searchPlaceholder"))}" value="${escapeHtml(query)}" enterkeyhint="search" />
        </label>
        ${renderFeatured()}
        ${renderCategories()}
        ${live.length ? `
          <h3 class="mini-market-section">${escapeHtml(liveHeading)}</h3>
          <div class="mini-market-list">
            ${live.map((app) => marketAppRow(app, { pinned: isPinned(pinTargetId(app)) })).join("")}
          </div>
        ` : ""}
        ${frozen.length ? `
          <h3 class="mini-market-section">${escapeHtml(p("sectionUnavailable"))}</h3>
          <div class="mini-market-list">
            ${frozen.map((app) => marketAppRow(app, { pinned: isPinned(pinTargetId(app)) })).join("")}
          </div>
        ` : ""}
        ${!live.length && !frozen.length ? `<p class="mini-empty">${escapeHtml(p("emptySearch"))}</p>` : ""}
        ${cloudBlock}
        <p class="mini-market-foot">${escapeHtml(p("footDiscover"))}</p>
      </div>
    `;
    refreshIcons(host);
  }

  function renderCharts(host) {
    const charts = listChartApps(locale());
    host.innerHTML = `
      <div class="mini-market">
        <h3 class="mini-market-section">${escapeHtml(p("sectionCharts"))}</h3>
        <div class="mini-market-list">
          ${charts.length
            ? charts.map((app, i) => marketAppRow(app, { rank: i + 1, pinned: isPinned(pinTargetId(app)) })).join("")
            : `<p class="mini-empty">${escapeHtml(p("emptySearch"))}</p>`}
        </div>
        <p class="mini-market-foot">${escapeHtml(p("footCharts"))}</p>
      </div>
    `;
    refreshIcons(host);
  }

  function renderInstalled(host) {
    const list = listQishiEntries();
    const skills = listInstalledMarketSkills();
    const pinnedBuiltins = listMarketApps({ locale: locale() }).filter((app) => {
      if (app.action !== "open-app" && app.action !== "open-games") return false;
      return isPinned(pinTargetId(app));
    });
    host.innerHTML = `
      <div class="mini-market">
        <h3 class="mini-market-section">${escapeHtml(p("sectionPinned"))}</h3>
        ${pinnedBuiltins.length ? `
          <div class="mini-market-list">
            ${pinnedBuiltins.map((app) => `
              <article class="mini-market-row${app.archived ? " is-archived" : ""}" data-qishi-market="${escapeHtml(app.id)}">
                ${marketIconHtml(app)}
                <div class="mini-market-row__body">
                  <strong>${escapeHtml(app.name)}</strong>
                  <span class="mini-market-row__meta">${escapeHtml(p("desktopIconMeta", { version: app.version }))}</span>
                </div>
                <button type="button" class="mini-market-get${app.archived ? " is-archived" : ""}" data-qishi-curated="${escapeHtml(marketAction(app, true))}" data-qishi-curated-id="${escapeHtml(app.id)}" data-stop="1">${escapeHtml(marketGetLabel(app, true))}</button>
              </article>
              <div class="mini-market-row-actions">
                <button type="button" data-qishi-unpin="${escapeHtml(pinTargetId(app))}">${escapeHtml(p("unpinFromHome"))}</button>
              </div>
            `).join("")}
          </div>
        ` : `
          <p class="mini-empty">${escapeHtml(p("emptyPinned"))}</p>
        `}
        <h3 class="mini-market-section">${escapeHtml(p("sectionSideload"))}</h3>
        ${list.length ? `
          <div class="mini-market-list">
            ${list.map((entry) => `
              <article class="mini-market-row" data-qishi-open="${escapeHtml(entry.id)}">
                <div class="mini-market-icon" data-tone="${entry.kind === KIND_GAME ? "ember" : "mint"}">
                  ${entryIconHtml(entry)}
                </div>
                <div class="mini-market-row__body">
                  <strong>${escapeHtml(entry.record.manifest?.name || entry.id)}</strong>
                  <span class="mini-market-row__meta">${escapeHtml(kindLabelZh(entry.kind))} · v${escapeHtml(entry.record.manifest?.version || "—")}</span>
                </div>
                ${statusPill(entry)}
              </article>
              <div class="mini-market-row-actions">
                <button type="button" data-qishi-perms="${escapeHtml(entry.id)}">${escapeHtml(p("permissions"))}</button>
                <button type="button" data-qishi-uninstall="${escapeHtml(entry.id)}">${escapeHtml(p("uninstall"))}</button>
              </div>
            `).join("")}
          </div>
        ` : `
          <div class="mini-qishi-empty">
            <p>${escapeHtml(p("emptySideloadTitle"))}</p>
            <p class="mini-qishi-empty__hint">${escapeHtml(p("emptySideloadHint"))}</p>
            <button type="button" class="mini-app-cta" data-qishi-sideload-empty>${escapeHtml(p("sideloadEmpty"))}</button>
          </div>
        `}
        <h3 class="mini-market-section">${escapeHtml(p("sectionSkills"))}</h3>
        ${skills.length ? `
          <div class="mini-market-list">
            ${skills.map(({ installation, catalog, missingGrants }) => {
              const sid = installation.skillId;
              const enabled = installation.enabled !== false;
              const pending = missingGrants.length > 0;
              return `
              <article class="mini-market-row" data-qishi-skill="${escapeHtml(sid)}">
                <div class="mini-market-icon" data-tone="sea"><i data-lucide="sparkles"></i></div>
                <div class="mini-market-row__body">
                  <strong>${escapeHtml(catalog?.name || sid)}</strong>
                  <span class="mini-market-row__meta">${escapeHtml(p("skillMeta", { version: installation.version || catalog?.version || "—" }))}</span>
                </div>
                ${!enabled
                  ? `<em class="mini-qishi-pill is-off">${escapeHtml(p("pillOff"))}</em>`
                  : pending
                    ? `<em class="mini-qishi-pill is-auth">${escapeHtml(p("pillAuth"))}</em>`
                    : `<em class="mini-qishi-pill is-on">${escapeHtml(p("pillOn"))}</em>`}
              </article>
              <div class="mini-market-row-actions">
                <button type="button" data-qishi-skill-toggle="${escapeHtml(sid)}">${escapeHtml(enabled ? p("disable") : p("enable"))}</button>
                <button type="button" data-qishi-skill-uninstall="${escapeHtml(sid)}">${escapeHtml(p("uninstall"))}</button>
              </div>
            `;
            }).join("")}
          </div>
        ` : `
          <p class="mini-empty">${escapeHtml(p("emptySkills"))}</p>
        `}
      </div>
    `;
    refreshIcons(host);
  }

  function renderComingSoon(host) {
    const list = listQishiEntries();
    host.innerHTML = `
      <div class="mini-qishi-soon">
        <div class="mini-qishi-soon__mark" aria-hidden="true"><i data-lucide="store"></i></div>
        <em>${escapeHtml(p("comingSoonKicker"))}</em>
        <strong>${escapeHtml(p("comingSoonTitle"))}</strong>
        <p>${escapeHtml(p("comingSoonBody"))}</p>
        <p class="mini-qishi-soon__hint">${escapeHtml(p("comingSoonHint"))}</p>
      </div>
      ${list.length ? `
        <h3 class="mini-market-section">${escapeHtml(p("sectionSideload"))}</h3>
        <div class="mini-market-list">
          ${list.map((entry) => `
            <article class="mini-market-row" data-qishi-open="${escapeHtml(entry.id)}">
              <div class="mini-market-icon" data-tone="${entry.kind === KIND_GAME ? "ember" : "mint"}">
                ${entryIconHtml(entry)}
              </div>
              <div class="mini-market-row__body">
                <strong>${escapeHtml(entry.record.manifest?.name || entry.id)}</strong>
                <span class="mini-market-row__meta">${escapeHtml(kindLabelZh(entry.kind))} · v${escapeHtml(entry.record.manifest?.version || "—")}</span>
              </div>
              ${statusPill(entry)}
            </article>
          `).join("")}
        </div>
      ` : ""}
    `;
    refreshIcons(host);
  }

  function renderList() {
    const host = root.querySelector("[data-qishi-list]");
    if (!host) return;
    const tabs = root.querySelector("[data-qishi-tabs]");
    if (tabs) tabs.hidden = true;
    renderComingSoon(host);
  }

  function renderMarketDetail(appId) {
    const app = getMarketApp(appId, locale());
    const host = root.querySelector("[data-qishi-detail]");
    if (!host || !app) return;
    marketDetailId = app.id;
    detailId = "";
    const pinned = isPinned(pinTargetId(app));
    const action = marketAction(app, pinned);
    const statsHtml = app.archived
      ? ""
      : app.showSocialProof
        ? `
        <div class="mini-market-stats">
          <div><strong>${escapeHtml(ratingLabel(app.rating))}</strong><span>${escapeHtml(p("statRating"))}</span></div>
          <div><strong>${escapeHtml(String(app.ratingCount))}</strong><span>${escapeHtml(p("statReviews"))}</span></div>
          <div><strong>${escapeHtml(app.downloads)}</strong><span>${escapeHtml(p("statDownloads"))}</span></div>
          <div><strong>${escapeHtml(app.sizeLabel)}</strong><span>${escapeHtml(p("statSize"))}</span></div>
        </div>
        `
        : `
        <div class="mini-market-stats">
          <div><strong>${escapeHtml(app.sizeLabel)}</strong><span>${escapeHtml(p("statSize"))}</span></div>
        </div>
        `;
    const hintHtml = app.archived
      ? ""
      : pinned
        ? `<p class="mini-market-desc is-muted">${escapeHtml(p("onHomeHint"))}</p>`
        : `<p class="mini-market-desc is-muted">${escapeHtml(p("afterGetHint"))}</p>`;
    host.innerHTML = `
      <div class="mini-market-detail">
        <div class="mini-market-detail__head">
          ${marketIconHtml(app)}
          <div>
            <strong>${escapeHtml(app.name)}</strong>
            <span>${escapeHtml(app.developer)}</span>
            <em>${escapeHtml(app.category)} · ${escapeHtml(app.age)} · v${escapeHtml(app.version)}</em>
          </div>
          <button type="button" class="mini-market-get is-lg${app.archived ? " is-archived" : ""}" data-qishi-curated="${escapeHtml(action)}" data-qishi-curated-id="${escapeHtml(app.id)}">${escapeHtml(marketGetLabel(app, pinned))}</button>
        </div>
        ${statsHtml}
        ${app.archived ? "" : `
        <div class="mini-market-shots" aria-hidden="true">
          <span data-tone="${escapeHtml(app.tone)}"></span>
          <span data-tone="${escapeHtml(app.tone)}"></span>
          <span data-tone="${escapeHtml(app.tone)}"></span>
        </div>
        `}
        <h3 class="mini-market-section">${escapeHtml(p("sectionAbout"))}</h3>
        <p class="mini-market-desc">${escapeHtml(app.description)}</p>
        ${app.archived ? "" : `<p class="mini-market-desc is-muted">${escapeHtml(app.summary)}</p>`}
        ${hintHtml}
      </div>
    `;
    refreshIcons(host);
    showPane("qishi-detail");
  }

  function renderDetail(extId) {
    detailId = extId;
    marketDetailId = "";
    const host = root.querySelector("[data-qishi-detail]");
    if (!host) return;
    const entry = getQishiEntry(extId);
    const prefs = loadGatePrefs();

    if (!entry && pendingInstall?.manifest?.id === extId) {
      const m = pendingInstall.manifest;
      const perms = (m.permissions || []).slice(0, 5);
      const blocked = m.contentRating === "mature" && !canInstallMatureContent(prefs);
      host.innerHTML = detailHtml({
        name: m.name,
        author: m.author,
        version: m.version,
        kindLabel: kindLabelZh(m.kind),
        iconDataUrl: pendingInstall.iconDataUrl,
        permissions: m.permissions || [],
        permsPreview: perms,
        primaryLabel: p("actionGet"),
        primaryAction: "install-pending",
        primaryDisabled: blocked,
        ageBlocked: blocked,
        reportId: m.id,
        reportName: m.name,
      });
      refreshIcons(host);
      showPane("qishi-detail");
      return;
    }

    if (!entry) {
      host.innerHTML = `<p class="mini-empty">${escapeHtml(p("appNotFound"))}</p>`;
      showPane("qishi-detail");
      return;
    }

    const perms = (entry.record.manifest.permissions || []).slice(0, 5);
    host.innerHTML = detailHtml({
      name: entry.record.manifest.name,
      author: entry.record.manifest.author,
      version: entry.record.manifest.version,
      kindLabel: kindLabelZh(entry.kind),
      iconDataUrl: entry.record.iconDataUrl,
      permissions: entry.record.manifest.permissions || [],
      permsPreview: perms,
      primaryLabel: p("actionOpen"),
      primaryAction: "open",
      primaryDisabled: false,
      ageBlocked: false,
      reportId: entry.id,
      reportName: entry.record.manifest.name,
      granted: entry.record.grantedPermissions || [],
    });
    refreshIcons(host);
    showPane("qishi-detail");
  }

  function detailHtml({
    name, author, version, kindLabel, iconDataUrl, permissions, permsPreview,
    primaryLabel, primaryAction, primaryDisabled, ageBlocked, reportId, reportName, granted = [],
  }) {
    return `
      <div class="mini-market-detail">
        <div class="mini-market-detail__head">
          <div class="mini-market-icon" data-tone="mint">
            ${iconDataUrl ? `<img src="${escapeHtml(iconDataUrl)}" alt="" />` : `<i data-lucide="puzzle"></i>`}
          </div>
          <div>
            <strong>${escapeHtml(name)}</strong>
            <span>${escapeHtml(author || p("unknownDeveloper"))}</span>
            <em>${escapeHtml(kindLabel || p("packageKind"))} · v${escapeHtml(version || "—")}</em>
          </div>
          <button type="button" class="mini-market-get is-lg" data-qishi-primary="${escapeHtml(primaryAction)}" ${primaryDisabled ? "disabled" : ""}>${escapeHtml(primaryLabel)}</button>
        </div>
        <ul class="mini-qishi-perms">
          ${permsPreview.map((permId) => `
            <li><i data-lucide="shield"></i><span>${escapeHtml(permissionLabelZh(permId))}</span>
            ${granted.includes(permId) ? `<em>${escapeHtml(p("permGranted"))}</em>` : ""}</li>
          `).join("")}
          ${permissions.length > 5 ? `<li class="is-more">${escapeHtml(p("permTotal", { n: permissions.length }))}</li>` : ""}
        </ul>
        ${ageBlocked ? `<p class="mini-qishi-age-hint">${escapeHtml(p("ageHint"))}<button type="button" class="mini-text-btn" data-qishi-go-age>${escapeHtml(p("goSettings"))}</button></p>` : ""}
        <button type="button" class="mini-ghost-btn" data-qishi-manage-perms>${escapeHtml(p("permissions"))}</button>
        <button type="button" class="mini-text-btn mini-qishi-report-link" data-qishi-report="${escapeHtml(reportId)}" data-qishi-report-name="${escapeHtml(reportName)}">${escapeHtml(p("reportApp"))}</button>
      </div>
    `;
  }

  function renderReportForm(targetId, targetName) {
    const host = root.querySelector("[data-qishi-report]");
    if (!host) return;
    host.innerHTML = `
      <h3>${escapeHtml(p("reportTitle"))}</h3>
      <p class="mini-app-lead">${escapeHtml(targetName || targetId)}</p>
      <div class="mini-qishi-reasons">
        ${REPORT_REASON_IDS.map((id) => `
          <label><input type="radio" name="qishi-reason" value="${id}" ${id === "harmful" ? "checked" : ""} /> ${escapeHtml(p(`reportReasons.${id}`))}</label>
        `).join("")}
      </div>
      <textarea rows="3" data-qishi-report-detail placeholder="${escapeHtml(p("reportDetailPlaceholder"))}"></textarea>
      <button type="button" class="mini-app-cta" data-qishi-report-submit data-target-id="${escapeHtml(targetId)}" data-target-name="${escapeHtml(targetName || "")}">${escapeHtml(p("reportSubmit"))}</button>
    `;
    showPane("qishi-report");
  }

  function renderPermManage(extId) {
    const entry = getQishiEntry(extId);
    if (!entry) return;
    const lines = (entry.record.manifest.permissions || []).map((permId) => {
      const granted = (entry.record.grantedPermissions || []).includes(permId);
      return `${permissionLabelZh(permId)}：${granted ? p("permGrantedStatus") : p("permDeniedStatus")}`;
    }).join("\n");
    const action = window.confirm(p("permRevokeConfirm", {
      name: entry.record.manifest.name,
      lines,
    }));
    if (!action) return;
    revokeAllPermissions(entry);
    deps.onToast?.(p("toastRevoked"));
    renderDetail(extId);
  }

  async function handleSideload(file) {
    if (!file) return;
    setOverlay(p("validating"), true);
    try {
      const result = await previewPackage(file);
      setOverlay("", false);
      if (!result.ok) {
        const host = root.querySelector("[data-qishi-list]");
        if (host) {
          host.innerHTML = `
            <div class="mini-qishi-error" role="alert">
              <p>${escapeHtml(result.message || p("toastUnrecognized"))}</p>
              <button type="button" class="mini-app-cta" data-qishi-sideload-empty>${escapeHtml(p("reselFile"))}</button>
            </div>
          `;
        }
        showPane("qishi-list");
        return;
      }
      pendingInstall = result;
      deps.onToast?.(p("toastAdded"));
      renderDetail(result.manifest.id);
    } catch (err) {
      setOverlay("", false);
      deps.onToast?.(String(err?.message || p("toastVerifyFail")));
    }
  }

  async function confirmInstallPending() {
    if (!pendingInstall) return;
    const prefs = loadGatePrefs();
    if (pendingInstall.manifest.contentRating === "mature" && !canInstallMatureContent(prefs)) {
      deps.onToast?.(p("toastAgeRequired"));
      return;
    }
    const saved = installUnpacked(pendingInstall, { source: "sideload", grantedPermissions: [] });
    if (!saved.ok) {
      deps.onToast?.(saved.message || p("toastInstallFail"));
      return;
    }
    if (saved.kind === KIND_GAME) deps.onAddGameToDesktop?.(saved.record.id);
    else deps.onAddToDesktop?.(saved.record.id);
    pendingInstall = null;
    detailId = saved.record.id;
    deps.onToast?.(p("toastGetOk"));
    renderDetail(saved.record.id);
    deps.onInstalled?.(saved.record, saved.kind);
  }

  function openEntry(entry) {
    if (!entry) return;
    if (entry.kind === KIND_GAME) deps.onOpenGame?.(entry.id);
    else deps.onOpenExt?.(entry.id);
  }

  function open() {
    tab = "discover";
    category = "all";
    query = "";
    pendingInstall = null;
    showPane("qishi-list");
    applyPhoneI18n(root);
    renderList();
  }

  root.addEventListener("change", (event) => {
    const input = event.target.closest("[data-qishi-file]");
    if (input?.files?.[0]) {
      handleSideload(input.files[0]);
      input.value = "";
    }
  });

  root.addEventListener("input", (event) => {
    const search = event.target.closest("[data-qishi-search]");
    if (!search) return;
    query = String(search.value || "").trim();
    if (tab === "discover") renderList();
  });

  root.addEventListener("click", async (event) => {
    if (event.target.closest("[data-qishi-sideload], [data-qishi-sideload-empty]")) {
      root.querySelector("[data-qishi-file]")?.click();
      return;
    }
    if (event.target.closest("[data-qishi-goto-discover]")) {
      tab = "discover";
      showPane("qishi-list");
      renderList();
      return;
    }
    const cat = event.target.closest("[data-qishi-cat]")?.dataset.qishiCat;
    if (cat) {
      category = cat;
      renderList();
      return;
    }
    const getBtn = event.target.closest("[data-qishi-curated]");
    if (getBtn) {
      event.stopPropagation();
      runMarketAction(getBtn.dataset.qishiCurated, getBtn.dataset.qishiCuratedId);
      return;
    }
    const marketId = event.target.closest("[data-qishi-market]")?.dataset.qishiMarket;
    if (marketId) {
      renderMarketDetail(marketId);
      return;
    }
    const tabBtn = event.target.closest("[data-qishi-tab]");
    if (tabBtn) {
      tab = tabBtn.dataset.qishiTab || "discover";
      showPane("qishi-list");
      renderList();
      return;
    }
    if (event.target.closest("[data-qishi-back]")) {
      showPane("qishi-list");
      renderList();
      return;
    }
    if (event.target.closest("[data-qishi-back-detail]")) {
      if (marketDetailId) {
        renderMarketDetail(marketDetailId);
        return;
      }
      if (detailId) renderDetail(detailId);
      else {
        showPane("qishi-list");
        renderList();
      }
      return;
    }
    const openId = event.target.closest("[data-qishi-open]")?.dataset.qishiOpen;
    if (openId) {
      renderDetail(openId);
      return;
    }
    const uninstallId = event.target.closest("[data-qishi-uninstall]")?.dataset.qishiUninstall;
    if (uninstallId) {
      const entry = getQishiEntry(uninstallId);
      if (!entry) return;
      if (!window.confirm(p("confirmUninstall", { name: entry.record.manifest?.name || uninstallId }))) return;
      uninstallEntry(entry);
      deps.onToast?.(p("toastUninstalled"));
      renderList();
      return;
    }
    const unpinId = event.target.closest("[data-qishi-unpin]")?.dataset.qishiUnpin;
    if (unpinId) {
      deps.onRemoveAppFromDesktop?.(unpinId);
      deps.onToast?.(p("toastUnpinned"));
      renderList();
      return;
    }
    const permsId = event.target.closest("[data-qishi-perms]")?.dataset.qishiPerms;
    if (permsId) {
      renderPermManage(permsId);
      return;
    }
    const skillToggle = event.target.closest("[data-qishi-skill-toggle]")?.dataset.qishiSkillToggle;
    if (skillToggle) {
      const row = listInstalledMarketSkills().find((s) => s.installation.skillId === skillToggle);
      if (!row) return;
      setSkillEnabled(skillToggle, row.installation.enabled === false);
      deps.onToast?.(row.installation.enabled === false ? p("toastEnabled") : p("toastDisabled"));
      renderList();
      return;
    }
    const skillUninstall = event.target.closest("[data-qishi-skill-uninstall]")?.dataset.qishiSkillUninstall;
    if (skillUninstall) {
      if (!window.confirm(p("confirmUninstallSkill"))) return;
      const r = uninstallSkillFromPlatform(skillUninstall);
      deps.onToast?.(r.ok ? p("toastUninstalled") : (r.reason || p("toastUninstallSkillFail")));
      renderList();
      return;
    }
    if (event.target.closest("[data-qishi-manage-perms]") && detailId) {
      renderPermManage(detailId);
      return;
    }
    const primary = event.target.closest("[data-qishi-primary]")?.dataset.qishiPrimary;
    if (primary === "install-pending") {
      await confirmInstallPending();
      return;
    }
    if (primary === "open" && detailId) {
      openEntry(getQishiEntry(detailId));
      return;
    }
    const reportBtn = event.target.closest("[data-qishi-report]");
    if (reportBtn) {
      renderReportForm(reportBtn.dataset.qishiReport, reportBtn.dataset.qishiReportName);
      return;
    }
    if (event.target.closest("[data-qishi-report-submit]")) {
      const btn = event.target.closest("[data-qishi-report-submit]");
      const reason = root.querySelector('input[name="qishi-reason"]:checked')?.value || "other";
      const detail = root.querySelector("[data-qishi-report-detail]")?.value || "";
      const prefs = loadGatePrefs();
      await submitReport({
        targetId: btn.dataset.targetId,
        targetName: btn.dataset.targetName,
        reason,
        detail,
        syncEnabled: prefs.reportSyncEnabled,
        syncEndpoint: prefs.reportSyncEndpoint,
      });
      deps.onToast?.(p("toastReportReceived"));
      if (detailId) renderDetail(detailId);
      return;
    }
    if (event.target.closest("[data-qishi-go-login], [data-qishi-go-age]")) {
      deps.onOpenSettings?.();
    }
  });

  function refreshLocale() {
    applyPhoneI18n(root);
    renderList();
  }

  function onLocaleChanged() {
    refreshLocale();
  }
  window.addEventListener("yueqi:locale-changed", onLocaleChanged);

  return {
    open,
    openDetail: renderDetail,
    openReport: renderReportForm,
    refresh: renderList,
    refreshLocale,
    destroy() {
      window.removeEventListener("yueqi:locale-changed", onLocaleChanged);
    },
  };
}
