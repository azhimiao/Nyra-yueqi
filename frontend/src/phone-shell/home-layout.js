/**
 * C1 home layout — consumer desktop vs advanced tools.
 * Widget selectors read from repositories; no hardcoded character names or fake clock.
 */

import { formatDateKey, eventsForDate } from "../calendar/engine.js";
import { togetherDaysFromAnniversary, isAnniversaryToday, anniversaryYearCount } from "../calendar/anniversaries.js";
import { normalizeCoListenState, formatCoListenProgress, isStoredDefaultTrackTitle } from "../library/co-listen.js";
import { formatReadProgress } from "../library/books.js";
import { pt } from "./i18n.js";
import { displayTrackTitle, displayPlaylistName } from "./phone-data.js";

/** Max visible consumer entries on default desktop (grid + unique dock). */
export const MAX_CONSUMER_HOME_ENTRIES = 12;

/**
 * First-page widgets are real app entry points. Their backing apps must not be
 * repeated in the dock, icon pages, or folders while the widget is enabled.
 */
export const WIDGET_APP_LINKS = Object.freeze({
  today: "pop",
  listen: "listen",
  calendar: "calendar",
});

export function activeWidgetAppIds(widgets = {}) {
  return Object.entries(WIDGET_APP_LINKS)
    .filter(([widgetId]) => widgets?.[widgetId] !== false)
    .map(([, appId]) => appId);
}

export function isWidgetBackedAppActive(appId, widgets = {}) {
  const id = String(appId || "");
  return activeWidgetAppIds(widgets).includes(id);
}

/** Dock contains only destinations not already represented by page-one widgets. */
export const C1_DOCK_ORDER = ["moments", "qishi", "shop", "settings"];

/**
 * App-page order (一起听、栖市在 Dock)。
 * 情景剧是应用页图标，不是首页大卡片；漫卷 / 冒险 / 共创仍不进默认桌面。
 */
export const C1_GRID_ORDER = [
  "scenario",
  "explore",
  "assist",
  "diary",
  "gallery",
  "read",
  "games",
  "memory",
  "profile",
  "beautify",
  "pet",
];

/** Frozen / advanced — not on *default* consumer grid; may be pinned from 栖市. */
export const FROZEN_HOME_APP_IDS = [
  "lab",
  "assets",
  // 漫卷 / 冒险 / 共创默认不进桌面；情景剧走应用页图标。
  "scroll",
  "adventure",
  "cocreate",
  "theater",
  // Removed from product shell (kept listed so old iconOrder slots strip cleanly):
  "sidewrite",
  "story",
  "studio",
  "experience-studio",
];

/** @deprecated creator hub removed; kept for prefs migration strip. */
export const CREATOR_FOLDER_KEY = "creator";
export const CREATOR_FOLDER_ENTRY = `folder:${CREATOR_FOLDER_KEY}`;

/** @deprecated empty — no default creator folder. */
export const DEFAULT_CREATOR_FOLDER = {
  name: "创作者",
  apps: [],
};

// Bump adds 桌宠 next to 美化 on consumer grid.
export const LAYOUT_VERSION_C1 = "c14-scenario-icon";

export const HOME_PAGE_COUNT_C1 = 2;

/** Max icon-grid pages (page 0 is always widgets). Total home pages = 1 + iconPages. */
export const MIN_ICON_PAGES = 1;
export const MAX_ICON_PAGES = 4;

/**
 * Single bounds helper for home `pageIndex` (0 .. pageCount-1).
 * @param {unknown} pageIndex
 * @param {unknown} pageCount
 * @returns {number}
 */
export function clampPageIndex(pageIndex, pageCount) {
  const count = Math.max(1, Math.floor(Number(pageCount)) || 1);
  const max = count - 1;
  const n = Math.floor(Number(pageIndex));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, n));
}

/** @returns {string[]} dense consumer grid ids (no dock apps). */
export function consumerGridOrder() {
  return C1_GRID_ORDER.slice();
}

/** Visible consumer entry count for default layout (dock + grid, unique). */
export function countDefaultConsumerEntries() {
  const ids = new Set([...C1_DOCK_ORDER, ...C1_GRID_ORDER.filter((id) => !String(id).startsWith("folder:"))]);
  return ids.size;
}

export function isFrozenHomeAppId(id) {
  return FROZEN_HOME_APP_IDS.includes(String(id || ""));
}

/** Greeting from real local clock. */
export function selectGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 6) return pt("home.greetingLate");
  if (hour < 11) return pt("home.greetingMorning");
  if (hour < 14) return pt("home.greetingNoon");
  if (hour < 18) return pt("home.greetingAfternoon");
  return pt("home.greetingEvening");
}

/**
 * Local atmosphere only — never invents network weather.
 * @returns {{ label: string, source: "local" }}
 */
export function selectLocalAtmosphere(now = new Date()) {
  const hour = now.getHours();
  let key = "home.atmosphereNight";
  if (hour >= 5 && hour < 9) key = "home.atmosphereDawn";
  else if (hour >= 9 && hour < 12) key = "home.atmosphereMorning";
  else if (hour >= 12 && hour < 17) key = "home.atmosphereAfternoon";
  else if (hour >= 17 && hour < 20) key = "home.atmosphereDusk";
  return { label: pt(key), source: "local" };
}

/**
 * Character presence widget model.
 * @param {{ name?: string, statusText?: string, lastMessage?: string, asleep?: boolean, talking?: boolean }} input
 */
export function selectPresenceWidget(input = {}) {
  const name = String(input.name || "").trim() || pt("home.someone");
  let statusText = String(input.statusText || "").trim();
  if (!statusText) {
    if (input.talking) statusText = pt("home.presenceReplying");
    else if (input.asleep) statusText = pt("home.presenceAsleep");
    else statusText = pt("home.presenceHere");
  }
  const rawMessage = String(input.lastMessage || "").trim();
  const meaningfulMessage = rawMessage.replace(/[\p{P}\p{Z}\s]/gu, "");
  const lastMessage = meaningfulMessage ? rawMessage : pt("home.presenceChatHint");
  return {
    name,
    statusText,
    lastMessage,
    openApp: "pop",
  };
}

/**
 * Today's relationship — calendar / anniversary; suggestion when empty.
 * @param {{ events?: object[], anniversaryDate?: string, characterName?: string, now?: Date }} input
 */
export function selectRelationWidget(input = {}) {
  const now = input.now instanceof Date ? input.now : new Date();
  const todayKey = formatDateKey(now);
  const name = String(input.characterName || "").trim() || "TA";
  const anniversaryDate = String(input.anniversaryDate || "").trim();

  if (anniversaryDate && isAnniversaryToday(anniversaryDate, now)) {
    const years = anniversaryYearCount(anniversaryDate, now);
    return {
      title: pt("home.relationAnniversaryTitle"),
      body: pt("home.relationAnniversaryBody", { name, years }),
      openApp: "calendar",
      empty: false,
    };
  }

  const events = Array.isArray(input.events) ? input.events : [];
  const todayEvents = eventsForDate(events, todayKey)
    .slice()
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
  if (todayEvents.length) {
    const first = todayEvents[0];
    const time = first.time ? `${first.time} · ` : "";
    return {
      title: pt("home.relationTodayTitle"),
      body: pt("home.relationEventBody", {
        time,
        title: first.title || pt("home.relationReminder"),
      }),
      openApp: "calendar",
      empty: false,
    };
  }

  // Next upcoming event within 14 days
  const upcoming = events
    .filter((ev) => ev?.date && String(ev.date) > todayKey)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time || "").localeCompare(String(b.time || "")));
  if (upcoming.length) {
    const next = upcoming[0];
    return {
      title: pt("home.relationNextTitle"),
      body: pt("home.relationNextBody", {
        date: next.date,
        time: next.time ? ` ${next.time}` : "",
        title: next.title || pt("home.relationReminder"),
      }),
      openApp: "calendar",
      empty: false,
    };
  }

  const together = togetherDaysFromAnniversary(anniversaryDate);
  if (together != null) {
    return {
      title: pt("home.relationDefaultTitle"),
      body: pt("home.relationTogetherDays", { days: together }),
      openApp: "calendar",
      empty: false,
    };
  }

  return {
    title: pt("home.relationDefaultTitle"),
    body: pt("home.relationEmptyBody", { name }),
    openApp: "calendar",
    empty: true,
  };
}

/**
 * “正在一起” — listen / read / scenario, pick one.
 * @param {{ listenState?: object, books?: object[], scenarioRun?: object|null, scriptTitle?: string }} input
 */
export function selectTogetherWidget(input = {}) {
  const listen = input.listenState ? normalizeCoListenState(input.listenState) : null;
  if (listen?.title && !isStoredDefaultTrackTitle(listen.title)) {
    const progress = formatCoListenProgress(listen);
    const suffix = progress ? ` · ${progress}` : "";
    return {
      kind: "listen",
      title: listen.title,
      subtitle: listen.paused
        ? pt("home.togetherPaused", { suffix })
        : pt("home.togetherListening", { suffix }),
      openApp: "listen",
      playlist: listen.playlist || "",
    };
  }

  const run = input.scenarioRun;
  if (run && (run.status === "active" || run.status === "paused")) {
    const scriptTitle = String(input.scriptTitle || "").trim() || pt("home.togetherScenarioDefault");
    const status = run.status === "paused"
      ? pt("home.togetherScenarioPaused")
      : pt("home.togetherScenarioActive");
    return {
      kind: "scenario",
      title: scriptTitle,
      subtitle: pt("home.togetherScenarioSubtitle", { status }),
      openApp: "scenario",
      playlist: "",
    };
  }

  const books = Array.isArray(input.books) ? input.books : [];
  const reading = books.find((book) => Number(book?.scrollRatio) > 0 && Number(book.scrollRatio) < 0.99)
    || books.find((book) => book?.title);
  if (reading?.title) {
    const progress = formatReadProgress(reading.scrollRatio || 0);
    return {
      kind: "read",
      title: reading.title,
      subtitle: progress
        ? pt("home.togetherReadProgress", { progress })
        : pt("home.togetherRead"),
      openApp: "read",
      playlist: "",
    };
  }

  if (listen?.title) {
    return {
      kind: "listen",
      title: displayTrackTitle(listen.title),
      subtitle: listen.playlist ? displayPlaylistName(listen.playlist) : pt("home.togetherPlaylist"),
      openApp: "listen",
      playlist: listen.playlist || "",
    };
  }

  return {
    kind: "idle",
    title: pt("home.togetherIdleTitle"),
    subtitle: pt("home.togetherIdleSubtitle"),
    openApp: "listen",
    playlist: "",
  };
}
