/**
 * TA 的手机：选角 → 边界说明 → 锁屏 → 桌面 → 六 App
 * 主路径消费 DayPack projection；无独立伪造痕迹入口。
 */

import { escapeHtml } from "../../lib/utils.js";
import { refreshIcons } from "../../lib/icons.js";
import { listCharacters, getCharacterSync } from "../../characters/store.js";
import { resolveCharacterAvatarUrl } from "../../characters/avatar.js";
import { TA_APP_KEYS } from "../constants.js";
import {
  getLastCharacterId,
  getOrCreateManifest,
  setLastCharacterId,
} from "../manifest-store.js";
import { recordSidewriteEvent } from "../projection.js";
import {
  acceptBoundary,
  hasAcceptedBoundary,
  listObservedEvidenceIds,
  resolveDayPackForCharacter,
} from "../daypack-access.js";
import {
  projectAlbumVm,
  projectCalendarVm,
  projectDesktopSummary,
  projectLockNotifications,
  projectUnreadBadges,
} from "../../life/projections.js";
import { createTaNavigation } from "./ta-navigation.js";
import { renderTaConsent, renderTaLock } from "./ta-lock.js";
import { renderTaDesktop } from "./ta-screen.js";
import { mountMessagesApp } from "./apps/messages.js";
import { mountAlbumApp } from "./apps/album.js";
import { mountCalendarApp } from "./apps/calendar.js";
import { mountMemoApp } from "./apps/memo.js";
import { mountBrowserApp } from "./apps/browser.js";
import { mountOrdersApp } from "./apps/orders.js";

/**
 * @param {HTMLElement} root
 * @param {{
 *   onExitToPhoneHome?: () => void,
 *   collectProviderConfig?: () => object,
 * }} [deps]
 */
export function mountSidewriteApp(root, deps = {}) {
  if (!root) return { destroy() {}, open() {}, handleHome() { return false; } };

  root.innerHTML = `
    <div class="sidewrite-root" data-sidewrite-root>
      <section class="sidewrite-picker is-active" data-sw-layer="picker">
        <header class="mini-appbar">
          <button type="button" class="mini-icon-button" data-sw-exit aria-label="返回栖机桌面">
            <i data-lucide="chevron-left"></i>
          </button>
          <div><strong>查手机</strong><span>选一位角色</span></div>
          <span></span>
        </header>
        <div class="sidewrite-picker__list mini-app-scroll" data-sw-picker-list></div>
      </section>
      <section class="sidewrite-ta" data-sw-layer="ta" hidden>
        <div class="sidewrite-ta__shell" data-sw-shell></div>
        <div class="sidewrite-ta__app" data-sw-app-host hidden></div>
      </section>
    </div>
  `;

  const pickerLayer = root.querySelector('[data-sw-layer="picker"]');
  const taLayer = root.querySelector('[data-sw-layer="ta"]');
  const pickerList = root.querySelector("[data-sw-picker-list]");
  const shellHost = root.querySelector("[data-sw-shell]");
  const appHost = root.querySelector("[data-sw-app-host]");

  let characters = [];
  let pickerScroll = 0;
  let characterId = "";
  let character = null;
  let manifest = null;
  let dayPack = null;
  let packSource = "empty";
  let shellCtl = null;
  /** @type {Record<string, { showList: Function, showDetail: Function, destroy?: Function }>} */
  const appMounts = {};
  let activeAppKey = "";
  let clockTimer = 0;
  let readIds = new Set();

  const nav = createTaNavigation({
    onChange: (frame) => {
      syncNav(frame);
    },
  });

  function showLayer(name) {
    if (pickerLayer) {
      pickerLayer.hidden = name !== "picker";
      pickerLayer.classList.toggle("is-active", name === "picker");
    }
    if (taLayer) {
      taLayer.hidden = name !== "ta";
      taLayer.classList.toggle("is-active", name === "ta");
    }
  }

  function refreshPack() {
    const resolved = resolveDayPackForCharacter(characterId);
    dayPack = resolved.pack;
    packSource = resolved.source;
    readIds = listObservedEvidenceIds(characterId);
  }

  function avatarHtml(ch) {
    const avatarUrl = resolveCharacterAvatarUrl(ch);
    if (avatarUrl) {
      return `<img src="${escapeHtml(avatarUrl)}" alt="" />`;
    }
    const letter = escapeHtml(String(ch.name || "?").slice(0, 1));
    return `<span class="sidewrite-avatar__letter" aria-hidden="true">${letter}</span>`;
  }

  async function renderPicker({ autoEnterSingle = false, preferLast = false } = {}) {
    characters = await listCharacters();
    if (!characters.length) {
      pickerList.innerHTML = `<p class="ta-empty-inline">暂无角色</p>`;
      return;
    }
    const last = getLastCharacterId();
    pickerList.innerHTML = characters.map((ch) => `
      <button type="button" class="sidewrite-char-row ${ch.id === last ? "is-last" : ""}" data-sw-pick="${escapeHtml(ch.id)}">
        <span class="sidewrite-avatar">${avatarHtml(ch)}</span>
        <span class="sidewrite-char-row__text">
          <strong>${escapeHtml(ch.name || "角色")}</strong>
          <em>${escapeHtml(ch.alias && ch.alias !== ch.name ? ch.alias : "打开 TA 的手机")}</em>
        </span>
        <i data-lucide="chevron-right" aria-hidden="true"></i>
      </button>
    `).join("");
    refreshIcons();
    pickerList.scrollTop = pickerScroll;

    if (autoEnterSingle && characters.length === 1) {
      await enterTa(characters[0].id);
      return;
    }
    if (preferLast && last && characters.some((c) => c.id === last)) {
      await enterTa(last);
    }
  }

  async function enterTa(cid) {
    characterId = cid;
    character = getCharacterSync(cid) || characters.find((c) => c.id === cid) || { id: cid, name: "TA" };
    setLastCharacterId(cid);
    manifest = await getOrCreateManifest(cid);
    refreshPack();
    showLayer("ta");
    if (appHost) {
      appHost.hidden = true;
      appHost.innerHTML = "";
    }
    Object.values(appMounts).forEach((m) => m.destroy?.());
    for (const key of Object.keys(appMounts)) delete appMounts[key];
    activeAppKey = "";

    if (!hasAcceptedBoundary(cid)) {
      nav.showConsent();
    } else {
      nav.resetToLock();
    }

    recordSidewriteEvent({
      characterId: cid,
      action: "open_app",
      summary: `用户进入了${character.name}的手机`,
    });
  }

  function clearShell() {
    shellCtl?.destroy?.();
    shellCtl = null;
    if (shellHost) shellHost.innerHTML = "";
  }

  function mountConsent() {
    clearShell();
    if (shellHost) shellHost.hidden = false;
    if (appHost) appHost.hidden = true;
    shellCtl = renderTaConsent(shellHost, {
      character,
      onAccept: () => {
        acceptBoundary(characterId);
        nav.resetToLock();
      },
      onBack: () => {
        pickerScroll = pickerList?.scrollTop || pickerScroll;
        showLayer("picker");
        renderPicker();
      },
    });
  }

  function mountLock() {
    clearShell();
    if (shellHost) shellHost.hidden = false;
    if (appHost) appHost.hidden = true;
    const notes = projectLockNotifications(dayPack, { limit: 3 });
    shellCtl = renderTaLock(shellHost, {
      character,
      theme: dayPack?.theme || "",
      localDate: dayPack?.localDate || "",
      notifications: notes,
      onUnlock: () => nav.unlockToDesktop(),
      onBack: () => {
        pickerScroll = pickerList?.scrollTop || pickerScroll;
        showLayer("picker");
        renderPicker();
      },
    });
  }

  function mountDesktop() {
    clearShell();
    if (shellHost) shellHost.hidden = false;
    if (appHost) appHost.hidden = true;
    refreshPack();
    const summary = projectDesktopSummary(dayPack);
    const badges = projectUnreadBadges(dayPack, readIds);
    const album = projectAlbumVm(dayPack, { readIds });
    const cal = projectCalendarVm(dayPack);
    const photoWidget = album.photos[0]
      ? {
          title: album.photos[0].title,
          assetRef: album.photos[0].assetRef,
          caption: album.photos[0].caption,
        }
      : null;
    const calWidget = cal.events[0]
      ? {
          title: cal.events[0].title,
          timeLabel: cal.events[0].timeLabel,
          location: cal.events[0].location,
        }
      : null;

    shellCtl = renderTaDesktop(shellHost, {
      character,
      summary,
      badges,
      photoWidget,
      calWidget,
      emptyNotice: packSource === "empty"
        ? "今天还没有新痕迹"
        : "",
      onOpenApp: (appKey) => nav.openApp(appKey),
      onBackToPicker: () => {
        pickerScroll = pickerList?.scrollTop || pickerScroll;
        showLayer("picker");
        renderPicker();
      },
      onHome: () => nav.home(),
    });
  }

  function ensureAppMount(appKey) {
    if (appMounts[appKey]) return appMounts[appKey];
    const shared = {
      characterId,
      character: {
        name: character?.name,
        alias: character?.alias,
        profileSummary: character?.profile?.identity || character?.alias || "",
      },
      getPack: () => dayPack,
      getReadIds: () => readIds,
      onObserved: () => {
        readIds = listObservedEvidenceIds(characterId);
      },
      onCrossLink: (app, id) => {
        if (TA_APP_KEYS.includes(app) && id) nav.openCrossApp(app, id);
      },
      onBackToDesktop: () => nav.home(),
      onBack: (scrollTop) => {
        const frame = nav.peek();
        if (frame.name === "detail") {
          nav.back();
          const listFrame = nav.peek();
          if (listFrame.name === "list") listFrame.scrollTop = scrollTop || 0;
        }
      },
      onOpenDetail: (id, scrollTop) => nav.openDetail(id, scrollTop),
    };
    const mountFn = {
      messages: mountMessagesApp,
      album: mountAlbumApp,
      calendar: mountCalendarApp,
      memo: mountMemoApp,
      browser: mountBrowserApp,
      orders: mountOrdersApp,
    }[appKey];
    if (!mountFn) return null;
    appMounts[appKey] = mountFn(appHost, shared);
    return appMounts[appKey];
  }

  async function syncNav(frame) {
    if (!frame) return;

    if (frame.name === "consent") {
      mountConsent();
      return;
    }
    if (frame.name === "lock") {
      mountLock();
      return;
    }
    if (frame.name === "desktop") {
      activeAppKey = "";
      Object.values(appMounts).forEach((m) => m.destroy?.());
      for (const key of Object.keys(appMounts)) delete appMounts[key];
      if (appHost) {
        appHost.hidden = true;
        appHost.innerHTML = "";
      }
      mountDesktop();
      return;
    }

    if (shellHost) shellHost.hidden = true;
    if (appHost) appHost.hidden = false;

    const appKey = frame.appKey;
    if (!TA_APP_KEYS.includes(appKey)) {
      nav.home();
      return;
    }

    refreshPack();

    if (activeAppKey !== appKey || !appMounts[appKey]) {
      Object.values(appMounts).forEach((m) => m.destroy?.());
      for (const key of Object.keys(appMounts)) delete appMounts[key];
      activeAppKey = appKey;
      appHost.innerHTML = "";
      ensureAppMount(appKey);
    }

    const mount = ensureAppMount(appKey);
    if (!mount) {
      nav.home();
      return;
    }

    if (frame.name === "list") {
      mount.showList(null, packSource === "empty" ? "empty" : "ready", frame.scrollTop || 0);
    } else if (frame.name === "detail") {
      mount.showList(null, "ready", 0);
      mount.showDetail(frame.detailId);
    }
  }

  const onClick = async (event) => {
    if (event.target.closest("[data-sw-exit]")) {
      deps.onExitToPhoneHome?.();
      return;
    }
    const pick = event.target.closest("[data-sw-pick]")?.dataset.swPick;
    if (pick) {
      pickerScroll = pickerList?.scrollTop || 0;
      await enterTa(pick);
    }
  };
  root.addEventListener("click", onClick);

  function startClock() {
    stopClock();
    clockTimer = window.setInterval(() => shellCtl?.tick?.(), 30_000);
  }
  function stopClock() {
    if (clockTimer) window.clearInterval(clockTimer);
    clockTimer = 0;
  }

  async function open() {
    showLayer("picker");
    await renderPicker({ autoEnterSingle: true, preferLast: true });
    startClock();
  }

  function handleHome() {
    if (taLayer && !taLayer.hidden) {
      const frame = nav.peek();
      if (frame.name === "list" || frame.name === "detail") {
        nav.home();
        return true;
      }
      if (frame.name === "desktop" || frame.name === "lock" || frame.name === "consent") {
        showLayer("picker");
        renderPicker();
        return true;
      }
    }
    return false;
  }

  return {
    open,
    handleHome,
    /** @internal test helpers */
    __getPack: () => dayPack,
    __getCharacterId: () => characterId,
    destroy() {
      stopClock();
      root.removeEventListener("click", onClick);
      clearShell();
      Object.values(appMounts).forEach((m) => m.destroy?.());
    },
  };
}
