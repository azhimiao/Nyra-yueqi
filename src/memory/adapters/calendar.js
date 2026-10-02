/* Open-source tree: the memory pipeline implementation has been removed. */
function removedMemory() {
  const bag = [];
  const proxy = new Proxy(bag, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      if (prop === "length") return 0;
      if (typeof prop === "symbol") return undefined;
      const method = Array.prototype[prop];
      if (typeof method === "function") return method.bind(bag);
      return proxy;
    },
  });
  return proxy;
}

export const CALENDAR_ADAPTER_FEATURE_ID = Object.freeze({});
export const CALENDAR_TIMELINE_PROJECTION_KIND = Object.freeze({});
export function __resetCalendarAdapterRegistrationForTests(..._args) { return removedMemory(); }
export function calendarFeatureMemoryAdapter(..._args) { return removedMemory(); }
export function emitCalendarLifecycle(..._args) { return removedMemory(); }
export function ensureCalendarAdapterRegistered(..._args) { return removedMemory(); }
export function getCalendarSourceRef(..._args) { return removedMemory(); }
export function isUnifiedMemoryAdaptersEnabled(..._args) { return removedMemory(); }
export function onCalendarCommitted(..._args) { return removedMemory(); }
export function submitReminderPreferenceCandidate(..._args) { return removedMemory(); }

