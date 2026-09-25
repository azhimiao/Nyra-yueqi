import { escapeHtml } from "../../../lib/utils.js";
import { refreshIcons } from "../../../lib/icons.js";
import { projectCalendarVm, projectCalendarDetail } from "../../../life/projections.js";
import { observeEvidence } from "../../daypack-access.js";
import { recordSidewriteEvent, startDwellTimer } from "../../projection.js";
import { crossLinksHtml, formatShortTime, softEmptyHtml } from "../shared.js";

export function mountCalendarApp(root, ctx) {
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
    const vm = projectCalendarVm(pack());
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="calendar" data-ta-pane="list">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>日历</strong><span>${escapeHtml(vm.localDate || "本周")} · ${vm.count} 项</span></div>
          <span></span>
        </header>
        <div class="ta-sub-scroll" data-ta-scroll>
          ${!vm.events.length
            ? softEmptyHtml({ title: "本周还没有日程" })
            : vm.events.map((e) => `
              <button type="button" class="ta-cal-row" data-ta-cal="${escapeHtml(e.id)}">
                <span class="ta-cal-row__time">${escapeHtml(e.timeLabel)}</span>
                <span class="ta-cal-row__body">
                  <strong>${escapeHtml(e.title)}</strong>
                  <em>${escapeHtml(e.location || e.content)}</em>
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
      subApp: "calendar",
      summary: `用户打开了${ctx.character?.name || "TA"}的日历`,
    });
  }

  function paintDetail(id) {
    stopDwell();
    const dayPack = pack();
    const detail = projectCalendarDetail(dayPack, id);
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
      <div class="ta-subapp" data-ta-app="calendar" data-ta-pane="detail">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>日程</strong><span>${escapeHtml(formatShortTime(item?.occurredAt))}</span></div>
          <span></span>
        </header>
        <div class="ta-sub-scroll" data-ta-scroll>
          <article class="ta-cal-detail">
            <h2>${escapeHtml(item?.title || "")}</h2>
            <p>${escapeHtml(item?.content || "")}</p>
            <dl>
              <div><dt>地点</dt><dd>${escapeHtml(item?.location || "—")}</dd></div>
              <div><dt>参与</dt><dd>${escapeHtml((item?.participants || []).join("、") || "—")}</dd></div>
              <div><dt>时间</dt><dd>${escapeHtml(formatShortTime(item?.occurredAt))}</dd></div>
            </dl>
          </article>
          ${crossLinksHtml(detail?.linked || [])}
        </div>
      </div>
    `;
    refreshIcons();
    recordSidewriteEvent({
      characterId: ctx.characterId,
      action: "view_event",
      subApp: "calendar",
      targetId: id,
      targetTitle: item?.title || "",
      summary: `用户查看了日程「${item?.title || ""}」`,
    });
    cancelDwell = startDwellTimer({
      characterId: ctx.characterId,
      subApp: "calendar",
      targetId: id,
      targetTitle: item?.title,
      summary: `用户在日程「${item?.title || ""}」停留了一会儿`,
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
    const id = event.target.closest("[data-ta-cal]")?.dataset.taCal;
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
