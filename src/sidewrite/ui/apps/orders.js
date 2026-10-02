import { escapeHtml } from "../../../lib/utils.js";
import { refreshIcons } from "../../../lib/icons.js";
import { projectOrdersVm, projectOrderDetail } from "../../../life/projections.js";
import { observeEvidence } from "../../daypack-access.js";
import { recordSidewriteEvent, startDwellTimer } from "../../projection.js";
import { crossLinksHtml, formatShortTime, softEmptyHtml } from "../shared.js";

export function mountOrdersApp(root, ctx) {
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
    const vm = projectOrdersVm(pack());
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="orders" data-ta-pane="list">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>订单</strong><span>${vm.count} 笔 · 栖币记录</span></div>
          <span></span>
        </header>
        <div class="ta-sub-scroll" data-ta-scroll>
          ${!vm.orders.length
            ? softEmptyHtml({ title: "还没有订单" })
            : vm.orders.map((o) => `
              <button type="button" class="ta-order-card" data-ta-order="${escapeHtml(o.id)}">
                <span class="ta-order-card__status">${escapeHtml(o.status)}</span>
                <strong>${escapeHtml(o.title)}</strong>
                <em>${escapeHtml(o.content)}</em>
                <time>${escapeHtml(formatShortTime(o.occurredAt))}</time>
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
      subApp: "orders",
      summary: `用户打开了${ctx.character?.name || "TA"}的订单`,
    });
  }

  function paintDetail(id) {
    stopDwell();
    const dayPack = pack();
    const detail = projectOrderDetail(dayPack, id);
    const order = detail?.order;
    if (order && dayPack) {
      observeEvidence({
        characterId: ctx.characterId,
        dayPackId: dayPack.id,
        evidenceId: order.id,
        dwellMs: 0,
        discoverable: order.discoverable,
      });
      ctx.onObserved?.();
    }
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="orders" data-ta-pane="detail">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>订单详情</strong><span>${escapeHtml(order?.status || "")}</span></div>
          <span></span>
        </header>
        <div class="ta-sub-scroll" data-ta-scroll>
          <article class="ta-order-detail">
            <span class="ta-order-card__status">${escapeHtml(order?.status || "")}</span>
            <h2>${escapeHtml(order?.title || "")}</h2>
            <p>${escapeHtml(order?.content || "")}</p>
            <p class="ta-order-note">${escapeHtml(order?.currencyNote || "栖币记录 · 非真实支付")}</p>
            <time>${escapeHtml(formatShortTime(order?.occurredAt))}</time>
          </article>
          ${crossLinksHtml(detail?.linked || [])}
        </div>
      </div>
    `;
    refreshIcons();
    recordSidewriteEvent({
      characterId: ctx.characterId,
      action: "view_order",
      subApp: "orders",
      targetId: id,
      targetTitle: order?.title || "",
      summary: `用户查看了订单「${order?.title || ""}」`,
    });
    cancelDwell = startDwellTimer({
      characterId: ctx.characterId,
      subApp: "orders",
      targetId: id,
      targetTitle: order?.title,
      summary: `用户在订单「${order?.title || ""}」停留了一会儿`,
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
    const id = event.target.closest("[data-ta-order]")?.dataset.taOrder;
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
