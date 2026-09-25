/** Stage controls — pause / finale / free-say. */

import { refreshIcons } from "../../lib/icons.js";

/**
 * @param {HTMLElement} barHost
 * @param {HTMLElement} formHost
 * @param {{
 *   onPause?: () => void,
 *   onFinale?: () => void,
 *   onFreeSay?: (text: string) => void,
 *   onBranches?: () => void,
 * }} [deps]
 */
export function createControls(barHost, formHost, deps = {}) {
  if (barHost) {
    barHost.innerHTML = `
      <button type="button" class="scenario-stage-bar__back" data-scenario-pause data-scenario-to-chapters aria-label="返回开场">
        <i data-lucide="chevron-left"></i>
      </button>
      <strong data-stage-title>台上</strong>
      <div class="scenario-stage-bar__actions">
        <button type="button" data-scenario-branches aria-label="另写一条可能" title="另写一条可能"><i data-lucide="git-branch"></i></button>
        <button type="button" data-scenario-finale aria-label="收进共同回忆" title="收进共同回忆"><i data-lucide="bookmark-check"></i></button>
      </div>
    `;
  }

  if (formHost) {
    formHost.innerHTML = `
      <textarea rows="1" maxlength="800" placeholder="写下你说的话、动作，或藏在心里的念头…" data-scenario-input aria-label="写下这一刻"></textarea>
      <button type="submit" aria-label="发送"><i data-lucide="arrow-up"></i></button>
    `;
    formHost.classList.add("scenario-composer");
  }
  refreshIcons();

  const onBarClick = (event) => {
    if (event.target.closest("[data-scenario-pause]")) {
      deps.onPause?.();
      return;
    }
    if (event.target.closest("[data-scenario-branches]")) {
      deps.onBranches?.();
      return;
    }
    if (event.target.closest("[data-scenario-finale]")) {
      deps.onFinale?.();
    }
  };

  const onSubmit = (event) => {
    event.preventDefault();
    const input = formHost?.querySelector("[data-scenario-input]");
    const text = String(input?.value || "").trim();
    if (!text) return;
    if (input) input.value = "";
    deps.onFreeSay?.(text);
  };

  barHost?.addEventListener("click", onBarClick);
  formHost?.addEventListener("submit", onSubmit);

  return {
    setTitle(title) {
      const el = barHost?.querySelector("[data-stage-title]");
      if (el) el.textContent = title || "台上";
    },
    setDisabled(disabled) {
      formHost?.querySelectorAll("input,textarea,button").forEach((el) => {
        el.disabled = Boolean(disabled);
      });
      barHost?.querySelectorAll("button").forEach((el) => {
        el.disabled = Boolean(disabled);
      });
    },
    destroy() {
      barHost?.removeEventListener("click", onBarClick);
      formHost?.removeEventListener("submit", onSubmit);
    },
  };
}
