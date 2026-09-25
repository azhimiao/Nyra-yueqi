/**
 * Seed default experience binding slots (inherit global when empty).
 * Call once from phone shell boot if desired; safe to call repeatedly.
 */

import { readExperienceBindings, writeExperienceBinding } from "./projections-feed.js";

const DEFAULT_SLOTS = Object.freeze([
  "scroll",
  "story",
  "adventure",
  "cocreate",
  "games",
]);

export function ensureExperienceBindingSlots() {
  const bag = readExperienceBindings();
  for (const appId of DEFAULT_SLOTS) {
    if (!bag[appId]) {
      writeExperienceBinding(appId, {
        inheritGlobal: true,
        model: "",
        presetId: "",
        note: "未单独绑定，使用全局接口",
      });
    }
  }
  return readExperienceBindings();
}
