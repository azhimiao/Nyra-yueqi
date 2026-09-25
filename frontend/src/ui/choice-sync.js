/**
 * 把隐藏 select 同步成芯片/分段按钮，保留现有 change 监听。
 * 标记：select[data-choice-id] + [data-choice-for] 内的 button[data-choice]
 */

function buttonsIn(group) {
  return [...group.querySelectorAll("[data-choice]")];
}

export function syncChoiceGroup(group, select = findSelectFor(group)) {
  if (!group || !select) return;
  const value = String(select.value ?? "");
  const disabled = Boolean(select.disabled);
  group.classList.toggle("is-disabled", disabled);
  group.setAttribute("aria-disabled", disabled ? "true" : "false");
  buttonsIn(group).forEach((button) => {
    const active = String(button.dataset.choice ?? "") === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-checked", active ? "true" : "false");
    button.disabled = disabled;
    button.tabIndex = disabled ? -1 : 0;
  });
}

function findSelectFor(group) {
  const id = group.dataset.choiceFor;
  if (!id) return null;
  return document.querySelector(`[data-choice-id="${id}"]`);
}

export function rebuildChoiceButtons(group, options, { selected } = {}) {
  if (!group) return;
  group.innerHTML = options
    .map(
      ({ value, label }) =>
        `<button type="button" role="radio" data-choice="${escapeAttr(value)}">${escapeHtml(label)}</button>`
    )
    .join("");
  const select = findSelectFor(group);
  if (select && selected != null) select.value = selected;
  syncChoiceGroup(group, select);
}

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function wireChoiceGroups(root = document) {
  root.querySelectorAll("[data-choice-for]").forEach((group) => {
    if (group.dataset.choiceWired === "1") return;
    group.dataset.choiceWired = "1";
    const select = findSelectFor(group);
    if (!select) return;

    group.addEventListener("click", (event) => {
      const button = event.target.closest("[data-choice]");
      if (!button || !group.contains(button) || button.disabled) return;
      const next = button.dataset.choice ?? "";
      if (select.value === next) return;
      select.value = next;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncChoiceGroup(group, select);
    });

    select.addEventListener("change", () => syncChoiceGroup(group, select));
    syncChoiceGroup(group, select);
  });
}

export function refreshChoiceGroup(choiceId) {
  const group = document.querySelector(`[data-choice-for="${choiceId}"]`);
  const select = document.querySelector(`[data-choice-id="${choiceId}"]`);
  syncChoiceGroup(group, select);
}
