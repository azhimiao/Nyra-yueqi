/**
 * One row model for the capability center: id + label + status + action.
 *
 * Authorization and activation are a single operation, so a row never carries a
 * second app-level enable switch. Kept free of DOM and native imports so the
 * status/action contract stays unit-testable.
 */

export const CAPABILITY_ROW_KIND = Object.freeze({
  "calendar.read": "system",
  "location.current": "system",
  "notification.send": "system",
  microphone: "system",
  camera: "system",
  "desktop.overlay": "system",
  "screen.capture": "session",
  "media.audio": "picker",
  "media.photos": "picker",
});

export const CAPABILITY_ROW_STATE_KEY = Object.freeze({
  on: "mePanels.permissions.stateOn",
  off: "mePanels.permissions.stateOff",
  session: "mePanels.permissions.stateSession",
  restricted: "mePanels.permissions.stateRestricted",
  unavailable: "mePanels.permissions.stateUnavailable",
});

export function capabilityRowKind(id) {
  return CAPABILITY_ROW_KIND[String(id || "").trim()] || "system";
}

/**
 * @returns {{ state: keyof typeof CAPABILITY_ROW_STATE_KEY, action: "request"|"settings"|"session"|"picker"|"none" }}
 */
export function resolveCapabilityRow(kind, status, detail = {}) {
  // Picker capabilities have no persistent permission — the user grants access
  // to the items they pick — so they must never map onto a broad media grant.
  if (kind === "picker") return { state: "session", action: "picker" };
  if (status === "granted") return { state: "on", action: "none" };
  if (status === "unsupported") return { state: "unavailable", action: "none" };
  // The OS re-asks every session, so claiming a permanent grant would be a lie.
  if (kind === "session") return { state: "session", action: "session" };
  const restricted = status === "denied" && Boolean(
    detail?.needsSettings
    || detail?.canAskAgain === false
    || detail?.status === "OS_DENIED_PERMANENTLY",
  );
  if (restricted) return { state: "restricted", action: "settings" };
  return { state: "off", action: "request" };
}
