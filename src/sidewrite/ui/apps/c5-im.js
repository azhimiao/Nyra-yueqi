import { escapeHtml } from "../../../lib/utils.js";
import { refreshIcons } from "../../../lib/icons.js";
import { recordSidewriteEvent, startDwellTimer } from "../../projection.js";
import { generateAppPayload } from "../../generate/runner.js";

function formatShortTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dayLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 */
export function mountC5Im(root, ctx) {
  if (!root) return { destroy() {}, showList() {}, showDetail() {} };

  let payload = ctx.payload || { threads: [], messagesByThread: {} };
  let status = ctx.status || "empty";
  let listScroll = 0;
  let cancelDwell = null;
  let busy = false;

  function stopDwell() {
    cancelDwell?.();
    cancelDwell = null;
  }

  async function onGenerate() {
    if (busy) return;
    busy = true;
    status = "generating";
    paintList();
    try {
      const result = await generateAppPayload(ctx.characterId, "c5", {
        character: ctx.character,
        collectProviderConfig: ctx.collectProviderConfig,
        useFixtureIfNoProvider: true,
      });
      payload = result.payload || payload;
      status = result.ok ? "ready" : "failed";
      ctx.onPayloadChange?.(payload, status);
    } finally {
      busy = false;
      paintList();
    }
  }

  function emptyHtml(failed = false) {
    return `
      <div class="ta-empty ta-empty--soft">
        <div class="ta-empty__wash" aria-hidden="true"></div>
        <strong>${failed ? "暂时打不开" : "今天还没有更新"}</strong>
        <p>${failed ? "稍后再试" : "过一会儿再来看看ta留下的痕迹。"}</p>
      </div>
    `;
  }

  function paintList() {
    stopDwell();
    const threads = payload?.threads || [];
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="c5" data-ta-pane="list">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>讯息</strong><span>即时通讯记录</span></div>
          <span></span>
        </header>
        ${status === "generating" ? `<div class="ta-progress" role="status"><i></i><span>正在加载…</span></div>` : ""}
        <div class="ta-sub-scroll" data-ta-scroll>
          ${!threads.length
            ? emptyHtml(status === "failed")
            : threads.map((t) => `
              <button type="button" class="ta-im-row" data-ta-thread="${escapeHtml(t.id)}">
                <span class="ta-avatar" aria-hidden="true">${escapeHtml(t.avatarHint || "话")}</span>
                <span class="ta-im-row__body">
                  <strong>${escapeHtml(t.title)}</strong>
                  <em>${escapeHtml(t.lastMessagePreview)}</em>
                </span>
                <span class="ta-im-row__meta">
                  <time>${escapeHtml(formatShortTime(t.lastMessageAt))}</time>
                  ${t.unreadCount > 0 ? `<i class="ta-badge">${t.unreadCount > 99 ? "99" : t.unreadCount}</i>` : ""}
                </span>
              </button>
            `).join("")}
        </div>
      </div>
    `;
    refreshIcons();
    const scroll = root.querySelector("[data-ta-scroll]");
    if (scroll) scroll.scrollTop = listScroll;
    recordSidewriteEvent({
      characterId: ctx.characterId,
      action: "open_app",
      subApp: "c5",
      summary: `用户打开了${ctx.character?.name || "TA"}的讯息`,
    });
  }

  function paintDetail(threadId) {
    stopDwell();
    const thread = (payload.threads || []).find((t) => t.id === threadId);
    const messages = payload.messagesByThread?.[threadId] || [];
    let lastDay = "";
    const body = messages.map((m) => {
      const day = dayLabel(m.sentAt);
      const sep = day && day !== lastDay
        ? ((lastDay = day), `<div class="ta-day-sep">—— ${escapeHtml(day)} ——</div>`)
        : "";
      const side = m.role === "self" ? "is-self" : m.role === "system" ? "is-system" : "is-other";
      return `${sep}<div class="ta-bubble ${side}"><p>${escapeHtml(m.content)}</p></div>`;
    }).join("");

    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="c5" data-ta-pane="detail">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>${escapeHtml(thread?.title || "会话")}</strong><span>只读偷看</span></div>
          <span></span>
        </header>
        <div class="ta-chat-scroll" data-ta-scroll>${body || `<p class="ta-empty-inline">这条会话还没有消息</p>`}</div>
      </div>
    `;
    refreshIcons();
    const lastOther = [...messages].reverse().find((m) => m.role === "other");
    const excerpt = lastOther?.content?.slice(0, 80) || "";
    recordSidewriteEvent({
      characterId: ctx.characterId,
      action: "view_thread",
      subApp: "c5",
      targetId: threadId,
      targetTitle: thread?.title || "",
      excerpt,
      summary: `用户查看了讯息「${thread?.title || "会话"}」中最后一条：「${excerpt || "（空）"}」`,
    });
    cancelDwell = startDwellTimer({
      characterId: ctx.characterId,
      subApp: "c5",
      targetId: threadId,
      targetTitle: thread?.title,
      excerpt,
      summary: `用户在讯息「${thread?.title || ""}」停留了一会儿`,
    });
  }

  const onClick = (event) => {
    if (event.target.closest("[data-ta-generate]")) {
      onGenerate();
      return;
    }
    if (event.target.closest("[data-ta-nav-back]")) {
      const pane = root.querySelector("[data-ta-pane]")?.dataset.taPane;
      if (pane === "detail") {
        const scroll = root.querySelector("[data-ta-scroll]");
        ctx.onBack?.(scroll?.scrollTop || 0);
      } else {
        ctx.onBackToDesktop?.();
      }
      return;
    }
    const id = event.target.closest("[data-ta-thread]")?.dataset.taThread;
    if (id) {
      const scroll = root.querySelector("[data-ta-scroll]");
      listScroll = scroll?.scrollTop || 0;
      ctx.onOpenDetail?.(id, listScroll);
    }
  };
  root.addEventListener("click", onClick);

  return {
    showList(nextPayload, nextStatus, scrollTop = 0) {
      if (nextPayload) payload = nextPayload;
      if (nextStatus) status = nextStatus;
      listScroll = scrollTop;
      paintList();
    },
    showDetail(threadId) {
      paintDetail(threadId);
    },
    destroy() {
      stopDwell();
      root.removeEventListener("click", onClick);
    },
  };
}
