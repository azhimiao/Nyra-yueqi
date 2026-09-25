import { escapeHtml } from "../../../lib/utils.js";
import { refreshIcons } from "../../../lib/icons.js";
import {
  projectMessagesVm,
  projectMessageThreadDetail,
} from "../../../life/projections.js";
import { observeEvidence } from "../../daypack-access.js";
import { recordSidewriteEvent, startDwellTimer } from "../../projection.js";
import { crossLinksHtml, dayLabel, formatShortTime, softEmptyHtml } from "../shared.js";

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 */
export function mountMessagesApp(root, ctx) {
  if (!root) return { destroy() {}, showList() {}, showDetail() {} };

  let listScroll = 0;
  let cancelDwell = null;

  function stopDwell() {
    cancelDwell?.();
    cancelDwell = null;
  }

  function pack() {
    return ctx.getPack?.() || null;
  }

  function readIds() {
    return ctx.getReadIds?.() || new Set();
  }

  function paintList() {
    stopDwell();
    const dayPack = pack();
    const vm = projectMessagesVm(dayPack, { readIds: readIds() });
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="messages" data-ta-pane="list">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>讯息</strong><span>${vm.count} 个会话</span></div>
          <span></span>
        </header>
        <div class="ta-sub-scroll" data-ta-scroll>
          ${!vm.threads.length
            ? softEmptyHtml({ title: "还没有会话", body: "ta今天还没留下聊天痕迹。" })
            : vm.threads.map((t) => `
              <button type="button" class="ta-im-row" data-ta-thread="${escapeHtml(t.id)}">
                <span class="ta-avatar" aria-hidden="true">${escapeHtml(t.avatarHint || "话")}</span>
                <span class="ta-im-row__body">
                  <strong>${escapeHtml(t.title)}</strong>
                  <em>${escapeHtml(t.lastMessagePreview)}</em>
                </span>
                <span class="ta-im-row__meta">
                  <time>${escapeHtml(formatShortTime(t.lastMessageAt))}</time>
                  ${t.unreadCount > 0 ? `<i class="ta-badge">${t.unreadCount}</i>` : ""}
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
      subApp: "messages",
      summary: `用户打开了${ctx.character?.name || "TA"}的讯息`,
    });
  }

  function paintDetail(threadId) {
    stopDwell();
    const dayPack = pack();
    const detail = projectMessageThreadDetail(dayPack, threadId, { readIds: readIds() });
    const thread = detail?.thread;
    const messages = thread?.messages || [];
    let lastDay = "";
    const body = messages.map((m) => {
      const day = dayLabel(m.sentAt);
      const sep = day && day !== lastDay
        ? ((lastDay = day), `<div class="ta-day-sep">—— ${escapeHtml(day)} ——</div>`)
        : "";
      const side = m.role === "self" ? "is-self" : "is-other";
      const photoRef = (m.crossRefs || []).find((id) => String(id).includes("album"));
      const chip = photoRef
        ? `<button type="button" class="ta-bubble-chip" data-ta-cross-app="album" data-ta-cross-id="${escapeHtml(photoRef)}">查看照片</button>`
        : "";
      return `${sep}<div class="ta-bubble ${side}"><p>${escapeHtml(m.content)}</p>${chip}</div>`;
    }).join("");

    // Observe thread evidence
    for (const eid of thread?.evidenceIds || []) {
      const ev = (dayPack?.evidence || []).find((e) => e.id === eid);
      if (ev) {
        observeEvidence({
          characterId: ctx.characterId,
          dayPackId: dayPack.id,
          evidenceId: eid,
          dwellMs: 0,
          discoverable: ev.discoverable !== false,
        });
      }
    }
    ctx.onObserved?.();

    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="messages" data-ta-pane="detail">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>${escapeHtml(thread?.title || "会话")}</strong><span>只读</span></div>
          <span></span>
        </header>
        <div class="ta-chat-scroll" data-ta-scroll>
          ${body || softEmptyHtml({ title: "这条会话还没有消息" })}
          ${crossLinksHtml(detail?.linked || [])}
        </div>
      </div>
    `;
    refreshIcons();
    const lastOther = [...messages].reverse().find((m) => m.role === "other");
    const excerpt = lastOther?.content?.slice(0, 80) || "";
    recordSidewriteEvent({
      characterId: ctx.characterId,
      action: "view_thread",
      subApp: "messages",
      targetId: threadId,
      targetTitle: thread?.title || "",
      excerpt,
      summary: `用户查看了讯息「${thread?.title || "会话"}」`,
    });
    cancelDwell = startDwellTimer({
      characterId: ctx.characterId,
      subApp: "messages",
      targetId: threadId,
      targetTitle: thread?.title,
      excerpt,
      summary: `用户在讯息「${thread?.title || ""}」停留了一会儿`,
    });
  }

  const onClick = (event) => {
    const cross = event.target.closest("[data-ta-cross-app]");
    if (cross) {
      ctx.onCrossLink?.(cross.dataset.taCrossApp, cross.dataset.taCrossId);
      return;
    }
    if (event.target.closest("[data-ta-nav-back]")) {
      const pane = root.querySelector("[data-ta-pane]")?.dataset.taPane;
      if (pane === "detail") {
        ctx.onBack?.(root.querySelector("[data-ta-scroll]")?.scrollTop || 0);
      } else {
        ctx.onBackToDesktop?.();
      }
      return;
    }
    const id = event.target.closest("[data-ta-thread]")?.dataset.taThread;
    if (id) {
      listScroll = root.querySelector("[data-ta-scroll]")?.scrollTop || 0;
      ctx.onOpenDetail?.(id, listScroll);
    }
  };
  root.addEventListener("click", onClick);

  return {
    showList(_payload, _status, scrollTop = 0) {
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
