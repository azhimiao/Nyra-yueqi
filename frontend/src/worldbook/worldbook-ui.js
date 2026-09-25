/**
 * Worldbook settings helpers + phone feed (F5 / F2).
 */

import { escapeHtml } from "../lib/utils.js";
import { t } from "../i18n/index.js";
import { SCENE_APP_IDS } from "../prompt/scene-tags.js";
import { listWorldbookEntries } from "./store.js";

function scopeOptions() {
  return [
    { value: "", label: t("mePanels.worldbook.scopeGlobal") },
    ...SCENE_APP_IDS.filter((id) => id !== "qijian").map((id) => ({ value: id, label: id })),
  ];
}

/**
 * Extra fields HTML for a worldbook entry (scopeApps).
 * @param {object} entry
 */
export function worldbookScopeFieldsHtml(entry = {}) {
  const scopes = Array.isArray(entry.scopeApps) ? entry.scopeApps : [];
  const selected = scopes[0] || "";
  return `
    <label><span>${escapeHtml(t("mePanels.worldbook.scope"))}</span>
      <select data-world-scope>
        ${scopeOptions().map(
          (opt) => `<option value="${escapeHtml(opt.value)}"${opt.value === selected ? " selected" : ""}>${escapeHtml(opt.label)}</option>`,
        ).join("")}
      </select>
    </label>
  `;
}

/**
 * Read scopeApps from a .world-entry DOM node.
 * @param {HTMLElement} entry
 */
export function readScopeAppsFromEntry(entry) {
  const select = entry?.querySelector("[data-world-scope]");
  const value = String(select?.value || "").trim();
  return value ? [value] : [];
}

/**
 * Render mini feed (最近命中或置顶).
 * @param {HTMLElement} feed
 * @param {{ query?: string, limit?: number }} [opts]
 */
export async function renderWorldbookMiniFeed(feed, opts = {}) {
  if (!feed) return;
  const limit = opts.limit ?? 3;
  const entries = await listWorldbookEntries();
  const enabled = entries.filter((e) => e.enabled !== false);
  const query = String(opts.query || "");
  let rows = enabled;
  if (query) {
    rows = enabled.filter((e) => (e.triggers || []).some((t) => query.includes(t)));
  }
  rows = rows.slice(0, limit);
  feed.innerHTML = rows.length
    ? rows
        .map(
          (entry) => `
      <article class="mini-book-card">
        <strong>${escapeHtml(entry.title || "条目")}</strong>
        <span>${escapeHtml(entry.category || "")} · P${escapeHtml(String(entry.priority ?? ""))}</span>
      </article>`,
        )
        .join("")
    : '<p class="mini-empty">加第一条设定，让对话更有场景</p>';
}

/**
 * Enhance existing world-entry articles with scope field if missing.
 * @param {ParentNode} root
 */
export function enhanceWorldbookEntriesDom(root = document) {
  root.querySelectorAll(".world-entry").forEach((entry) => {
    if (entry.querySelector("[data-world-scope]")) return;
    const fields = entry.querySelector(".entry-fields");
    if (!fields) return;
    fields.insertAdjacentHTML("beforeend", worldbookScopeFieldsHtml({}));
  });
}
