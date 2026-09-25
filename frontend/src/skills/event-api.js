/**
 * Typed skill event API.
 */

import { SKILL_EVENT_TYPES } from "./schema.js";

/**
 * @typedef {(payload: object) => void} SkillEventHandler
 */

/**
 * Create an in-process event bus for skill lifecycle / invoke events.
 */
export function createEventBus() {
  /** @type {Map<string, Set<SkillEventHandler>>} */
  const listeners = new Map();

  return {
    /**
     * @param {string} type
     * @param {SkillEventHandler} handler
     */
    on(type, handler) {
      if (!SKILL_EVENT_TYPES.includes(/** @type {any} */ (type))) {
        return { ok: false, reason: "unknown_event_type", type };
      }
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
      return {
        ok: true,
        off() {
          listeners.get(type)?.delete(handler);
        },
      };
    },

    /**
     * @param {string} type
     * @param {object} [payload]
     */
    emit(type, payload = {}) {
      if (!SKILL_EVENT_TYPES.includes(/** @type {any} */ (type))) {
        return { ok: false, reason: "unknown_event_type", type };
      }
      const set = listeners.get(type);
      if (set) {
        for (const h of set) {
          try {
            h({ type, ...payload, at: new Date().toISOString() });
          } catch {
            /* isolate handler errors */
          }
        }
      }
      return { ok: true, type, listeners: set ? set.size : 0 };
    },

    /** @param {string} type */
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },

    clear() {
      listeners.clear();
    },
  };
}

/**
 * Validate event envelope shape for conformance.
 * @param {unknown} ev
 */
export function validateSkillEvent(ev) {
  if (!ev || typeof ev !== "object") return { ok: false, reason: "not_object" };
  const type = /** @type {any} */ (ev).type;
  if (!SKILL_EVENT_TYPES.includes(type)) return { ok: false, reason: "unknown_event_type" };
  return { ok: true, value: ev };
}
