import { escapeHtml } from "../../lib/utils.js";
import { TA_APP_META } from "../constants.js";

export function formatShortTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function dayLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 周${week}`;
}

/**
 * @param {Array<{ id: string, app: string, title: string, content?: string }>} linked
 */
export function crossLinksHtml(linked = []) {
  if (!linked.length) return "";
  return `
    <div class="ta-crosslinks" data-ta-crosslinks>
      <strong>相关痕迹</strong>
      ${linked.map((item) => {
        const meta = TA_APP_META[item.app] || { label: item.app };
        return `
          <button type="button" class="ta-crosslink" data-ta-cross-app="${escapeHtml(item.app)}" data-ta-cross-id="${escapeHtml(item.id)}">
            <span>${escapeHtml(meta.label)}</span>
            <em>${escapeHtml(item.title)}</em>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

/**
 * Soft empty — never "点击生成".
 * @param {{ title?: string, body?: string }} opts
 */
export function softEmptyHtml(opts = {}) {
  return `
    <div class="ta-empty ta-empty--soft">
      <div class="ta-empty__wash" aria-hidden="true"></div>
      <strong>${escapeHtml(opts.title || "今天还没有更新")}</strong>
      <p>${escapeHtml(opts.body || "这里只展示真实留下的痕迹；没有内容时保持空白。")}</p>
    </div>
  `;
}

export function photoStyle(assetRef) {
  if (!assetRef) return "";
  return `background-image:url('${escapeHtml(assetRef)}')`;
}
