/**
 * 「我的」路由：微信式首页列表 → 点进详情。
 * 宽屏：列表 + 详情并排；窄屏：列表与详情互斥钻取。
 */
import { getLocale, t } from "../i18n/index.js";
import { assistT } from "../studio-assist/i18n.js";

const ROUTES = [
  { id: "identity", groupKey: "pages.meSettings.groups.companion", labelKey: "pages.meSettings.routes.identity.label", hintKey: "pages.meSettings.routes.identity.hint" },
  { id: "prompt", groupKey: "pages.meSettings.groups.companion", labelKey: "character.promptEditTitle", hintKey: "character.promptEditorLead", parentRoute: "identity" },
  { id: "behavior", groupKey: "pages.meSettings.groups.companion", labelKey: "pages.meSettings.routes.behavior.label", hintKey: "pages.meSettings.routes.behavior.hint" },
  { id: "diary", groupKey: "pages.meSettings.groups.companion", labelKey: "pages.meSettings.routes.diary.label", hintKey: "pages.meSettings.routes.diary.hint" },
  { id: "theme", groupKey: "pages.meSettings.groups.experience", labelKey: "pages.meSettings.routes.theme.label", hintKey: "pages.meSettings.routes.theme.hint" },
  { id: "language", groupKey: "pages.meSettings.groups.experience", labelKey: "pages.meSettings.routes.language.label", hintKey: "pages.meSettings.routes.language.hint" },
  { id: "interface", groupKey: "pages.meSettings.groups.experience", labelKey: "pages.meSettings.routes.interface.label", hintKey: "pages.meSettings.routes.interface.hint" },
  { id: "memory", groupKey: "pages.meSettings.groups.dataPrivacy", labelKey: "pages.meSettings.routes.memory.label", hintKey: "pages.meSettings.routes.memory.hint" },
  { id: "cloud", groupKey: "pages.meSettings.groups.dataPrivacy", labelKey: "pages.meSettings.routes.cloud.label", hintKey: "pages.meSettings.routes.cloud.hint" },
  { id: "account", groupKey: "pages.meSettings.groups.dataPrivacy", labelKey: "pages.meSettings.routes.account.label", hintKey: "pages.meSettings.routes.account.hint" },
  { id: "external", groupKey: "pages.meSettings.groups.dataPrivacy", labelKey: "pages.meSettings.routes.external.label", hintKey: "pages.meSettings.routes.external.hint" },
  { id: "worldbook", groupKey: "pages.meSettings.groups.creativeTools", labelKey: "pages.meSettings.routes.worldbook.label", hintKey: "pages.meSettings.routes.worldbook.hint" },
  { id: "presets", groupKey: "pages.meSettings.groups.creativeTools", labelKey: "pages.meSettings.routes.presets.label", hintKey: "pages.meSettings.routes.presets.hint" },
  { id: "regex", groupKey: "pages.meSettings.groups.creativeTools", labelKey: "pages.meSettings.routes.regex.label", hintKey: "pages.meSettings.routes.regex.hint" },
  { id: "assist", groupKey: "pages.meSettings.groups.tools", labelKey: "pages.assist", hintKey: "pages.meSettings.routes.assist.hint" },
  { id: "update", groupKey: "pages.meSettings.groups.about", labelKey: "pages.meSettings.routes.update.label", hintKey: "pages.meSettings.routes.update.hint" },
  { id: "community", groupKey: "pages.meSettings.groups.about", labelKey: "pages.meSettings.routes.community.label", hintKey: "pages.meSettings.routes.community.hint" },
  // C1: developer-only product cutover profile (hidden unless developer mode)
  {
    id: "cutover",
    groupKey: "pages.meSettings.groups.about",
    labelKey: "pages.meSettings.routes.cutover.label",
    hintKey: "pages.meSettings.routes.cutover.hint",
    developerOnly: true,
  },
];

function isNarrow() {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (root?.classList?.contains("is-native-app") || root?.classList?.contains("is-compact-shell")) {
      return true;
    }
  }
  return window.matchMedia("(max-width: 1079px)").matches;
}

function routeMeta(id, locale = getLocale()) {
  const item = ROUTES.find((entry) => entry.id === id) || null;
  if (!item) return null;
  return {
    ...item,
    group: item.groupKey ? t(item.groupKey, locale) : item.group,
    label: item.labelKey ? t(item.labelKey, locale) : item.label,
    hint: item.hintKey ? t(item.hintKey, locale) : item.hint,
  };
}

export function wireSettingsRouter({
  root = document.querySelector("[data-panel='me']"),
  defaultRoute = "",
  beforeLeave,
  onChange,
} = {}) {
  if (!root) return { setRoute: () => "" };

  const shell = root.querySelector("[data-settings-shell]");
  const nav = root.querySelector("[data-settings-nav]");
  const stage = root.querySelector("[data-settings-stage]");
  const backBtn = root.querySelector("[data-settings-back]");
  const crumb = root.querySelector("[data-settings-crumb]");
  const routeHint = root.querySelector("[data-settings-route-hint]");
  const titleEl = root.querySelector("[data-settings-title]");
  const detailBar = root.querySelector(".me-detail-bar");
  const pageScroller = root.closest(".content-shell");
  const settingsEditor = stage?.querySelector(".settings-editor");
  if (!shell || !nav) return { setRoute: () => "" };

  let assistBtn = detailBar?.querySelector("[data-settings-ask-assist]");
  if (detailBar && !assistBtn) {
    assistBtn = document.createElement("button");
    assistBtn.type = "button";
    assistBtn.className = "me-detail-assist";
    assistBtn.dataset.settingsAskAssist = "1";
    assistBtn.title = assistT("askPage");
    assistBtn.setAttribute("aria-label", assistT("askPage"));
    assistBtn.innerHTML = `<i data-lucide="bot"></i><span class="me-detail-assist__label">${assistT("ask")}</span>`;
    detailBar.append(assistBtn);
  }

  function paintRouteLabels(locale = getLocale()) {
    nav.querySelectorAll("[data-settings-route]").forEach((btn) => {
      const routeId = btn.getAttribute("data-settings-route");
      const meta = routeMeta(routeId, locale);
      if (!meta) return;
      const strong = btn.querySelector(".me-cell__copy strong");
      const small = btn.querySelector(".me-cell__copy small");
      if (strong && meta.labelKey) strong.textContent = meta.label;
      if (small && meta.hintKey) small.textContent = meta.hint;
    });
    nav.querySelectorAll(".me-group-title").forEach((titleEl) => {
      const groupKey = titleEl.dataset.i18n;
      if (groupKey) titleEl.textContent = t(groupKey, locale);
    });
    nav.querySelectorAll(".me-group").forEach((groupEl) => {
      const groupKey = groupEl.dataset.i18nAttrGroup;
      if (groupKey) groupEl.setAttribute("aria-label", t(groupKey, locale));
    });
  }

  function resetRouteScroll() {
    pageScroller?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    settingsEditor?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  function setRoute(routeId, { resetScroll = true, force = false } = {}) {
    const current = shell.dataset.settingsRoute || "";
    const narrow = isNarrow();
    let next = String(routeId || "");
    if (next && !routeMeta(next)) next = "";
    if (!force && current !== next && typeof beforeLeave === "function" && beforeLeave(current, next) === false) {
      return current;
    }

    shell.dataset.settingsRoute = next;
    shell.classList.toggle("is-home", !next);
    shell.classList.toggle("is-detail", Boolean(next));
    shell.classList.toggle("is-narrow", narrow);

    nav.querySelectorAll("[data-settings-route]").forEach((btn) => {
      const selected = Boolean(next) && btn.getAttribute("data-settings-route") === next;
      btn.classList.toggle("is-active", selected);
      btn.setAttribute("aria-current", selected ? "page" : "false");
    });

    root.querySelectorAll("[data-settings-view]").forEach((panel) => {
      const selected = Boolean(next) && panel.getAttribute("data-settings-view") === next;
      panel.classList.toggle("is-active", selected);
      panel.hidden = !selected;
      panel.setAttribute("aria-hidden", String(!selected));
    });

    const meta = next ? routeMeta(next) : null;
    if (backBtn) backBtn.hidden = !next;
    if (crumb) crumb.textContent = meta?.label || t("pages.me");
    if (routeHint) routeHint.textContent = meta?.hint || "";
    if (titleEl) titleEl.hidden = Boolean(next);
    if (assistBtn) assistBtn.hidden = !next || next === "assist";

    if (stage) {
      stage.hidden = !next;
      stage.setAttribute("aria-hidden", String(!next));
    }
    if (nav) {
      // 助手是一级工作台，不与设置列表共享画面。
      const hideNav = Boolean((narrow && next) || next === "assist");
      nav.hidden = hideNav;
      nav.setAttribute("aria-hidden", String(hideNav));
    }

    if (resetScroll) resetRouteScroll();

    onChange?.(next);
    return next;
  }

  nav.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-settings-route]");
    if (!btn || !nav.contains(btn)) return;
    setRoute(btn.getAttribute("data-settings-route"));
  });

  backBtn?.addEventListener("click", () => {
    const current = shell.dataset.settingsRoute || "";
    const parent = routeMeta(current)?.parentRoute;
    setRoute(parent || "");
  });

  assistBtn?.addEventListener("click", () => {
    const current = shell.dataset.settingsRoute || "assist";
    window.dispatchEvent(new CustomEvent("yueqi.assist.open", {
      detail: { context: current },
    }));
  });

  window.addEventListener("resize", () => {
    setRoute(shell.dataset.settingsRoute || "", { resetScroll: false });
  });
  window.addEventListener("yueqi:locale-changed", (event) => {
    const locale = event.detail?.locale || getLocale();
    paintRouteLabels(locale);
    if (assistBtn) {
      assistBtn.title = assistT("askPage", {}, locale);
      assistBtn.setAttribute("aria-label", assistT("askPage", {}, locale));
      const label = assistBtn.querySelector("span");
      if (label) label.textContent = assistT("ask", {}, locale);
    }
    const current = shell.dataset.settingsRoute || "";
    if (crumb) crumb.textContent = current ? routeMeta(current, locale)?.label || t("pages.me", locale) : t("pages.me", locale);
    if (routeHint) routeHint.textContent = current ? routeMeta(current, locale)?.hint || "" : "";
  });

  paintRouteLabels();
  setRoute(defaultRoute || "");
  return {
    setRoute,
    routes: ROUTES,
    getRoute: () => shell.dataset.settingsRoute || "",
  };
}

export { ROUTES as SETTINGS_ROUTES };
