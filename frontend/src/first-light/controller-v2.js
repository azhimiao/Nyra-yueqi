/**
 * First Light V2 persistence (Task 3.1).
 * Independent of v1 key `yueqi.firstLight.v1`. Injectable storage.
 */

import {
  canAdvance,
  createDefaultStateV2,
  normalizeStateV2,
  transition,
} from "./state-v2.js";

export const FIRST_LIGHT_V2_KEY = "yueqi.firstLight.v2";
export const FIRST_LIGHT_V1_KEY = "yueqi.firstLight.v1";

export function hasFirstLightDoneV2(options = {}) {
  return createFirstLightControllerV2(options).load().done === true;
}

export function resetFirstLightV2(options = {}) {
  return createFirstLightControllerV2(options).reset();
}

function memoryStorage() {
  const bag = new Map();
  return {
    getItem(key) {
      return bag.has(key) ? bag.get(key) : null;
    },
    setItem(key, value) {
      bag.set(key, String(value));
    },
    removeItem(key) {
      bag.delete(key);
    },
  };
}

function resolveStorage(storage) {
  if (storage && typeof storage.getItem === "function" && typeof storage.setItem === "function") {
    return storage;
  }
  try {
    if (typeof localStorage !== "undefined" && localStorage) return localStorage;
  } catch {
    /* ignore */
  }
  return memoryStorage();
}

export function createFirstLightControllerV2(options = {}) {
  const storage = resolveStorage(options.storage);
  const clock = options.clock;

  function load() {
    try {
      const raw = JSON.parse(storage.getItem(FIRST_LIGHT_V2_KEY) || "null");
      if (!raw || typeof raw !== "object") return createDefaultStateV2(clock);
      return normalizeStateV2(raw, clock);
    } catch {
      return createDefaultStateV2(clock);
    }
  }

  function save(state) {
    const next = normalizeStateV2(state, clock);
    storage.setItem(FIRST_LIGHT_V2_KEY, JSON.stringify(next));
    return next;
  }

  function dispatch(event) {
    return save(transition(load(), event, { clock }));
  }

  function reset() {
    const fresh = createDefaultStateV2(clock);
    storage.setItem(FIRST_LIGHT_V2_KEY, JSON.stringify(fresh));
    return fresh;
  }

  return {
    key: FIRST_LIGHT_V2_KEY,
    load,
    save,
    dispatch,
    reset,
  };
}

/** In-memory helper. Persistence still goes through createFirstLightControllerV2. */
export function createFirstLightMachineV2(initial, opts = {}) {
  let state = initial || createDefaultStateV2(opts.clock);
  function dispatch(event) {
    state = transition(state, event, opts);
    return state;
  }
  return {
    getState: () => state,
    dispatch,
    canAdvance: () => canAdvance(state),
  };
}

export function createControllerV2(options) {
  return createFirstLightControllerV2(options);
}
