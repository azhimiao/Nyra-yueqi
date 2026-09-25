import { escapeHtml } from "../../../lib/utils.js";
import { refreshIcons } from "../../../lib/icons.js";
import { projectMemoVm, projectMemoDetail } from "../../../life/projections.js";
import { observeEvidence } from "../../daypack-access.js";
import { recordSidewriteEvent, startDwellTimer } from "../../projection.js";
import { crossLinksHtml, formatShortTime, softEmptyHtml } from "../shared.js";

export function mountMemoApp(root, ctx) {
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

  function paintList() {
    stopDwell();
    const vm = projectMemoVm(pack(), { readIds: ctx.getReadIds?.() || new Set() });
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="memo" data-ta-pane="list">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>备忘</strong><span>${vm.count} 条</span></div>
          <span></span>
        </header>
        <div class="ta-sub-scroll" data-ta-scroll>
          ${!vm.notes.length
            ? softEmptyHtml({ title: "还没有备忘" })
            : vm.notes.map((n) => `
              <button type="button" class="ta-memo-card ${n.pinned ? "is-pinned" : ""}" data-ta-memo="${escapeHtml(n.id)}">
                ${n.pinned ? `<span class="ta-memo-pin" aria-hidden="true">置顶</span>` : ""}
                <strong>${escapeHtml(n.title)}</strong>
                <em>${escapeHtml(n.body)}</em>
                <time>${escapeHtml(formatShortTime(n.occurredAt))}</time>
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
      subApp: "memo",
      summary: `用户打开了${ctx.character?.name || "TA"}的备忘`,
    });
  }

  function paintDetail(id) {
    stopDwell();
    const dayPack = pack();
    const detail = projectMemoDetail(dayPack, id);
    const note = detail?.note;
    if (note && dayPack) {
      observeEvidence({
        characterId: ctx.characterId,
        dayPackId: dayPack.id,
        evidenceId: note.id,
        dwellMs: 0,
        discoverable: note.discoverable,
      });
      ctx.onObserved?.();
    }
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="memo" data-ta-pane="detail">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>备忘</strong><span>${escapeHtml(formatShortTime(note?.occurredAt))}</span></div>
          <span></span>
        </header>
        <div class="ta-sub-scroll ta-memo-detail" data-ta-scroll>
          <h2>${escapeHtml(note?.title || "")}</h2>
          <pre>${escapeHtml(note?.body || "")}</pre>
          ${crossLinksHtml(detail?.linked || [])}
        </div>
      </div>
    `;
    refreshIcons();
    recordSidewriteEvent({
      characterId: ctx.characterId,
      action: "view_note",
      subApp: "memo",
      targetId: id,
      targetTitle: note?.title || "",
      summary: `用户查看了备忘「${note?.title || ""}」`,
    });
    cancelDwell = startDwellTimer({
      characterId: ctx.characterId,
      subApp: "memo",
      targetId: id,
      targetTitle: note?.title,
      summary: `用户在备忘「${note?.title || ""}」停留了一会儿`,
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
      if (pane === "detail") ctx.onBack?.(0);
      else ctx.onBackToDesktop?.();
      return;
    }
    const id = event.target.closest("[data-ta-memo]")?.dataset.taMemo;
    if (id) {
      listScroll = root.querySelector("[data-ta-scroll]")?.scrollTop || 0;
      ctx.onOpenDetail?.(id, listScroll);
    }
  };
  root.addEventListener("click", onClick);

  return {
    showList(_p, _s, scrollTop = 0) {
      listScroll = scrollTop;
      paintList();
    },
    showDetail(id) {
      paintDetail(id);
    },
    destroy() {
      stopDwell();
      root.removeEventListener("click", onClick);
    },
  };
}
