/**
 * 账号 / 门禁 / 成年审核 prefs（F7 H3/H4/H6）
 */

export const GATE_PREFS_KEY = "yueqi.phone.gate.v1";

export const DEFAULT_GATE_PREFS = Object.freeze({
  localMode: true,
  cloudGateEnabled: false,
  cloudGateEndpoint: "",
  gateSessionToken: "",
  ageGateEnabled: false,
  birthYear: null,
  ageVerified: false,
  cloudCatalogEnabled: false,
  cloudCatalogEndpoint: "",
  reportSyncEnabled: false,
  reportSyncEndpoint: "",
  localChatAssistantEnabled: false,
});

/**
 * @param {object} raw
 */
export function normalizeGatePrefs(raw = {}) {
  const birthYearRaw = raw.birthYear;
  const birthYear = birthYearRaw == null || birthYearRaw === ""
    ? null
    : Number(birthYearRaw);
  return {
    localMode: true,
    cloudGateEnabled: false,
    cloudGateEndpoint: String(raw.cloudGateEndpoint || "").trim(),
    gateSessionToken: String(raw.gateSessionToken || ""),
    ageGateEnabled: Boolean(raw.ageGateEnabled),
    birthYear: Number.isFinite(birthYear) ? birthYear : null,
    ageVerified: Boolean(raw.ageVerified),
    cloudCatalogEnabled: Boolean(raw.cloudCatalogEnabled),
    cloudCatalogEndpoint: String(raw.cloudCatalogEndpoint || "").trim(),
    reportSyncEnabled: Boolean(raw.reportSyncEnabled),
    reportSyncEndpoint: String(raw.reportSyncEndpoint || "").trim(),
    localChatAssistantEnabled: Boolean(raw.localChatAssistantEnabled),
  };
}

export function loadGatePrefs() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(GATE_PREFS_KEY) || "{}");
    return normalizeGatePrefs(raw && typeof raw === "object" ? raw : {});
  } catch {
    return normalizeGatePrefs({});
  }
}

export function saveGatePrefs(patch = {}) {
  const next = normalizeGatePrefs({ ...loadGatePrefs(), ...patch });
  // localMode on → force cloud gate off for consistency
  if (next.localMode) {
    next.cloudGateEnabled = false;
  }
  window.localStorage.setItem(GATE_PREFS_KEY, JSON.stringify(next));
  return next;
}

/**
 * @param {{ birthYear: number|null, confirmed: boolean }} input
 */
export function computeAgeVerified(input = {}) {
  const year = Number(input.birthYear);
  const currentYear = new Date().getFullYear();
  if (!Number.isFinite(year) || year < 1900 || year > currentYear) return false;
  if (!input.confirmed) return false;
  return year <= currentYear - 18;
}

/**
 * Can install mature-rated extension?
 */
export function canInstallMatureContent(prefs = loadGatePrefs()) {
  if (!prefs.ageGateEnabled) return true;
  return Boolean(prefs.ageVerified);
}

/**
 * Cloud discover tab requires login when cloud gate on.
 */
export function requiresGateLogin(_prefs = loadGatePrefs()) {
  return false;
}

export function exportGatePrefsBag() {
  const prefs = loadGatePrefs();
  return {
    ...prefs,
    // sensitive — backup may redact
    gateSessionToken: prefs.gateSessionToken ? "[redacted]" : "",
  };
}

export function importGatePrefsBag(payload = {}) {
  const next = normalizeGatePrefs(payload);
  // Never restore a live session token from backup silently
  next.gateSessionToken = "";
  window.localStorage.setItem(GATE_PREFS_KEY, JSON.stringify(next));
  return next;
}

export function mockGateLogin({ email = "" } = {}) {
  const token = `mock-${Date.now().toString(36)}-${String(email || "anon").slice(0, 12)}`;
  return saveGatePrefs({
    localMode: true,
    cloudGateEnabled: false,
    gateSessionToken: token,
  });
}

export function mockGateLogout() {
  return saveGatePrefs({ gateSessionToken: "" });
}
