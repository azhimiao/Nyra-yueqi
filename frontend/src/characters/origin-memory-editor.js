/**
 * Shared origin-memory editor markup for App identity + phone profile.
 */

import { t } from "../i18n/index.js";
import { escapeHtml } from "../lib/utils.js";
import {
  emptyOriginMemoryDraft,
  isProtectedBuiltinOriginId,
  listOriginMemories,
  originDraftHasContent,
  replaceOriginMemories,
  toOriginMemoryDraft as toDraft,
} from "./origin-memories.js";

export function toOriginMemoryDraft(row) {
  return toDraft(row);
}

function selected(value, expected) {
  return value === expected ? " selected" : "";
}

export function originMemoryRowMarkup(draft = emptyOriginMemoryDraft(), { expanded = false } = {}) {
  const row = draft && typeof draft === "object" ? draft : emptyOriginMemoryDraft();
  const title = String(row.title || "").trim();
  const summary = title || t("character.originMemoryUntitled");
  const open = expanded || !row.id ? " open" : "";
  return `
    <details class="origin-memory-card"${open} data-origin-memory-row data-origin-id="${escapeHtml(row.id || "")}">
      <summary class="origin-memory-card__summary">
        <span data-origin-summary-title>${escapeHtml(summary)}</span>
      </summary>
      <div class="origin-memory-card__fields">
        <label class="origin-memory-field">
          <span>${escapeHtml(t("character.originMemoryTitle"))}</span>
          <input type="text" maxlength="80" data-origin-title value="${escapeHtml(title)}" autocomplete="off" />
        </label>
        <label class="origin-memory-field">
          <span>${escapeHtml(t("character.originMemoryBody"))}</span>
          <textarea rows="5" data-origin-body placeholder="${escapeHtml(t("character.originMemoryBodyPlaceholder"))}">${escapeHtml(row.rawText || "")}</textarea>
        </label>
        <div class="origin-memory-card__attrs">
          <label class="origin-memory-field">
            <span>${escapeHtml(t("character.originMemoryTags"))}</span>
            <input type="text" data-origin-tags value="${escapeHtml(row.tagsText || "")}" placeholder="${escapeHtml(t("character.originMemoryTagsPlaceholder"))}" autocomplete="off" />
          </label>
          <label class="origin-memory-field">
            <span>${escapeHtml(t("character.originMemoryWeight"))}</span>
            <select data-origin-weight>
              <option value="low"${selected(row.weightLevel, "low")}>${escapeHtml(t("character.originMemoryWeightLow"))}</option>
              <option value="medium"${selected(row.weightLevel, "medium")}>${escapeHtml(t("character.originMemoryWeightMedium"))}</option>
              <option value="high"${selected(row.weightLevel, "high")}>${escapeHtml(t("character.originMemoryWeightHigh"))}</option>
            </select>
          </label>
          <label class="origin-memory-field">
            <span>${escapeHtml(t("character.originMemoryWhen"))}</span>
            <input type="date" data-origin-when value="${escapeHtml(row.when || "")}" />
          </label>
        </div>
        <div class="origin-memory-card__checks">
          <label class="origin-memory-check">
            <input type="checkbox" data-origin-pinned ${row.pinned ? "checked" : ""} />
            <span>${escapeHtml(t("character.originMemoryPinned"))}</span>
          </label>
          <label class="origin-memory-check">
            <input type="checkbox" data-origin-searchable ${row.searchable !== false ? "checked" : ""} />
            <span>${escapeHtml(t("character.originMemorySearchable"))}</span>
          </label>
        </div>
        ${isProtectedBuiltinOriginId(row.id) ? "" : `<button type="button" class="origin-memory-remove" data-origin-memory-remove>${escapeHtml(t("character.originMemoryRemove"))}</button>`}
      </div>
    </details>
  `;
}

export function originMemoryEditorInnerMarkup(drafts = []) {
  const rows = Array.isArray(drafts) && drafts.length
    ? drafts
    : [emptyOriginMemoryDraft()];
  const filled = rows.filter(originDraftHasContent).length;
  return `
    <p class="origin-memory-count">${escapeHtml(t("character.originMemoriesCount", { n: filled }))}</p>
    <div class="origin-memory-list" data-origin-memory-list>
      ${rows.map((row) => originMemoryRowMarkup(row, { expanded: !row.id })).join("")}
    </div>
    <button type="button" class="origin-memory-add" data-origin-memory-add>${escapeHtml(t("character.originMemoryAdd"))}</button>
  `;
}

export function collectOriginMemoryDrafts(container) {
  if (!container?.querySelectorAll) return [];
  return Array.from(container.querySelectorAll("[data-origin-memory-row]")).map((row) => ({
    id: String(row.dataset.originId || "").trim(),
    title: String(row.querySelector("[data-origin-title]")?.value || "").trim(),
    rawText: String(row.querySelector("[data-origin-body]")?.value || "").trim(),
    tagsText: String(row.querySelector("[data-origin-tags]")?.value || "").trim(),
    weightLevel: String(row.querySelector("[data-origin-weight]")?.value || "medium").trim(),
    pinned: Boolean(row.querySelector("[data-origin-pinned]")?.checked),
    searchable: row.querySelector("[data-origin-searchable]")?.checked !== false,
    when: String(row.querySelector("[data-origin-when]")?.value || "").trim(),
  }));
}

export function bindOriginMemoryEditor(root, { onDirty } = {}) {
  if (!root || root.dataset.originMemoryBound === "1") return;
  root.dataset.originMemoryBound = "1";
  root.addEventListener("click", (event) => {
    const add = event.target.closest("[data-origin-memory-add]");
    if (add && root.contains(add)) {
      event.preventDefault();
      const list = add.closest("[data-origin-memory-editor]")?.querySelector("[data-origin-memory-list]")
        || root.querySelector("[data-origin-memory-list]");
      if (!list) return;
      list.insertAdjacentHTML("beforeend", originMemoryRowMarkup(emptyOriginMemoryDraft(), { expanded: true }));
      onDirty?.(event);
      return;
    }
    const remove = event.target.closest("[data-origin-memory-remove]");
    if (remove && root.contains(remove)) {
      event.preventDefault();
      remove.closest("[data-origin-memory-row]")?.remove();
      onDirty?.(event);
    }
  });
  const mark = (event) => {
    if (!event.target.closest("[data-origin-memory-row]")) return;
    const row = event.target.closest("[data-origin-memory-row]");
    const title = String(row.querySelector("[data-origin-title]")?.value || "").trim();
    const summary = row.querySelector("[data-origin-summary-title]");
    if (summary) summary.textContent = title || t("character.originMemoryUntitled");
    onDirty?.(event);
  };
  root.addEventListener("input", mark);
  root.addEventListener("change", mark);
}

export async function hydrateOriginMemoryEditor(container, characterId) {
  if (!container) return { ok: false, reason: "missing_container" };
  container.dataset.originMemoriesReady = "0";
  container.dataset.originCharacterId = String(characterId || "");
  const rows = characterId ? await listOriginMemories(characterId) : [];
  container.innerHTML = originMemoryEditorInnerMarkup(rows.map(toOriginMemoryDraft));
  container.dataset.originMemoriesReady = "1";
  return { ok: true, count: rows.length };
}

export async function commitOriginMemoryEditor(container, characterId, extras = {}) {
  if (!container) {
    return { ok: true, skipped: true, reason: "missing_container", saved: [], deleted: [] };
  }
  const ready = container.dataset.originMemoriesReady === "1";
  const drafts = collectOriginMemoryDrafts(container);
  return replaceOriginMemories(characterId, drafts, {
    ready,
    role: extras.role,
  });
}
