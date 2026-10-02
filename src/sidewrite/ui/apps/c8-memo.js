import { escapeHtml } from "../../../lib/utils.js";
import { refreshIcons } from "../../../lib/icons.js";
import { recordSidewriteEvent, startDwellTimer } from "../../projection.js";
import { generateAppPayload } from "../../generate/runner.js";

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function mountC8Memo(root, ctx) {
  if (!root) return { destroy() {}, showList() {}, showDetail() {} };

  let payload = ctx.payload || { notes: [] };
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
      const result = await generateAppPayload(ctx.characterId, "c8", {
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
    const notes = payload.notes || [];
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="c8" data-ta-pane="list">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>备忘</strong><span>只读笔记</span></div>
          <span></span>
        </header>
        ${status === "generating" ? `<div class="ta-progress" role="status"><i></i><span>正在加载…</span></div>` : ""}
        <div class="ta-sub-scroll" data-ta-scroll>
          ${!notes.length
            ? `<div class="ta-empty ta-empty--soft">
                <div class="ta-empty__wash" aria-hidden="true"></div>
                <strong>${status === "failed" ? "暂时打不开" : "今天还没有更新"}</strong>
                <p>过一会儿再来看看ta留下的痕迹。</p>
              </div>`
            : notes.map((n) => `
              <button type="button" class="ta-memo-card ${n.pinned ? "is-pinned" : ""}" data-ta-note="${escapeHtml(n.id)}">
                ${n.pinned ? `<span class="ta-memo-pin" aria-hidden="true">📌</span>` : ""}
                <strong>${escapeHtml(n.title)}</strong>
                <em>${escapeHtml(String(n.body || "").replace(/\s+/g, " ").slice(0, 80))}</em>
                <time>${escapeHtml(formatDate(n.updatedAt))}</time>
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
      subApp: "c8",
      summary: `用户打开了${ctx.character?.name || "TA"}的备忘`,
    });
  }

  function paintDetail(noteId) {
    stopDwell();
    const note = (payload.notes || []).find((n) => n.id === noteId);
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="c8" data-ta-pane="detail">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>备忘</strong><span>只读</span></div>
          <span></span>
        </header>
        <div class="ta-sub-scroll ta-memo-detail" data-ta-scroll>
          <h2>${escapeHtml(note?.title || "备忘")}</h2>
          <pre>${escapeHtml(note?.body || "")}</pre>
        </div>
      </div>
    `;
    refreshIcons();
    recordSidewriteEvent({
      characterId: ctx.characterId,
      action: "view_note",
      subApp: "c8",
      targetId: noteId,
      targetTitle: note?.title || "",
      excerpt: String(note?.body || "").slice(0, 80),
      summary: `用户查看了备忘「${note?.title || ""}」`,
    });
    cancelDwell = startDwellTimer({
      characterId: ctx.characterId,
      subApp: "c8",
      targetId: noteId,
      targetTitle: note?.title,
      summary: `用户在备忘「${note?.title || ""}」停留了一会儿`,
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
    const id = event.target.closest("[data-ta-note]")?.dataset.taNote;
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
    showDetail(noteId) {
      paintDetail(noteId);
    },
    destroy() {
      stopDwell();
      root.removeEventListener("click", onClick);
    },
  };
}
