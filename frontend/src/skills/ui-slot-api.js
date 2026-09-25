/**
 * UI slot API for skill packages (task center / approval / settings).
 * Skills may only render into declared slots; no default-home surface.
 */

import { UI_SLOTS } from "./schema.js";

/**
 * @typedef {{
 *   slot: string,
 *   skillId: string,
 *   title: string,
 *   body: string,
 *   actions?: { id: string, label: string }[],
 * }} UiSlotPayload
 */

/**
 * @param {string} slot
 */
export function isValidUiSlot(slot) {
  return UI_SLOTS.includes(/** @type {any} */ (slot));
}

/**
 * Register a UI contribution if the skill declared the slot.
 * @param {{
 *   skillId: string,
 *   declaredSlots: string[],
 *   payload: UiSlotPayload,
 * }} input
 * @param {Map<string, UiSlotPayload[]>} [registry]
 */
export function contributeUiSlot(input, registry = new Map()) {
  const slot = String(input.payload?.slot || "");
  if (!isValidUiSlot(slot) || slot === "none") {
    return { ok: false, reason: "invalid_slot", slot };
  }
  const declared = Array.isArray(input.declaredSlots) ? input.declaredSlots : [];
  if (!declared.includes(slot)) {
    return { ok: false, reason: "undeclared_ui_slot", slot };
  }
  // Consumer default layer must not receive skill debug surfaces
  if (slot === "settings_panel") {
    const title = String(input.payload.title || "");
    if (/签名|hash|debug|schema/i.test(title)) {
      return { ok: false, reason: "ui_norm_violation", detail: "no_debug_in_settings_title" };
    }
  }

  const entry = {
    slot,
    skillId: String(input.skillId),
    title: String(input.payload.title || "").slice(0, 80),
    body: String(input.payload.body || "").slice(0, 500),
    actions: Array.isArray(input.payload.actions)
      ? input.payload.actions.slice(0, 3).map((a) => ({
        id: String(a.id || "").slice(0, 40),
        label: String(a.label || "").slice(0, 40),
      }))
      : [],
  };

  const list = registry.get(slot) || [];
  list.push(entry);
  registry.set(slot, list);
  return { ok: true, value: entry, registry };
}

/**
 * List contributions for a slot.
 * @param {Map<string, UiSlotPayload[]>} registry
 * @param {string} slot
 */
export function listUiSlotContributions(registry, slot) {
  return registry.get(String(slot)) || [];
}

/**
 * Clear all contributions for a skill (uninstall).
 * @param {Map<string, UiSlotPayload[]>} registry
 * @param {string} skillId
 */
export function clearUiSlotsForSkill(registry, skillId) {
  const id = String(skillId);
  for (const [slot, list] of registry.entries()) {
    registry.set(slot, list.filter((c) => c.skillId !== id));
  }
  return { ok: true };
}
