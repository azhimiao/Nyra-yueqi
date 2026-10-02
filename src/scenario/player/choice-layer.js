/** Choice layer — bottom choices without pushing the stage away. */

import { escapeHtml } from "../../lib/utils.js";
import { refreshIcons } from "../../lib/icons.js";

/**
 * @param {HTMLElement} host
 * @param {{ onChoice?: (choice: { id: string, text: string }) => void }} [deps]
 */
export function createChoiceLayer(host, deps = {}) {
  if (!host) {
    return { render() {}, setBusy() {}, destroy() {} };
  }

  host.classList.add("scenario-choice-layer");
  let busy = false;

  function render(choices = []) {
    const list = Array.isArray(choices) ? choices : [];
    if (!list.length) {
      host.replaceChildren();
      return;
    }
    host.innerHTML = `
      <details class="scenario-suggestions">
        <summary><i data-lucide="wand-sparkles"></i> 帮我想下一步</summary>
        <div class="scenario-suggestions__list">
          ${list.map((choice) => `
            <button type="button"
              class="scenario-choice-btn"
              data-scenario-choice="${escapeHtml(choice.id)}"
              ${busy ? "disabled" : ""}>
              ${escapeHtml(choice.text || choice.label || "")}
            </button>
          `).join("")}
        </div>
      </details>
    `;
    refreshIcons();
  }

  function setBusy(next) {
    busy = Boolean(next);
    host.querySelectorAll("button").forEach((btn) => {
      btn.disabled = busy;
    });
  }

  const onClick = (event) => {
    const btn = event.target.closest("[data-scenario-choice]");
    if (!btn || busy) return;
    const id = btn.dataset.scenarioChoice;
    const text = btn.textContent?.trim() || id;
    deps.onChoice?.({ id, text });
  };

  host.addEventListener("click", onClick);

  return {
    render,
    setBusy,
    destroy() {
      host.removeEventListener("click", onClick);
      host.replaceChildren();
    },
  };
}
