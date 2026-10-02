import { escapeHtml } from "../../../lib/utils.js";
import { refreshIcons } from "../../../lib/icons.js";
import { recordSidewriteEvent, startDwellTimer } from "../../projection.js";
import { generateAppPayload } from "../../generate/runner.js";

function formatShortTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monogram(name) {
  const s = String(name || "?").trim();
  return s.slice(0, 1) || "?";
}

export function mountC2Sms(root, ctx) {
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
      const result = await generateAppPayload(ctx.characterId, "c2", {
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

  function paintList() {
    stopDwell();
    const threads = payload.threads || [];
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="c2" data-ta-pane="list">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>短信</strong><span>系统短信风</span></div>
          <span></span>
        </header>
        ${status === "generating" ? `<div class="ta-progress" role="status"><i></i><span>正在加载…</span></div>` : ""}
        <div class="ta-sub-scroll" data-ta-scroll>
          ${!threads.length
            ? `<div class="ta-empty ta-empty--soft">
                <div class="ta-empty__wash" aria-hidden="true"></div>
                <strong>${status === "failed" ? "暂时打不开" : "今天还没有更新"}</strong>
                <p>过一会儿再来看看ta留下的痕迹。</p>
              </div>`
            : threads.map((t) => `
              <button type="button" class="ta-sms-row" data-ta-sms="${escapeHtml(t.id)}">
                <span class="ta-avatar ta-avatar--mono" aria-hidden="true">${escapeHtml(monogram(t.contactName))}</span>
                <span class="ta-im-row__body">
                  <strong>${escapeHtml(t.contactName)}</strong>
                  <em class="ta-sms-hint">${escapeHtml(t.contactHint)}</em>
                  <em>${escapeHtml(t.lastPreview)}</em>
                </span>
                <span class="ta-im-row__meta">
                  <time>${escapeHtml(formatShortTime(t.lastAt))}</time>
                  ${t.unread > 0 ? `<i class="ta-badge">${t.unread}</i>` : ""}
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
      subApp: "c2",
      summary: `用户打开了${ctx.character?.name || "TA"}的短信`,
    });
  }

  function paintDetail(threadId) {
    stopDwell();
    const thread = (payload.threads || []).find((t) => t.id === threadId);
    const messages = payload.messagesByThread?.[threadId] || [];
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="c2" data-ta-pane="detail">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div>
            <strong>${escapeHtml(thread?.contactName || "短信")}</strong>
            <span>${escapeHtml(thread?.contactHint || "")}</span>
          </div>
          <span></span>
        </header>
        <div class="ta-chat-scroll ta-sms-chat" data-ta-scroll>
          ${messages.map((m) => `
            <div class="ta-sms-bubble ${m.direction === "out" ? "is-out" : "is-in"}">
              <p>${escapeHtml(m.body)}</p>
            </div>
          `).join("") || `<p class="ta-empty-inline">还没有短信</p>`}
        </div>
      </div>
    `;
    refreshIcons();
    const lastIn = [...messages].reverse().find((m) => m.direction === "in");
    const excerpt = lastIn?.body?.slice(0, 80) || "";
    recordSidewriteEvent({
      characterId: ctx.characterId,
      action: "view_sms",
      subApp: "c2",
      targetId: threadId,
      targetTitle: thread?.contactName || "",
      excerpt,
      summary: `用户查看了短信中与${thread?.contactName || "联系人"}的对话`,
    });
    cancelDwell = startDwellTimer({
      characterId: ctx.characterId,
      subApp: "c2",
      targetId: threadId,
      targetTitle: thread?.contactName,
      excerpt,
      summary: `用户在短信「${thread?.contactName || ""}」停留了一会儿`,
    });
  }

  const onClick = (event) => {
    if (event.target.closest("[data-ta-generate]")) {
      onGenerate();
      return;
    }
    if (event.target.closest("[data-ta-nav-back]")) {
      const pane = root.querySelector("[data-ta-pane]")?.dataset.taPane;
      if (pane === "detail") ctx.onBack?.(listScroll);
      else ctx.onBackToDesktop?.();
      return;
    }
    const id = event.target.closest("[data-ta-sms]")?.dataset.taSms;
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
