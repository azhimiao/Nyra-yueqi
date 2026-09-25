import { escapeHtml } from "../../../lib/utils.js";
import { refreshIcons } from "../../../lib/icons.js";
import { projectBrowserVm, projectBrowserDetail } from "../../../life/projections.js";
import { observeEvidence } from "../../daypack-access.js";
import { recordSidewriteEvent, startDwellTimer } from "../../projection.js";
import { crossLinksHtml, formatShortTime, softEmptyHtml } from "../shared.js";

export function mountBrowserApp(root, ctx) {
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
    const vm = projectBrowserVm(pack());
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="browser" data-ta-pane="list">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>浏览</strong><span>${vm.count} 条记录</span></div>
          <span></span>
        </header>
        <div class="ta-sub-scroll" data-ta-scroll>
          ${!vm.groups.length
            ? softEmptyHtml({ title: "还没有浏览记录" })
            : vm.groups.map((g) => `
              <section class="ta-browser-group">
                <h3>${escapeHtml(g.day)}</h3>
                ${g.items.map((item) => `
                  <button type="button" class="ta-browser-row" data-ta-browser="${escapeHtml(item.id)}">
                    <strong>${escapeHtml(item.title)}</strong>
                    <em>${escapeHtml(item.snippet)}</em>
                    <time>${escapeHtml(item.timeLabel)}</time>
                  </button>
                `).join("")}
              </section>
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
      subApp: "browser",
      summary: `用户打开了${ctx.character?.name || "TA"}的浏览记录`,
    });
  }

  function paintDetail(id) {
    stopDwell();
    const dayPack = pack();
    const detail = projectBrowserDetail(dayPack, id);
    const item = detail?.item;
    if (item && dayPack) {
      observeEvidence({
        characterId: ctx.characterId,
        dayPackId: dayPack.id,
        evidenceId: item.id,
        dwellMs: 0,
        discoverable: item.discoverable,
      });
      ctx.onObserved?.();
    }
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="browser" data-ta-pane="detail">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>页面</strong><span>${escapeHtml(formatShortTime(item?.occurredAt))}</span></div>
          <span></span>
        </header>
        <div class="ta-sub-scroll" data-ta-scroll>
          <article class="ta-browser-detail">
            <h2>${escapeHtml(item?.title || "")}</h2>
            <p>${escapeHtml(item?.snippet || "")}</p>
          </article>
          ${crossLinksHtml(detail?.linked || [])}
        </div>
      </div>
    `;
    refreshIcons();
    recordSidewriteEvent({
      characterId: ctx.characterId,
      action: "view_page",
      subApp: "browser",
      targetId: id,
      targetTitle: item?.title || "",
      summary: `用户查看了浏览「${item?.title || ""}」`,
    });
    cancelDwell = startDwellTimer({
      characterId: ctx.characterId,
      subApp: "browser",
      targetId: id,
      targetTitle: item?.title,
      summary: `用户在浏览「${item?.title || ""}」停留了一会儿`,
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
    const id = event.target.closest("[data-ta-browser]")?.dataset.taBrowser;
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
