import { eventsForDate, formatDateKey, migrateEvents } from "../calendar/engine.js";
import { eventPromptOf } from "../calendar/event-types.js";
import { formatFreeBusySummary } from "../calendar/free-busy.js";
import { formatCoListenContextLine } from "../library/co-listen.js";
import { formatCoReadContextLine, getCoReadAnchor } from "../library/co-read.js";
import { formatPhotoRecallContextLine } from "../library/photo-recall.js";
import { formatRecentPlaysContextLine, getRecentPlays } from "../library/recent-plays.js";
import { isWithinDnd } from "../lib/time.js";

export { isWithinDnd };

function queryLooksLike(query, pattern) {
  return pattern.test(String(query || ""));
}

function isPlaceholderLocation(label) {
  const text = String(label || "").trim();
  return !text || /^(未读取|未知|用户当前位置|not (available|set)|unknown)$/i.test(text);
}

function formatEventContext(event) {
  const prompt = eventPromptOf(event);
  const hint = prompt ? `：${prompt.slice(0, 48)}` : "";
  return `${event.time} ${event.title}${hint}`;
}

export function buildExternalContext({
  grants = {},
  library = {},
  query = "",
  locationLabel = "",
  nowPlaying = null,
  recentPlays = null,
  coReadAnchor = null,
  photoRecall = null,
}) {
  const enabled = Object.values(grants).some(Boolean);
  if (!enabled) return [];

  const lines = [];
  const today = formatDateKey();
  const events = migrateEvents(library.events || []);

  if (grants["日历"] || grants.calendar) {
    const todayEvents = eventsForDate(events, today);
    const calendarQuery = queryLooksLike(query, /日历|日程|提醒|空闲|约会|calendar|schedule|reminder|free.?busy/i);
    if (todayEvents.length) {
      lines.push(
        `日历今日：${todayEvents.map((event) => formatEventContext(event)).join("；")}`
      );
      lines.push(`今日空闲：${formatFreeBusySummary(events, today)}`);
    } else if (calendarQuery) {
      lines.push("日历：今日暂无已标记日程。");
      lines.push(`今日空闲：${formatFreeBusySummary(events, today)}`);
    }
    if (library.selectedDay?.date) {
      const dayEvents = eventsForDate(events, library.selectedDay.date);
      if (dayEvents.length || calendarQuery) {
        lines.push(
          `日历选中 ${library.selectedDay.date}：${
            dayEvents.length
              ? dayEvents.map((event) => `${event.time} ${event.title}`).join("；")
              : "无日程"
          }`
        );
      }
    }
  }

  if (grants["位置"] || grants.location) {
    const locationQuery = queryLooksLike(query, /位置|定位|在哪|在哪儿|location|where are you/i);
    if (!isPlaceholderLocation(locationLabel)) {
      lines.push(`位置：${locationLabel}`);
    } else if (locationQuery) {
      lines.push("位置：未读取");
    }
  }

  if (grants["音乐"] || grants.music) {
    const musicNowPlaying = nowPlaying;
    const musicRecentPlays = recentPlays ?? getRecentPlays(5);
    // The built-in catalog is a device resource, not a relationship memory.
    // Never expose its rows to the character prompt: a model can otherwise
    // turn an available title (for example Chopin) into a fabricated shared
    // experience. Actual plays remain available through recentPlays/nowPlaying.
    const musicQuery = queryLooksLike(query, /音乐|歌曲|曲子|听歌|在听|听这|播放|歌单|专辑|钢琴|肖邦|music|song|playlist|listen|play/i);
    const tracks = (musicQuery ? library.tracks : [])
      .filter((track) => track?.builtin !== true)
      .slice(0, 5)
      .map((track) => {
        const tags = track.mood || track.genre ? `[${track.mood || "平静"}/${track.genre || "未分类"}]` : "";
        return `${track.title}${tags}`;
      });
    const canShareListen = Boolean(musicNowPlaying?.title) && musicNowPlaying.coListen !== false;
    const liveListen = canShareListen && musicNowPlaying.paused !== true;
    const pausedListen = canShareListen && musicNowPlaying.paused === true;
    if (liveListen || (musicQuery && pausedListen)) {
      const coListenLine = formatCoListenContextLine(musicNowPlaying);
      if (coListenLine) {
        lines.push(coListenLine);
      } else {
        lines.push(`一起听：${musicNowPlaying.title}${musicNowPlaying.playlist ? ` · ${musicNowPlaying.playlist}` : ""}`);
      }
    }
    const recentLine = formatRecentPlaysContextLine(musicRecentPlays, 5);
    if (recentLine) {
      lines.push(recentLine);
    }
    // The built-in catalog is an available-device resource, not evidence that
    // the user and companion listened to anything together. Keep it out of
    // ordinary turns; expose it only for an explicit music request and label
    // the provenance so the model cannot promote it into shared memory.
    if (musicQuery) {
      const catalogLabel = tracks.length ? tracks.join("、") : "当前设备音乐目录已隐藏，需用户明确播放后才会形成事实";
      lines.push(`设备音乐目录（仅表示当前设备可用，不是共同经历或长期记忆）：${catalogLabel}`);
    }
  }

  const readingLine = formatCoReadContextLine(coReadAnchor ?? getCoReadAnchor());
  if (readingLine) {
    lines.push(readingLine);
  }

  if (grants["相册"] || grants.album) {
    if (photoRecall) {
      const recallLine = formatPhotoRecallContextLine(photoRecall);
      if (recallLine) lines.push(recallLine);
    }
    const albumQuery = queryLooksLike(query, /相册|照片|相片|图片|看看那张|这张图|album|photo|gallery/i);
    if (albumQuery) {
      const photos = (library.photos || []).slice(0, 6).map((photo) => {
        const summary = photo.summary ? `（${photo.summary}）` : "";
        return `${photo.title || "图片"}${summary}`;
      }).filter(Boolean);
      if (photos.length) {
        lines.push(`设备相册目录（仅表示当前设备可用，不是共同经历）：${photos.join("、")}`);
      }
    }
  }

  if (grants["通知"] || grants.notification) {
    const notificationQuery = queryLooksLike(query, /通知|免打扰|dnd|notification/i);
    if (notificationQuery) {
      const dnd = library.notificationSettings || {};
      lines.push(`通知：已授权；免打扰 ${dnd.dndStart || "22:00"}-${dnd.dndEnd || "08:00"}`);
    }
  }

  return lines;
}

export function initTrackDrag(trackList, onReorder) {
  if (!trackList) return;

  const bindRow = (row) => {
    row.draggable = true;
    row.addEventListener("dragstart", () => row.classList.add("is-dragging"));
    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      onReorder?.();
    });
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      const dragging = trackList.querySelector(".track-row.is-dragging");
      if (!dragging || dragging === row) return;
      const rect = row.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      trackList.insertBefore(dragging, after ? row.nextSibling : row);
    });
  };

  trackList.querySelectorAll(".track-row").forEach(bindRow);
}
