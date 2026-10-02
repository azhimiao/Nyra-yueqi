/**
 * Shared phone control primitives: switch / segmented / slider helpers.
 */

export function switchHtml({ label, labelKey, checked = false, attrs = "", rowClass = "" }) {
  const extra = rowClass ? ` ${rowClass}` : "";
  const labelSpan = labelKey
    ? `<span data-phone-i18n="${labelKey}">${label || ""}</span>`
    : `<span>${label || ""}</span>`;
  return `
    <div class="mini-switch-row${extra}">
      ${labelSpan}
      <button type="button" class="mini-switch ${checked ? "is-on" : ""}" role="switch" aria-checked="${checked ? "true" : "false"}" ${attrs}>
        <span class="mini-switch__knob" aria-hidden="true"></span>
      </button>
    </div>
  `;
}

export function setSwitchState(button, on) {
  if (!button) return;
  const next = Boolean(on);
  button.classList.toggle("is-on", next);
  button.setAttribute("aria-checked", String(next));
}

export function toggleSwitch(button) {
  const next = button.getAttribute("aria-checked") !== "true";
  setSwitchState(button, next);
  return next;
}

export function isSwitchOn(button) {
  return button?.getAttribute("aria-checked") === "true";
}

export function segmentedHtml({ options, activeId, dataAttr }) {
  return `
    <div class="mini-segmented" role="tablist" ${dataAttr || ""}>
      ${options.map((opt) => `
        <button type="button" role="tab" class="mini-segment ${opt.id === activeId ? "is-active" : ""}" data-segment-id="${opt.id}" aria-selected="${opt.id === activeId ? "true" : "false"}">
          ${opt.label}
        </button>
      `).join("")}
    </div>
  `;
}

export function setSegmentedActive(root, id) {
  if (!root) return;
  root.querySelectorAll("[data-segment-id]").forEach((button) => {
    const active = button.dataset.segmentId === id;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

export function timeChipHtml(active = "21:00") {
  const chips = [];
  for (let hour = 8; hour <= 23; hour += 1) {
    const value = `${String(hour).padStart(2, "0")}:00`;
    chips.push(`
      <button type="button" class="mini-time-chip ${value === active ? "is-active" : ""}" data-time-chip="${value}">
        ${value}
      </button>
    `);
  }
  return `<div class="mini-time-rail" data-time-rail>${chips.join("")}</div>`;
}

export function sliderHtml({ label, name, value = 50, index = 0 }) {
  return `
    <label class="mini-slider">
      <span>${label} <em data-range-label="${index}">${value}</em></span>
      <input type="range" min="0" max="100" name="${name}" value="${value}" data-profile-range="${index}" />
    </label>
  `;
}
