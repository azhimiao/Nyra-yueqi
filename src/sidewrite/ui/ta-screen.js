import { escapeHtml } from "../../lib/utils.js";
import { TA_APP_META, TA_DOCK_ORDER, TA_GRID_ORDER } from "../constants.js";
import { taAppGlyphHtml } from "./ta-glyphs.js";

function formatClock(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatHomeDate(date = new Date()) {
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${week}`;
}

/**
 * TA desktop — nested phone home (no product chrome).
 * Competitor feel: status bar + widgets + icon grid + glass dock.
 */
export function renderTaDesktop(host, opts) {
  if (!host) return { destroy() {}, tick() {} };

  const character = opts.character || { id: "", name: "TA" };
  const summary = opts.summary || {};
  const badges = opts.badges || {};
  const gridOrder = TA_GRID_ORDER;
  const dockOrder = [...TA_DOCK_ORDER];
  while (dockOrder.length < 4) dockOrder.push(null);
  const photo = opts.photoWidget || null;
  const cal = opts.calWidget || null;
  const emptyNotice = String(opts.emptyNotice || "").trim();
  const lifeDate = String(summary.localDate || "").trim();

  function iconButton(appId, extraClass = "") {
    if (!appId || !TA_APP_META[appId]) {
      return `<span class="ta-dock__slot is-empty" aria-hidden="true"></span>`;
    }
    const meta = TA_APP_META[appId];
    const badge = Number(badges[appId]) || 0;
    return `
      <button type="button" class="ta-app-icon ${extraClass}" data-ta-open-app="${escapeHtml(appId)}" aria-label="${escapeHtml(meta.label)}">
        <span data-tone="${escapeHtml(meta.tone)}">
          ${taAppGlyphHtml(appId)}
          ${badge > 0 ? `<i class="ta-icon-badge">${badge > 9 ? "9+" : badge}</i>` : ""}
        </span>
        <em>${escapeHtml(meta.label)}</em>
      </button>
    `;
  }

  const photoHtml = photo
    ? `
      <button type="button" class="ta-widget ta-widget--photo" data-ta-open-app="album">
        <div class="ta-widget__media" style="${photo.assetRef ? `background-image:url('${escapeHtml(photo.assetRef)}')` : ""}"></div>
        <div class="ta-widget__copy">
          <strong>${escapeHtml(photo.title || "今日")}</strong>
          <em>${escapeHtml(photo.caption || summary.theme || "")}</em>
        </div>
      </button>
    `
    : `
      <div class="ta-widget ta-widget--photo ta-widget--soft">
        <div class="ta-widget__copy">
          <strong>${escapeHtml(character.name)}</strong>
          <em>${escapeHtml(summary.theme || "今天还安静")}</em>
        </div>
      </div>
    `;

  const calHtml = cal
    ? `
      <button type="button" class="ta-widget ta-widget--cal" data-ta-open-app="calendar">
        <span class="ta-widget__eyebrow">日程</span>
        <span class="ta-widget__time">${escapeHtml(cal.timeLabel || "")}</span>
        <strong>${escapeHtml(cal.title || "日程")}</strong>
        <em>${escapeHtml(cal.location || "")}</em>
      </button>
    `
    : `
      <div class="ta-widget ta-widget--cal ta-widget--soft">
        <span class="ta-widget__eyebrow">日程</span>
        <strong>今日空闲</strong>
        <em>${escapeHtml(lifeDate || "暂无安排")}</em>
      </div>
    `;

  host.innerHTML = `
    <div class="ta-desktop" data-ta-screen="desktop" data-ta-wallpaper="river" data-ta-tone="river">
      <div class="ta-desktop__wash" aria-hidden="true"></div>
      <header class="ta-status-bar">
        <strong class="ta-status-bar__clock" data-ta-clock>${formatClock()}</strong>
        <span class="ta-status-bar__island" aria-hidden="true"></span>
        <div class="ta-status-bar__right" aria-hidden="true">
          <svg viewBox="0 0 18 12" width="16" height="11"><path fill="currentColor" d="M1 8.5h1.6v3H1zm3.2-2h1.6v5H4.2zm3.2-2.5h1.6v7.5H7.4zm3.2-2.5h1.6V11.5H10.6zm3.2 1.2h1.6v6.3H13.8z"/></svg>
          <svg viewBox="0 0 16 12" width="14" height="11"><path fill="currentColor" d="M8 2.2c2.1 0 4 .8 5.4 2.1l-1.1 1.1A5.7 5.7 0 008 3.8a5.7 5.7 0 00-4.3 1.6L2.6 4.3A7.4 7.4 0 018 2.2zm0 3.2c1.2 0 2.3.5 3.1 1.2L9.9 7.8A2.9 2.9 0 008 7a2.9 2.9 0 00-1.9.8L4.9 6.6A4.5 4.5 0 018 5.4zm0 3.2a1.4 1.4 0 011.4 1.4A1.4 1.4 0 018 11.4a1.4 1.4 0 01-1.4-1.4A1.4 1.4 0 018 8.6z"/></svg>
          <svg viewBox="0 0 26 12" width="24" height="11"><rect x="0.6" y="1.2" width="20" height="9.6" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="2.2" y="2.8" width="14" height="6.4" rx="1.2" fill="currentColor"/><path fill="currentColor" d="M22.2 4.2h1.6a1.2 1.2 0 010 2.4h-1.6z"/></svg>
        </div>
      </header>
      <div class="ta-home-hero">
        <time class="ta-home-hero__clock" data-ta-hero-clock>${formatClock()}</time>
        <span class="ta-home-hero__date" data-ta-hero-date>${formatHomeDate()}</span>
      </div>
      <div class="ta-widget-row">
        ${photoHtml}
        ${calHtml}
      </div>
      <div class="ta-icon-grid" data-ta-icon-grid>
        ${gridOrder.map((key) => iconButton(key)).join("")}
      </div>
      ${emptyNotice ? `<p class="ta-desktop__whisper">${escapeHtml(emptyNotice)}</p>` : ""}
      <nav class="ta-dock" aria-label="常用">
        ${dockOrder.map((key) => iconButton(key, "ta-dock__icon")).join("")}
      </nav>
      <button type="button" class="ta-home-pill" data-ta-home aria-label="回到桌面" title="长按退出"></button>
    </div>
  `;

  let longPressTimer = 0;
  const clearLongPress = () => {
    if (longPressTimer) window.clearTimeout(longPressTimer);
    longPressTimer = 0;
  };

  const onPointerDown = (event) => {
    const pill = event.target.closest("[data-ta-home]");
    if (!pill) return;
    clearLongPress();
    longPressTimer = window.setTimeout(() => {
      longPressTimer = 0;
      opts.onBackToPicker?.();
    }, 520);
  };
  const onPointerUp = () => clearLongPress();

  const onClick = (event) => {
    if (event.target.closest("[data-ta-home]")) {
      if (longPressTimer) clearLongPress();
      opts.onHome?.();
      return;
    }
    const appId = event.target.closest("[data-ta-open-app]")?.dataset.taOpenApp;
    if (appId) opts.onOpenApp?.(appId);
  };

  host.addEventListener("click", onClick);
  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointerup", onPointerUp);
  host.addEventListener("pointercancel", onPointerUp);
  host.addEventListener("pointerleave", onPointerUp);

  return {
    tick(now = new Date()) {
      const clock = formatClock(now);
      host.querySelectorAll("[data-ta-clock], [data-ta-hero-clock]").forEach((node) => {
        node.textContent = clock;
      });
      const date = host.querySelector("[data-ta-hero-date]");
      if (date) date.textContent = formatHomeDate(now);
    },
    destroy() {
      clearLongPress();
      host.removeEventListener("click", onClick);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointercancel", onPointerUp);
      host.removeEventListener("pointerleave", onPointerUp);
    },
  };
}
